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
        }
    return player_map

def get_team_colors(match_data):
    """Extract team colors from match data."""
    return {
        match_data['home_team']['id']: match_data['home_team_kit']['jersey_color'],
        match_data['away_team']['id']: match_data['away_team_kit']['jersey_color'],
    }

def calculate_distance(x1_m, y1_m, x2_m, y2_m):
    """Calculate Euclidean distance between two points in meters."""
    if x1_m is None or y1_m is None or x2_m is None or y2_m is None:
        return None
    return math.sqrt((x2_m - x1_m) ** 2 + (y2_m - y1_m) ** 2)

def create_enriched_tracking_json(match_file, tracking_file, output_file):
    """Create enriched tracking JSON with player info and distances."""
    
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
    
    # Process frames
    enriched_data = []
    prev_positions = {}  # player_id -> (x_m, y_m)
    cumulated_distances = {}  # player_id -> cumulated distance
    
    print(f"Processing {len(tracking_data)} frames...")
    
    for frame_idx, frame in enumerate(tracking_data):
        frame_data = {
            'frame': frame.get('frame', frame_idx),
            'timestamp': frame.get('timestamp', None),
            'players': []
        }
        
        # Process each player
        for player in frame.get('player_data', []):
            player_id = player.get('player_id')
            
            # Get player info from match data
            player_info = player_map.get(player_id, {})
            
            # Get team ID (try multiple sources)
            team_id = player.get('team_id')
            if team_id is None and player_id in player_map:
                team_id = player_map[player_id]['team_id']
            
            # Get coordinates in meters (already in meters from tracking data)
            x_m = player.get('x')
            y_m = player.get('y')
            
            # Calculate distance from previous frame
            distance = None
            if player_id in prev_positions:
                prev_x, prev_y = prev_positions[player_id]
                distance = calculate_distance(prev_x, prev_y, x_m, y_m)
            
            # Calculate velocity (distance * 36 to convert m/frame to km/h at 10fps)
            velocity = None
            if distance is not None:
                velocity = distance * 36
            
            # Update cumulated distance
            if player_id not in cumulated_distances:
                cumulated_distances[player_id] = 0
            if distance is not None:
                cumulated_distances[player_id] += distance
            
            # Store current position for next frame
            prev_positions[player_id] = (x_m, y_m)
            
            # Create enriched player record
            enriched_player = {
                'player_id': player_id,
                'name': player_info.get('name', 'Unknown'),
                'number': player_info.get('number', None),
                'team_id': team_id,
                'jersey_color': team_colors.get(team_id, '#000000'),
                'x_m': x_m,
                'y_m': y_m,
                'distance_frame': distance,
                'velocity_kmh': velocity,
                'distance_cumulated': cumulated_distances.get(player_id, 0),
            }
            
            frame_data['players'].append(enriched_player)
        
        enriched_data.append(frame_data)
    
    # Save to file
    print(f"Saving enriched tracking data to {output_file}...")
    with open(output_file, 'w') as f:
        json.dump(enriched_data, f, indent=2)
    
    print(f"Done! Created {len(enriched_data)} frames with enriched player data.")

if __name__ == '__main__':
    # Define file paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    match_file = project_root / 'public' / 'data' / '1886347_match.json'
    tracking_file = project_root / 'public' / 'data' / '1886347_tracking_extrapolated.jsonl'
    output_file = project_root / 'public' / 'data' / '1886347_enriched_tracking.json'
    
    # Create enriched JSON
    create_enriched_tracking_json(match_file, tracking_file, output_file)
