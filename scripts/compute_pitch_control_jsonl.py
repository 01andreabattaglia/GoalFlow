"""Compute pitch control JSONL (RLE rows) with velocity-aware arrival times.

Each output line has this format:
{
  "frame_index": <int>,
  "frame": <int>,
  "timestamp": <str>,
  "period": <int>,
  "control_encoding": "rle_rows",
  "control_rle_rows": [[[team_code, count], ...], ...]
}

Cell classes:
- 1  -> home
- -1 -> away
- 0  -> none
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np

# Allow importing project packages from src when running this file directly.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
	sys.path.insert(0, str(PROJECT_ROOT))

from src.pitch_control import compute_pitch_control_grid


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="Compute pitch control JSONL with RLE encoding")
	parser.add_argument("--tracking", default="public/data/1886347_tracking_extrapolated.jsonl")
	parser.add_argument("--match", default="public/data/1886347_match.json")
	parser.add_argument("--player-params", default="public/data/1886347_player_max_speed_accel.csv")
	parser.add_argument("--output", default="public/data/1886347_pitch_control.jsonl")
	parser.add_argument("--fps", type=float, default=10.0, help="Tracking frame rate")
	parser.add_argument("--sample-stride", type=int, default=2, help="Write one frame every N")
	parser.add_argument("--cell-size", type=float, default=1.0, help="Grid cell size in meters")
	parser.add_argument("--player-accel", type=float, default=2.5, help="Fallback player acceleration")
	parser.add_argument("--player-vmax", type=float, default=7.0, help="Fallback player max speed")
	parser.add_argument("--s-ball", type=float, default=18.0, help="Ball speed used in tb formula")
	parser.add_argument("--eps", type=float, default=0.3, help="Tie-break epsilon in seconds")
	parser.add_argument("--max-frames", type=int, default=0, help="Optional output cap (0 = no cap)")
	return parser.parse_args()


def load_match(match_path: Path) -> dict:
	with match_path.open("r", encoding="utf-8") as f:
		return json.load(f)


def load_player_params(csv_path: Path) -> Dict[int, Tuple[float, float]]:
	"""Return {player_id: (accel_mps2, vmax_mps)}."""
	params: Dict[int, Tuple[float, float]] = {}
	with csv_path.open("r", encoding="utf-8", newline="") as f:
		reader = csv.DictReader(f)
		for row in reader:
			player_id = int(row["player_id"])
			accel = float(row["max_acceleration_mps2"])
			vmax_mps = float(row["max_speed_kmh"]) / 3.6
			params[player_id] = (accel, vmax_mps)
	return params


def build_player_team_map(match: dict) -> Dict[int, int]:
	"""Return {player_id: team_id} from match metadata."""
	mapping: Dict[int, int] = {}
	for p in match.get("players", []):
		pid = p.get("id")
		team_id = p.get("team_id")
		if pid is not None and team_id is not None:
			mapping[int(pid)] = int(team_id)
	return mapping


def encode_rle_rows(control: np.ndarray) -> List[List[List[int]]]:
	rle_rows: List[List[List[int]]] = []
	for i in range(control.shape[0]):
		row = control[i, :]
		if len(row) == 0:
			rle_rows.append([])
			continue

		current_val = int(row[0])
		count = 1
		rle_row: List[List[int]] = []
		for j in range(1, len(row)):
			val = int(row[j])
			if val == current_val:
				count += 1
			else:
				rle_row.append([current_val, count])
				current_val = val
				count = 1
		rle_row.append([current_val, count])
		rle_rows.append(rle_row)
	return rle_rows


def frame_index_to_timestamp(frame_idx: int, fps: float) -> str:
	total_seconds = frame_idx / fps
	hours = int(total_seconds // 3600)
	minutes = int((total_seconds % 3600) // 60)
	seconds = int(total_seconds % 60)
	centiseconds = int((total_seconds % 1.0) * 100)
	return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{centiseconds:02d}"


def get_period_for_frame(frame_idx: int, match: dict) -> int:
	for period_info in match.get("match_periods", []):
		if period_info["start_frame"] <= frame_idx <= period_info["end_frame"]:
			return int(period_info["period"])
	return 1


def process_tracking_file(
	tracking_path: Path,
	match: dict,
	player_params: Dict[int, Tuple[float, float]],
	player_team_map: Dict[int, int],
	args: argparse.Namespace,
	home_team_id: int,
	away_team_id: int,
	output_path: Path,
) -> None:
	frames_written = 0
	last_player_state: Dict[int, Tuple[float, float, int]] = {}
	pitch_length = float(match["pitch_length"])
	pitch_width = float(match["pitch_width"])

	with tracking_path.open("r", encoding="utf-8") as in_f, output_path.open("w", encoding="utf-8") as out_f:
		for line_idx, line in enumerate(in_f):
			try:
				frame = json.loads(line)
			except json.JSONDecodeError:
				continue

			frame_number = int(frame.get("frame", line_idx))
			player_data = frame.get("player_data", [])

			players_on_field: List[dict] = []
			for p in player_data:
				pid_raw = p.get("player_id")
				x_raw = p.get("x")
				y_raw = p.get("y")
				if pid_raw is None or x_raw is None or y_raw is None:
					continue

				pid = int(pid_raw)
				team_id = player_team_map.get(pid)
				if team_id not in (home_team_id, away_team_id):
					continue

				x = float(x_raw)
				y = float(y_raw)

				if pid in last_player_state:
					prev_x, prev_y, prev_frame = last_player_state[pid]
					dt_frames = max(1, frame_number - prev_frame)
					dt = dt_frames / args.fps
					vx = (x - prev_x) / dt
					vy = (y - prev_y) / dt
				else:
					vx = 0.0
					vy = 0.0

				last_player_state[pid] = (x, y, frame_number)
				accel, vmax = player_params.get(pid, (args.player_accel, args.player_vmax))

				players_on_field.append(
					{
						"player_id": pid,
						"team_id": team_id,
						"x": x,
						"y": y,
						"vx": float(vx),
						"vy": float(vy),
						"accel": float(accel),
						"vmax": float(vmax),
					}
				)

			if (line_idx + 1) % args.sample_stride != 0:
				continue

			if args.max_frames > 0 and frames_written >= args.max_frames:
				break

			ball_info = frame.get("ball_data", {})
			ball_x = float(ball_info.get("x") or 0.0)
			ball_y = float(ball_info.get("y") or 0.0)

			control = compute_pitch_control_grid(
				players_on_field=players_on_field,
				ball_x=ball_x,
				ball_y=ball_y,
				pitch_length=pitch_length,
				pitch_width=pitch_width,
				cell_size=float(args.cell_size),
				s_ball=float(args.s_ball),
				eps=float(args.eps),
				home_team_id=home_team_id,
				away_team_id=away_team_id,
			)
			rle_rows = encode_rle_rows(control)

			timestamp = frame.get("timestamp")
			if not timestamp:
				timestamp = frame_index_to_timestamp(frame_number, args.fps)

			period = frame.get("period")
			if period is None:
				period = get_period_for_frame(frame_number, match)

			output_obj = {
				"frame_index": frame_number,
				"frame": frame_number,
				"timestamp": str(timestamp),
				"period": int(period),
				"control_encoding": "rle_rows",
				"control_rle_rows": rle_rows,
			}

			out_f.write(json.dumps(output_obj) + "\n")
			frames_written += 1

			if frames_written % 50 == 0:
				print(f"Processed {frames_written} output frames...")

	print(f"Completed! Wrote {frames_written} frames to {output_path}")


def main() -> None:
	args = parse_args()

	tracking_path = Path(args.tracking)
	match_path = Path(args.match)
	player_params_path = Path(args.player_params)
	output_path = Path(args.output)

	print(f"Loading match data from {match_path}...")
	match = load_match(match_path)

	print(f"Loading player parameters from {player_params_path}...")
	player_params = load_player_params(player_params_path)

	home_team_id = int(match["home_team"]["id"])
	away_team_id = int(match["away_team"]["id"])
	player_team_map = build_player_team_map(match)

	print(f"Home team: {match['home_team']['name']} (ID: {home_team_id})")
	print(f"Away team: {match['away_team']['name']} (ID: {away_team_id})")
	print(f"Pitch dimensions: {match['pitch_length']}m x {match['pitch_width']}m")
	print("Using formulas with s_ball=18 m/s and eps=0.3 s by default.")
	print(f"Processing tracking data from {tracking_path}...")

	process_tracking_file(
		tracking_path=tracking_path,
		match=match,
		player_params=player_params,
		player_team_map=player_team_map,
		args=args,
		home_team_id=home_team_id,
		away_team_id=away_team_id,
		output_path=output_path,
	)


if __name__ == "__main__":
	main()
