"""
Script to create a detailed player tracking JSON with enriched data.
Combines tracking data with match metadata and calculates distances between frames.
"""

import json
import math
from pathlib import Path

def load_match_data(match_file):
    """Load match metadata including player info and pitch dimensions."""
    with open(match_file, 'r') as f:
        return json.load(f)

def load_tracking_data(tracking_file):
    """Load JSONL tracking data."""
    data = []
    with open(tracking_file, 'r') as f:
        for line in f:
            if line.strip():
                data.append(json.loads(line))
    return data

def build_player_map(match_data):
    """Create a map of player_id -> player_info for quick lookups."""
    player_map = {}
    for player in match_data.get('players', []):
        player_map[player['id']] = {
            'name': f"{player['first_name']} {player['last_name']}",
            'number': player['number'],
            'team_id': player['team_id'],
            'role': player.get('player_role', {}).get('acronym', 'N/A'),
            'start_time': player.get('start_time'),
            'end_time': player.get('end_time'),
            'playing_time': player.get('playing_time', {}),
        }
    return player_map

def get_team_colors(match_data):
    """Extract team colors from match data."""
    return {
        match_data['home_team']['id']: match_data['home_team_kit']['jersey_color'],
        match_data['away_team']['id']: match_data['away_team_kit']['jersey_color'],
    }

def parse_time_to_seconds(time_str):
    """Parse time string HH:MM:SS.D to total seconds."""
    if not time_str:
        return 0
    parts = time_str.split(':')
    hours = int(parts[0]) if len(parts) > 0 else 0
    minutes = int(parts[1]) if len(parts) > 1 else 0
    seconds = float(parts[2]) if len(parts) > 2 else 0
    return hours * 3600 + minutes * 60 + seconds

