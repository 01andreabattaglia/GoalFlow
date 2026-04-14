"""Compute sliding-window ball touch map counts per square meter.

The script reads tracking JSONL frames and outputs a JSONL snapshot every
`update_seconds` (default 5s), where each snapshot contains absolute counts of
ball presence per 1x1 m cell over the last `window_seconds` (default 10 minutes).

Second-half (and any new period) timeline is reset to 0 by using the first
observed timestamp of that period as time origin.

Important rule:
- Frames where the ball is exactly on field borders are excluded (treated as out
  of play), i.e. only strictly interior positions are counted:
  -half_length < x < half_length and -half_width < y < half_width.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Deque, Optional, Tuple

import numpy as np


DEFAULT_PITCH_LENGTH_M = 105.0
DEFAULT_PITCH_WIDTH_M = 68.0


@dataclass
class BallSample:
    elapsed_seconds: float
    row: int
    col: int


@dataclass
class PeriodState:
    period: int
    start_timestamp_seconds: Optional[float]
    next_emit_seconds: int
    counts: np.ndarray
    window_samples: Deque[BallSample]


@dataclass
class StationaryRunState:
    x_m: float
    y_m: float
    row: int
    col: int
    start_elapsed_seconds: float
    samples_added: int
    excluded: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compute ball touch map (absolute counts) with sliding window"
    )
    parser.add_argument("--input", default="public/data/1886347_tracking_extrapolated.jsonl")
    parser.add_argument("--match", default="public/data/1886347_match.json")
    parser.add_argument("--output", default="public/data/1886347_ball_touch_map_sw.jsonl")
    parser.add_argument(
        "--window-seconds",
        type=int,
        default=600,
        help="Sliding window size in seconds (default: 600 = 10 minutes)",
    )
    parser.add_argument(
        "--update-seconds",
        type=int,
        default=5,
        help="Snapshot update cadence in seconds (default: 5)",
    )
    parser.add_argument(
        "--cell-size-m",
        type=float,
        default=1.0,
        help="Cell size in meters (default: 1.0)",
    )
    parser.add_argument(
        "--stationary-threshold-seconds",
        type=float,
        default=3.0,
        help="Exclude runs with identical ball coordinates lasting at least this long",
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


def to_int(value, default: int) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def load_pitch_dimensions(match_path: Path) -> Tuple[float, float]:
    if not match_path.exists():
        return DEFAULT_PITCH_LENGTH_M, DEFAULT_PITCH_WIDTH_M

    try:
        obj = json.loads(match_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return DEFAULT_PITCH_LENGTH_M, DEFAULT_PITCH_WIDTH_M

    length = float(obj.get("pitch_length", DEFAULT_PITCH_LENGTH_M))
    width = float(obj.get("pitch_width", DEFAULT_PITCH_WIDTH_M))

    if length <= 0 or width <= 0:
        return DEFAULT_PITCH_LENGTH_M, DEFAULT_PITCH_WIDTH_M

    return length, width


def build_grid_shape(pitch_length_m: float, pitch_width_m: float, cell_size_m: float) -> Tuple[int, int]:
    cols = int(math.ceil(pitch_length_m / cell_size_m))
    rows = int(math.ceil(pitch_width_m / cell_size_m))
    return rows, cols


def is_strictly_inside_pitch(x_m: float, y_m: float, half_length: float, half_width: float) -> bool:
    return (-half_length < x_m < half_length) and (-half_width < y_m < half_width)


def point_to_cell(
    x_m: float,
    y_m: float,
    half_length: float,
    half_width: float,
    cell_size_m: float,
    rows: int,
    cols: int,
) -> Optional[Tuple[int, int]]:
    col = int((x_m + half_length) // cell_size_m)
    row = int((y_m + half_width) // cell_size_m)

    if row < 0 or row >= rows or col < 0 or col >= cols:
        return None

    return row, col


def format_mm_ss(seconds: int) -> str:
    mins = max(0, seconds) // 60
    secs = max(0, seconds) % 60
    return f"{mins:02d}:{secs:02d}"


def emit_snapshot(
    out_f,
    state: PeriodState,
    emit_elapsed_seconds: int,
    frame_number: int,
    frame_timestamp: str,
    window_seconds: int,
    update_seconds: int,
    cell_size_m: float,
) -> None:
    window_start = max(0, emit_elapsed_seconds - window_seconds)

    snapshot = {
        "period": int(state.period),
        "frame": int(frame_number),
        "timestamp": frame_timestamp,
        "elapsed_seconds": int(emit_elapsed_seconds),
        "elapsed_label": format_mm_ss(emit_elapsed_seconds),
        "window_seconds": int(window_seconds),
        "window_start_elapsed_seconds": int(window_start),
        "window_start_label": format_mm_ss(window_start),
        "update_seconds": int(update_seconds),
        "cell_size_m": float(cell_size_m),
        "rows": int(state.counts.shape[0]),
        "cols": int(state.counts.shape[1]),
        "total_points_in_window": int(np.sum(state.counts)),
        "max_cell_count": int(np.max(state.counts)) if state.counts.size > 0 else 0,
        "touch_count_rows": state.counts.astype(int).tolist(),
    }

    out_f.write(json.dumps(snapshot) + "\n")


def maybe_add_ball_sample(
    state: PeriodState,
    elapsed_seconds: float,
    row: int,
    col: int,
) -> None:
    state.counts[row, col] += 1
    state.window_samples.append(BallSample(elapsed_seconds=elapsed_seconds, row=row, col=col))


def remove_recent_samples_for_run(state: PeriodState, run: StationaryRunState) -> None:
    to_remove = run.samples_added
    while to_remove > 0 and state.window_samples:
        sample = state.window_samples.pop()
        state.counts[sample.row, sample.col] -= 1
        to_remove -= 1


def drop_expired_samples(state: PeriodState, elapsed_seconds: float, window_seconds: int) -> None:
    while state.window_samples:
        oldest = state.window_samples[0]
        if (elapsed_seconds - oldest.elapsed_seconds) <= window_seconds:
            break

        state.window_samples.popleft()
        state.counts[oldest.row, oldest.col] -= 1


def main() -> None:
    args = parse_args()

    input_path = Path(args.input)
    match_path = Path(args.match)
    output_path = Path(args.output)

    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    if args.window_seconds <= 0:
        raise ValueError("--window-seconds must be > 0")
    if args.update_seconds <= 0:
        raise ValueError("--update-seconds must be > 0")
    if args.cell_size_m <= 0:
        raise ValueError("--cell-size-m must be > 0")
    if args.stationary_threshold_seconds <= 0:
        raise ValueError("--stationary-threshold-seconds must be > 0")

    pitch_length_m, pitch_width_m = load_pitch_dimensions(match_path)
    half_length = pitch_length_m / 2.0
    half_width = pitch_width_m / 2.0
    rows, cols = build_grid_shape(pitch_length_m, pitch_width_m, args.cell_size_m)

    lines_written = 0
    period_state: Optional[PeriodState] = None
    stationary_run: Optional[StationaryRunState] = None

    with input_path.open("r", encoding="utf-8") as in_f, output_path.open("w", encoding="utf-8") as out_f:
        for raw_line in in_f:
            line = raw_line.strip()
            if not line:
                continue

            try:
                frame_obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            default_period = period_state.period if period_state is not None else 1
            period = to_int(frame_obj.get("period"), default_period)
            frame_number = to_int(frame_obj.get("frame"), 0)
            timestamp = frame_obj.get("timestamp") or "00:00:00.00"
            timestamp_seconds = parse_timestamp_to_seconds(timestamp)

            if period_state is None or period != period_state.period:
                period_state = PeriodState(
                    period=period,
                    start_timestamp_seconds=timestamp_seconds,
                    next_emit_seconds=0,
                    counts=np.zeros((rows, cols), dtype=np.int32),
                    window_samples=deque(),
                )
                stationary_run = None

            if period_state.start_timestamp_seconds is None:
                period_state.start_timestamp_seconds = timestamp_seconds

            elapsed_seconds = max(0.0, timestamp_seconds - period_state.start_timestamp_seconds)

            ball_data = frame_obj.get("ball_data")
            valid_sample = False
            x_m = None
            y_m = None
            row = None
            col = None

            if isinstance(ball_data, dict):
                x_m = ball_data.get("x")
                y_m = ball_data.get("y")
                is_detected = ball_data.get("is_detected", True)

                if (
                    is_detected
                    and isinstance(x_m, (int, float))
                    and isinstance(y_m, (int, float))
                    and math.isfinite(x_m)
                    and math.isfinite(y_m)
                    and is_strictly_inside_pitch(x_m, y_m, half_length, half_width)
                ):
                    cell = point_to_cell(
                        x_m,
                        y_m,
                        half_length,
                        half_width,
                        args.cell_size_m,
                        rows,
                        cols,
                    )
                    if cell is not None:
                        row, col = cell
                        valid_sample = True

            if not valid_sample:
                stationary_run = None
            else:
                if stationary_run is None:
                    maybe_add_ball_sample(
                        state=period_state,
                        elapsed_seconds=elapsed_seconds,
                        row=row,
                        col=col,
                    )
                    stationary_run = StationaryRunState(
                        x_m=float(x_m),
                        y_m=float(y_m),
                        row=row,
                        col=col,
                        start_elapsed_seconds=elapsed_seconds,
                        samples_added=1,
                        excluded=False,
                    )
                elif float(x_m) == stationary_run.x_m and float(y_m) == stationary_run.y_m:
                    if not stationary_run.excluded:
                        maybe_add_ball_sample(
                            state=period_state,
                            elapsed_seconds=elapsed_seconds,
                            row=row,
                            col=col,
                        )
                        stationary_run.samples_added += 1

                        if elapsed_seconds - stationary_run.start_elapsed_seconds >= args.stationary_threshold_seconds:
                            remove_recent_samples_for_run(period_state, stationary_run)
                            stationary_run.samples_added = 0
                            stationary_run.excluded = True
                else:
                    maybe_add_ball_sample(
                        state=period_state,
                        elapsed_seconds=elapsed_seconds,
                        row=row,
                        col=col,
                    )
                    stationary_run = StationaryRunState(
                        x_m=float(x_m),
                        y_m=float(y_m),
                        row=row,
                        col=col,
                        start_elapsed_seconds=elapsed_seconds,
                        samples_added=1,
                        excluded=False,
                    )

            drop_expired_samples(period_state, elapsed_seconds, args.window_seconds)

            while elapsed_seconds >= period_state.next_emit_seconds:
                emit_snapshot(
                    out_f=out_f,
                    state=period_state,
                    emit_elapsed_seconds=period_state.next_emit_seconds,
                    frame_number=frame_number,
                    frame_timestamp=timestamp,
                    window_seconds=args.window_seconds,
                    update_seconds=args.update_seconds,
                    cell_size_m=args.cell_size_m,
                )
                lines_written += 1
                period_state.next_emit_seconds += args.update_seconds

    print(f"Done. Wrote {lines_written} lines to {output_path}")


if __name__ == "__main__":
    main()
