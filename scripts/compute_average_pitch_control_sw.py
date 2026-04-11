"""Compute per-minute pitch control balance from pitch control JSONL.

Input expects lines like:
{
  "frame": <int>,
  "timestamp": "HH:MM:SS.xx",
  "period": <int>,
  "control_rle_rows": [[[value, count], ...], ...]
}

Output lines (one per minute bucket):
{
    "minute_index": <int>,
    "minute_start_seconds": <int>,
    "minute_label": "MM:00",
  "period": <int>,
    "frames_considered": <int>,
    "home_area_sum": <int>,
    "away_area_sum": <int>,
    "considered_area_sum": <int>,
    "minute_control": <float in [-1, 1]>
}

Minute control formula:
    (home_area_sum - away_area_sum) / considered_area_sum

Where:
- home_area_sum is the sum over valid frames of cells controlled by home (value == 1)
- away_area_sum is the sum over valid frames of cells controlled by away (value == -1)
- considered_area_sum = home_area_sum + away_area_sum (neutral cells are excluded)

Frames with missing tracking are excluded. In practice, frames with empty RLE rows
or all-zero control matrices are not considered.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compute per-minute pitch control balance")
    parser.add_argument("--input", default="public/data/1886347_pitch_control.jsonl")
    parser.add_argument("--output", default="public/data/1886347_pitch_control_minute_control.jsonl")
    parser.add_argument(
        "--round-decimals",
        type=int,
        default=6,
        help="Decimal precision for output values",
    )
    return parser.parse_args()


def parse_timestamp_to_seconds(timestamp: str) -> float:
    if not timestamp:
        return 0.0
    parts = timestamp.split(":")
    if len(parts) != 3:
        return 0.0
    hours = int(parts[0])
    minutes = int(parts[1])
    seconds = float(parts[2])
    return hours * 3600 + minutes * 60 + seconds


def infer_grid_size_from_rle_rows(rle_rows: List[List[List[int]]]) -> Tuple[int, int]:
    height = len(rle_rows)
    width = 0
    for row in rle_rows:
        row_width = 0
        for pair in row:
            if len(pair) < 2:
                continue
            row_width += max(0, int(pair[1]))
        if row_width > width:
            width = row_width
    return width, height


def decode_rle_rows(rle_rows: List[List[List[int]]], width: int, height: int) -> np.ndarray:
    matrix = np.zeros((height, width), dtype=np.int8)

    for i, row in enumerate(rle_rows[:height]):
        col = 0
        for pair in row:
            if len(pair) < 2:
                continue
            value = int(pair[0])
            count = max(0, int(pair[1]))
            if count == 0:
                continue
            end = min(width, col + count)
            matrix[i, col:end] = value
            col = end
            if col >= width:
                break

    return matrix


def matrix_to_rows(matrix: np.ndarray, decimals: int) -> List[List[float]]:
    rounded = np.round(matrix.astype(np.float32), decimals=decimals)
    return rounded.tolist()


def flush_minute(
    out_f,
    minute_index: int,
    period: int,
    aggregates: Dict[str, int],
    decimals: int,
) -> int:
    considered_area_sum = int(aggregates["considered_area_sum"])
    if considered_area_sum > 0:
        minute_control = (
            float(aggregates["home_area_sum"] - aggregates["away_area_sum"])
            / float(considered_area_sum)
        )
    else:
        minute_control = 0.0

    output_obj = {
        "minute_index": int(minute_index),
        "minute_start_seconds": int(minute_index * 60),
        "minute_label": f"{minute_index:02d}:00",
        "period": int(period),
        "frames_considered": int(aggregates["frames_considered"]),
        "home_area_sum": int(aggregates["home_area_sum"]),
        "away_area_sum": int(aggregates["away_area_sum"]),
        "considered_area_sum": considered_area_sum,
        "minute_control": round(minute_control, decimals),
    }

    out_f.write(json.dumps(output_obj) + "\n")
    return 1


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    grid_shape: Tuple[int, int] | None = None

    current_minute_index: int | None = None
    current_period: int | None = None
    aggregates = {
        "frames_considered": 0,
        "home_area_sum": 0,
        "away_area_sum": 0,
        "considered_area_sum": 0,
    }

    lines_written = 0

    with input_path.open("r", encoding="utf-8") as in_f, output_path.open("w", encoding="utf-8") as out_f:
        for _, raw_line in enumerate(in_f):
            line = raw_line.strip()
            if not line:
                continue

            try:
                frame_obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            period = int(frame_obj.get("period", 1))
            timestamp = frame_obj.get("timestamp", "00:00:00.00")
            frame_time = parse_timestamp_to_seconds(timestamp)
            minute_index = int(frame_time // 60)

            # Flush previous minute when minute bucket or period changes.
            if current_minute_index is None:
                current_minute_index = minute_index
                current_period = period
            elif minute_index != current_minute_index or period != current_period:
                lines_written += flush_minute(
                    out_f,
                    current_minute_index,
                    current_period if current_period is not None else period,
                    aggregates,
                    args.round_decimals,
                )
                aggregates = {
                    "frames_considered": 0,
                    "home_area_sum": 0,
                    "away_area_sum": 0,
                    "considered_area_sum": 0,
                }
                current_minute_index = minute_index
                current_period = period

            rle_rows = frame_obj.get("control_rle_rows", [])
            if not isinstance(rle_rows, list) or len(rle_rows) == 0:
                continue

            width_meta = frame_obj.get("grid", {}).get("width_cells") if isinstance(frame_obj.get("grid"), dict) else None
            height_meta = frame_obj.get("grid", {}).get("height_cells") if isinstance(frame_obj.get("grid"), dict) else None

            if width_meta and height_meta:
                width = int(width_meta)
                height = int(height_meta)
            else:
                width, height = infer_grid_size_from_rle_rows(rle_rows)

            if width <= 0 or height <= 0:
                continue

            if grid_shape is None:
                grid_shape = (height, width)

            # If the grid shape changes, restart accumulation to keep consistent cell alignment.
            if grid_shape != (height, width):
                grid_shape = (height, width)

            control_matrix = decode_rle_rows(rle_rows, width, height)
            is_all_zero = bool(np.all(control_matrix == 0))

            # Exclude moments without tracking.
            if is_all_zero:
                continue

            home_area = int(np.count_nonzero(control_matrix == 1))
            away_area = int(np.count_nonzero(control_matrix == -1))
            considered_area = home_area + away_area

            if considered_area <= 0:
                continue

            aggregates["frames_considered"] += 1
            aggregates["home_area_sum"] += home_area
            aggregates["away_area_sum"] += away_area
            aggregates["considered_area_sum"] += considered_area

        # Flush last minute bucket.
        if current_minute_index is not None and current_period is not None:
            lines_written += flush_minute(
                out_f,
                current_minute_index,
                current_period,
                aggregates,
                args.round_decimals,
            )

    print(f"Done. Wrote {lines_written} lines to {output_path}")


if __name__ == "__main__":
    main()