def format_seconds_to_mmss(total_seconds):
    """Convert total seconds to MM:SS format."""
    if not total_seconds or total_seconds < 0:
        return '00:00'
    mins = int(total_seconds // 60)
    secs = int(total_seconds % 60)
    return f'{mins:02d}:{secs:02d}'

def get_player_status(player_info, current_timestamp, cumulated_distance=0):
    """Determine if player is currently playing or substituted.
    
    If player has never accumulated any distance, they're considered bench
    regardless of start_time/end_time (means they never truly played).
    """
    # If player has never moved/tracked, they're not really in the game
    if cumulated_distance <= 0:
        return 'bench'
    
    start = parse_time_to_seconds(player_info.get('start_time'))
    end = parse_time_to_seconds(player_info.get('end_time'))
    current = parse_time_to_seconds(current_timestamp)
    
    if start <= current < (end if end else float('inf')):
        return 'playing'
    elif end and current >= end:
        return 'substituted'
    else:
        return 'bench'

def get_minutes_played_at_time(player_info, current_timestamp, cumulated_distance=0):
    """Get cumulative minutes played by the player up to current time.
    
    If player has never accumulated any distance, minutes_played = 0
    (they were never actually tracked as playing).
    
    Calculates based on:
    - start_time: when player entered the game
    - end_time: when player was substituted
    - current_timestamp: current frame timestamp
    """
    # If player has never moved/tracked, they never played
    if cumulated_distance <= 0:
        return 0
    
    start = parse_time_to_seconds(player_info.get('start_time'))
    end = parse_time_to_seconds(player_info.get('end_time'))
    current = parse_time_to_seconds(current_timestamp)
    
    # If player hasn't started yet
    if current < start:
        return 0
    
    # If player is still playing
    if end == 0 or current < end:
        # Minutes from start to current
        return (current - start) / 60
    
    # Player was substituted
    return (end - start) / 60

def calculate_distance(x1_m, y1_m, x2_m, y2_m):
    """Calculate Euclidean distance between two points in meters."""
    if x1_m is None or y1_m is None or x2_m is None or y2_m is None:
        return None
    return math.sqrt((x2_m - x1_m) ** 2 + (y2_m - y1_m) ** 2)

def create_enriched_tracking_json(match_file, tracking_file, output_file):
    """Create enriched tracking JSON with player info and distances.
    
    Aggregates data every 10 frames:
    - distance_frame: sum of distances over 10 frames
    - velocity: calculated from aggregated distance / 1 second * 3.6
    """
    
    # Load data
    print("Loading match data...")
    match_data = load_match_data(match_file)
    
    print("Loading tracking data...")
    tracking_data = load_tracking_data(tracking_file)
    
    # Extract dimensions
    pitch_length = match_data.get('pitch_length', 104)
    pitch_width = match_data.get('pitch_width', 68)
    
    # Build lookup maps
    player_map = build_player_map(match_data)
    team_colors = get_team_colors(match_data)
    
    # Process frames - aggregate every 10 frames
    enriched_data = []
    prev_positions = {}  # player_id -> (x_m, y_m)
    cumulated_distances = {}  # player_id -> cumulated distance
    last_player_data = {}  # player_id -> last known player data (for forward-fill)
    frame_distances = {}  # player_id -> list of distances in current 10-frame window
    walking_time = {}  # player_id -> seconds in walking (0-7 km/h)
    jogging_time = {}  # player_id -> seconds in jogging (7-15 km/h)
    sprinting_time = {}  # player_id -> seconds in sprinting (>15 km/h)
    
    # Initialize counters for all players
    for player_id in player_map.keys():
        walking_time[player_id] = 0
        jogging_time[player_id] = 0
        sprinting_time[player_id] = 0
    
    print(f"Processing {len(tracking_data)} frames (aggregating every 10)...")
    
    # Process only every 10th frame (starting from frame 1, then 11, 21, etc.)
    for main_frame_idx in range(0, len(tracking_data), 10):
        # Get the window: frames from (main_frame_idx - 10) to main_frame_idx
        window_start = max(0, main_frame_idx - 9)  # Include 10 frames
        window_end = main_frame_idx + 1
        
        frame_data = {
            'frame': main_frame_idx,
            'timestamp': tracking_data[main_frame_idx].get('timestamp', None),
            'players': []
        }
        
        current_timestamp = tracking_data[main_frame_idx].get('timestamp', '00:00:00.0')
        
        # Initialize distance tracking for this window
        for player_id in player_map.keys():
            frame_distances[player_id] = []
        
        # Aggregate distance data from the 10-frame window
        for window_idx in range(window_start, window_end):
            frame = tracking_data[window_idx]
            
            # Create a map of player_id -> tracking data for this frame
            tracking_players = {}
            for player in frame.get('player_data', []):
                if player.get('player_id'):
                    tracking_players[player['player_id']] = player
            
            # Calculate distances for each player in this frame
            for player_id in player_map.keys():
                player_tracking = tracking_players.get(player_id)
                
                if player_tracking:
                    x_m = player_tracking.get('x')
                    y_m = player_tracking.get('y')
                    
                    # Calculate distance from previous frame
                    distance = None
                    if player_id in prev_positions:
                        prev_x, prev_y = prev_positions[player_id]
                        distance = calculate_distance(prev_x, prev_y, x_m, y_m)
                    
                    # Store current position for next frame
                    prev_positions[player_id] = (x_m, y_m)
                    
                    # Accumulate distance in the current window
                    if distance is not None:
                        frame_distances[player_id].append(distance)
                        # Update cumulated distance
                        if player_id not in cumulated_distances:
                            cumulated_distances[player_id] = 0
                        cumulated_distances[player_id] += distance
        
        # Now create enriched frame with aggregated data
        for player_id, player_info in player_map.items():
            team_id = player_info['team_id']
            
            # Calculate aggregated distance and velocity
            total_distance = sum(frame_distances.get(player_id, []))
            
            # Velocity = distance per second * 3.6 for km/h
            # 10 frames @ 10 FPS = 1 second
            velocity = None
            if total_distance > 0:
                velocity = total_distance * 3.6
                
                # Categorize velocity and increment time counter
                # Each frame = 1 second
                if velocity <= 7:
                    walking_time[player_id] += 1
                elif velocity <= 15:
                    jogging_time[player_id] += 1
                else:
                    sprinting_time[player_id] += 1
            
            enriched_player = {
                'player_id': player_id,
                'name': player_info['name'],
                'number': player_info['number'],
                'team_id': team_id,
                'jersey_color': team_colors.get(team_id, '#000000'),
                'role': player_info['role'],
                'status': get_player_status(player_info, current_timestamp, cumulated_distances.get(player_id, 0)),
                'minutes_played': get_minutes_played_at_time(player_info, current_timestamp, cumulated_distances.get(player_id, 0)),
                'distance_frame': total_distance if total_distance > 0 else None,
                'velocity_kmh': velocity,
                'distance_cumulated': cumulated_distances.get(player_id, 0),
                'walking_time': format_seconds_to_mmss(walking_time.get(player_id, 0)),
                'jogging_time': format_seconds_to_mmss(jogging_time.get(player_id, 0)),
                'sprinting_time': format_seconds_to_mmss(sprinting_time.get(player_id, 0)),
            }
            
            frame_data['players'].append(enriched_player)
        
        enriched_data.append(frame_data)
    
    print(f"Saving enriched tracking data to {output_file}...")
    with open(output_file, 'w') as f:
        for frame in enriched_data:
            f.write(json.dumps(frame) + '\n')
    
    print(f"Done! Created {len(enriched_data)} aggregated frames with enriched player data.")

if __name__ == '__main__':
    # Define file paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    match_file = project_root / 'public' / 'data' / '1886347_match.json'
    tracking_file = project_root / 'public' / 'data' / '1886347_tracking_extrapolated.jsonl'
    output_file = project_root / 'public' / 'data' / '1886347_enriched_tracking.jsonl'
    
    # Create enriched JSONL
    create_enriched_tracking_json(match_file, tracking_file, output_file)
