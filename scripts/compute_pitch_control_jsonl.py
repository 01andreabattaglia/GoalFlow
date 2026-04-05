#!/usr/bin/env python3
"""
Compute frame-wise pitch control / pass receivability maps from football tracking data.

Model summary:
- Process one frame every N frames (default: 2 -> 5 Hz if source is 10 Hz).
- For each sampled frame, build a 1m x 1m pitch grid.
- For each grid cell, compare:
  1) ball travel time to the cell
  2) minimum attacker arrival time
  3) minimum defender arrival time
- Classify each cell as: receivable, contested, not_receivable.
- Write one JSON line per sampled frame.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple, Union

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

TeamId = Union[int, str]


@dataclass
class ModelConfig:
    sample_stride: int = 2
    source_fps: float = 10.0
    field_length_m: float = 104.0
    field_width_m: float = 68.0
    cell_size_m: float = 1.0
    player_accel_mps2: float = 2.5
    player_vmax_mps: float = 7.0
    player_speed_clip_mps: float = 10.0
    ball_speed_constant_mps: float = 15.0
    ball_speed_min_mps: float = 5.0
    ball_speed_max_mps: float = 35.0
    epsilon_control_s: float = 0.5
    skip_frames_without_ball: bool = True
    round_decimals: int = 3


@dataclass
class PlayerState:
    player_id: int
    team_id: TeamId
    x: float
    y: float
    vx: float
    vy: float
    accel_mps2: float
    vmax_mps: float


def parse_team_id(value: Any) -> TeamId:
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not value.is_integer():
            return str(value)
        return int(value)
    text = str(value).strip()
    if text == "":
        return text
    if text.isdigit() or (text.startswith("-") and text[1:].isdigit()):
        return int(text)
    return text


def parse_timestamp_to_seconds(ts: Any) -> Optional[float]:
    if ts is None:
        return None
    if isinstance(ts, (int, float)):
        return float(ts)

    text = str(ts).strip()
    if not text:
        return None

    if ":" not in text:
        try:
            return float(text)
        except ValueError:
            return None

    parts = text.split(":")
    try:
        if len(parts) == 2:
            minutes = int(parts[0])
            seconds = float(parts[1])
            return minutes * 60 + seconds
        if len(parts) >= 3:
            hours = int(parts[0])
            minutes = int(parts[1])
            seconds = float(parts[2])
            return hours * 3600 + minutes * 60 + seconds
    except ValueError:
        return None

    return None


def safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        out = float(value)
        if math.isnan(out) or math.isinf(out):
            return None
        return out
    except (TypeError, ValueError):
        return None


def round_or_none(value: float, decimals: int) -> Optional[float]:
    if not math.isfinite(value):
        return None
    return round(value, decimals)


def euclidean_distance(x1: float, y1: float, x2: float, y2: float) -> float:
    return math.hypot(x2 - x1, y2 - y1)


def ball_time_to_cell(ball_x: float, ball_y: float, cell_x: float, cell_y: float, ball_speed: float) -> float:
    d = euclidean_distance(ball_x, ball_y, cell_x, cell_y)
    return d / max(ball_speed, 1e-6)


def iter_jsonl(path: Path) -> Iterable[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                obj = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL at line {line_no}: {exc}") from exc
            if not isinstance(obj, dict):
                raise ValueError(f"Invalid frame object at line {line_no}: expected JSON object")
            yield obj


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_player_to_team(path: Optional[Path]) -> Dict[int, TeamId]:
    if path is None:
        return {}

    raw = load_json(path)
    mapping: Dict[int, TeamId] = {}

    def insert(pid_raw: Any, tid_raw: Any) -> None:
        pid = safe_float(pid_raw)
        if pid is None:
            return
        mapping[int(pid)] = parse_team_id(tid_raw)

    if isinstance(raw, dict):
        if "players" in raw and isinstance(raw["players"], list):
            for p in raw["players"]:
                if not isinstance(p, dict):
                    continue
                insert(p.get("id", p.get("player_id")), p.get("team_id", p.get("team")))
        else:
            for k, v in raw.items():
                insert(k, v)
    elif isinstance(raw, list):
        for p in raw:
            if not isinstance(p, dict):
                continue
            insert(p.get("player_id", p.get("id")), p.get("team_id", p.get("team")))
    else:
        raise ValueError("Unsupported player_to_team format. Use dict, list, or match JSON with players[]")

    return mapping


def load_possession_group_map(path: Optional[Path]) -> Dict[str, TeamId]:
    if path is None:
        return {}
    raw = load_json(path)
    if not isinstance(raw, dict):
        raise ValueError("possession_group_map must be a JSON object")
    return {str(k): parse_team_id(v) for k, v in raw.items()}


def load_player_physics(path: Optional[Path]) -> Dict[int, Tuple[float, float]]:
    """Load per-player (acceleration_mps2, vmax_mps) from CSV.

    Expected columns: player_id,max_speed_kmh,max_acceleration_mps2,...
    """
    if path is None or not path.exists():
        return {}

    physics: Dict[int, Tuple[float, float]] = {}
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pid = safe_float(row.get("player_id"))
            vmax_kmh = safe_float(row.get("max_speed_kmh"))
            accel = safe_float(row.get("max_acceleration_mps2"))
            if pid is None or vmax_kmh is None or accel is None:
                continue
            vmax_mps = vmax_kmh / 3.6
            if vmax_mps <= 0 or accel <= 0:
                continue
            physics[int(pid)] = (accel, vmax_mps)

    return physics


def infer_home_away_teams(path: Optional[Path]) -> Tuple[Optional[TeamId], Optional[TeamId]]:
    if path is None:
        return None, None

    try:
        raw = load_json(path)
    except Exception:
        return None, None

    if not isinstance(raw, dict):
        return None, None

    home = None
    away = None

    home_obj = raw.get("home_team")
    away_obj = raw.get("away_team")
    if isinstance(home_obj, dict):
        home = home_obj.get("id")
    if isinstance(away_obj, dict):
        away = away_obj.get("id")

    if home is None or away is None:
        return None, None

    return parse_team_id(home), parse_team_id(away)


def infer_dt_seconds(curr_frame: Mapping[str, Any], prev_frame: Optional[Mapping[str, Any]], fallback_fps: float) -> float:
    if prev_frame is None:
        return 1.0 / fallback_fps

    t_curr = parse_timestamp_to_seconds(curr_frame.get("timestamp"))
    t_prev = parse_timestamp_to_seconds(prev_frame.get("timestamp"))

    if t_curr is not None and t_prev is not None:
        dt = t_curr - t_prev
        if dt > 1e-6:
            return dt

    return 1.0 / fallback_fps


def get_ball_xy(frame: Mapping[str, Any]) -> Tuple[Optional[float], Optional[float], bool]:
    ball = frame.get("ball_data") or {}
    x = safe_float(ball.get("x"))
    y = safe_float(ball.get("y"))
    detected = bool(ball.get("is_detected", x is not None and y is not None))
    return x, y, detected and x is not None and y is not None


def estimate_ball_speed(
    curr_frame: Mapping[str, Any],
    prev_frame: Optional[Mapping[str, Any]],
    dt: float,
    cfg: ModelConfig,
    last_valid_ball_speed: Optional[float],
) -> float:
    if prev_frame is None:
        return cfg.ball_speed_constant_mps

    x_curr, y_curr, curr_ok = get_ball_xy(curr_frame)
    x_prev, y_prev, prev_ok = get_ball_xy(prev_frame)

    if curr_ok and prev_ok and dt > 1e-6:
        speed = euclidean_distance(x_prev, y_prev, x_curr, y_curr) / dt
        if cfg.ball_speed_min_mps <= speed <= cfg.ball_speed_max_mps:
            return speed

    if last_valid_ball_speed is not None:
        return last_valid_ball_speed

    return cfg.ball_speed_constant_mps


def get_player_positions(frame: Mapping[str, Any]) -> Dict[int, Tuple[float, float]]:
    out: Dict[int, Tuple[float, float]] = {}
    for p in frame.get("player_data") or []:
        if not isinstance(p, dict):
            continue
        pid = safe_float(p.get("player_id"))
        if pid is None:
            continue

        x = safe_float(p.get("x"))
        y = safe_float(p.get("y"))
        if x is None or y is None:
            continue

        is_detected = p.get("is_detected")
        if is_detected is False:
            continue

        out[int(pid)] = (x, y)
    return out


def estimate_player_velocity(
    curr_pos: Optional[Tuple[float, float]],
    prev_pos: Optional[Tuple[float, float]],
    dt: float,
    speed_clip_mps: float,
) -> Tuple[float, float]:
    if curr_pos is None or prev_pos is None or dt <= 1e-6:
        return 0.0, 0.0

    cx, cy = curr_pos
    px, py = prev_pos
    vx = (cx - px) / dt
    vy = (cy - py) / dt

    speed = math.hypot(vx, vy)
    if speed > speed_clip_mps and speed > 1e-9:
        scale = speed_clip_mps / speed
        vx *= scale
        vy *= scale

    return vx, vy


def estimate_player_velocities(
    curr_positions: Mapping[int, Tuple[float, float]],
    prev_positions: Mapping[int, Tuple[float, float]],
    dt: float,
    last_valid_velocities: Mapping[int, Tuple[float, float]],
    speed_clip_mps: float,
) -> Dict[int, Tuple[float, float]]:
    out: Dict[int, Tuple[float, float]] = {}

    for pid, (x, y) in curr_positions.items():
        curr_pos = (x, y)
        prev_pos = prev_positions.get(pid)
        if prev_pos is None:
            out[pid] = (0.0, 0.0)
            continue
        out[pid] = estimate_player_velocity(curr_pos, prev_pos, dt, speed_clip_mps)

    return out


def get_team_for_player(
    player_obj: Mapping[str, Any],
    player_id: int,
    player_to_team: Mapping[int, TeamId],
) -> Optional[TeamId]:
    if player_id in player_to_team:
        return player_to_team[player_id]

    if "team_id" in player_obj and player_obj.get("team_id") is not None:
        return parse_team_id(player_obj.get("team_id"))
    if "team" in player_obj and player_obj.get("team") is not None:
        return parse_team_id(player_obj.get("team"))

    return None


def infer_attacking_team(
    frame: Mapping[str, Any],
    explicit_attacking_team: Optional[TeamId],
    possession_group_map: Mapping[str, TeamId],
) -> Optional[TeamId]:
    if explicit_attacking_team is not None:
        return explicit_attacking_team

    possession = frame.get("possession") or {}
    group = possession.get("group")
    if group is None:
        return None

    key = str(group)
    if key in possession_group_map:
        return possession_group_map[key]

    return parse_team_id(group)


def normalize_attacking_team_label(
    attacking_team: Optional[TeamId],
    home_team_id: Optional[TeamId],
    away_team_id: Optional[TeamId],
) -> Optional[TeamId]:
    if attacking_team is None:
        return None

    if isinstance(attacking_team, str):
        key = attacking_team.strip().lower().replace("_", " ")
        if key in {"home", "home team", "hometeam"}:
            return home_team_id if home_team_id is not None else attacking_team
        if key in {"away", "away team", "awayteam"}:
            return away_team_id if away_team_id is not None else attacking_team

        # Normalize numeric strings to numeric TeamId.
        parsed = parse_team_id(attacking_team)
        return parsed

    return attacking_team


def split_players_by_team(
    frame: Mapping[str, Any],
    player_to_team: Mapping[int, TeamId],
    player_physics: Mapping[int, Tuple[float, float]],
    velocities: Mapping[int, Tuple[float, float]],
    cfg: ModelConfig,
) -> Tuple[List[PlayerState], Dict[TeamId, List[PlayerState]]]:
    all_players: List[PlayerState] = []
    by_team: Dict[TeamId, List[PlayerState]] = {}

    for p in frame.get("player_data") or []:
        if not isinstance(p, dict):
            continue

        pid_f = safe_float(p.get("player_id"))
        if pid_f is None:
            continue
        pid = int(pid_f)

        x = safe_float(p.get("x"))
        y = safe_float(p.get("y"))
        if x is None or y is None:
            continue

        is_detected = p.get("is_detected")
        if is_detected is False:
            continue

        team_id = get_team_for_player(p, pid, player_to_team)
        if team_id is None:
            continue

        vx, vy = velocities.get(pid, (0.0, 0.0))
        accel_mps2, vmax_mps = player_physics.get(pid, (cfg.player_accel_mps2, cfg.player_vmax_mps))
        state = PlayerState(
            player_id=pid,
            team_id=team_id,
            x=x,
            y=y,
            vx=vx,
            vy=vy,
            accel_mps2=accel_mps2,
            vmax_mps=vmax_mps,
        )
        all_players.append(state)
        by_team.setdefault(team_id, []).append(state)

    return all_players, by_team


def infer_defending_team(attacking_team: Optional[TeamId], teams_in_frame: Iterable[TeamId]) -> Optional[TeamId]:
    if attacking_team is None:
        return None

    uniques = []
    seen = set()
    for t in teams_in_frame:
        if t in seen:
            continue
        seen.add(t)
        uniques.append(t)

    for t in uniques:
        if t != attacking_team:
            return t

    return None


def build_grid(field_length_m: float, field_width_m: float, cell_size_m: float) -> Tuple[List[float], List[float]]:
    if cell_size_m <= 0:
        raise ValueError("cell_size_m must be > 0")

    x_min = -field_length_m / 2.0
    y_min = -field_width_m / 2.0

    n_x = int(round(field_length_m / cell_size_m))
    n_y = int(round(field_width_m / cell_size_m))

    xs = [x_min + (i + 0.5) * cell_size_m for i in range(n_x)]
    ys = [y_min + (j + 0.5) * cell_size_m for j in range(n_y)]

    return xs, ys


def compute_player_arrival_time(
    player: PlayerState,
    target_x: float,
    target_y: float,
) -> float:
    dx = target_x - player.x
    dy = target_y - player.y
    d = math.hypot(dx, dy)

    if d <= 1e-9:
        return 0.0

    ux = dx / d
    uy = dy / d

    v0 = player.vx * ux + player.vy * uy
    if v0 < 0:
        v0 = 0.0

    accel = player.accel_mps2
    vmax = player.vmax_mps

    t_to_vmax = max((vmax - v0) / accel, 0.0)
    d_acc = v0 * t_to_vmax + 0.5 * accel * (t_to_vmax ** 2)

    if d <= d_acc:
        disc = v0 * v0 + 2.0 * accel * d
        disc = max(disc, 0.0)
        return (-v0 + math.sqrt(disc)) / accel

    return t_to_vmax + (d - d_acc) / vmax


def player_time_to_cell(player: PlayerState, cell_x: float, cell_y: float) -> float:
    return compute_player_arrival_time(player, cell_x, cell_y)


def classify_cell(tb: float, th: float, ta: float, epsilon: float) -> int:
    if th + epsilon < ta and th <= tb + epsilon:
        return 1

    if ta + epsilon < th and ta <= tb + epsilon:
        return -1

    return 0


def rle_encode_row(values: List[int]) -> List[List[int]]:
    if not values:
        return []

    encoded: List[List[int]] = []
    prev = values[0]
    count = 1

    for v in values[1:]:
        if v == prev:
            count += 1
            continue
        encoded.append([prev, count])
        prev = v
        count = 1

    encoded.append([prev, count])
    return encoded


def rle_encode_rows(matrix: List[List[int]]) -> List[List[List[int]]]:
    return [rle_encode_row(row) for row in matrix]


def compute_min_team_arrival(
    players: List[PlayerState],
    target_x: float,
    target_y: float,
    cfg: ModelConfig,
) -> Tuple[float, Optional[int]]:
    best_t = math.inf
    best_pid: Optional[int] = None

    for p in players:
        t = player_time_to_cell(p, target_x, target_y)
        if t < best_t:
            best_t = t
            best_pid = p.player_id

    return best_t, best_pid


def compute_cell_control(
    cell_x: float,
    cell_y: float,
    ball_x: float,
    ball_y: float,
    ball_speed: float,
    home_players: List[PlayerState],
    away_players: List[PlayerState],
    cfg: ModelConfig,
) -> Dict[str, Any]:
    tb = ball_time_to_cell(ball_x, ball_y, cell_x, cell_y, ball_speed)
    th, home_pid = compute_min_team_arrival(home_players, cell_x, cell_y, cfg)
    ta, away_pid = compute_min_team_arrival(away_players, cell_x, cell_y, cfg)
    code = classify_cell(tb, th, ta, cfg.epsilon_control_s)

    return {
        "control_code": code,
        "tb": tb,
        "th": th,
        "ta": ta,
        "home_player_id": home_pid,
        "away_player_id": away_pid,
    }


def _vectorized_min_arrival_times(
    players: List[PlayerState],
    cell_x: "np.ndarray",
    cell_y: "np.ndarray",
    cfg: ModelConfig,
) -> "np.ndarray":
    cell_count = cell_x.shape[0]
    if len(players) == 0:
        return np.full(cell_count, np.inf, dtype=np.float64)

    px = np.array([p.x for p in players], dtype=np.float64)[:, None]
    py = np.array([p.y for p in players], dtype=np.float64)[:, None]
    vx = np.array([p.vx for p in players], dtype=np.float64)[:, None]
    vy = np.array([p.vy for p in players], dtype=np.float64)[:, None]
    accel = np.array([p.accel_mps2 for p in players], dtype=np.float64)[:, None]
    vmax = np.array([p.vmax_mps for p in players], dtype=np.float64)[:, None]

    cx = cell_x[None, :]
    cy = cell_y[None, :]

    dx = cx - px
    dy = cy - py
    d = np.hypot(dx, dy)

    d_safe = np.where(d <= 1e-9, 1.0, d)
    ux = dx / d_safe
    uy = dy / d_safe

    v0 = vx * ux + vy * uy
    v0 = np.maximum(v0, 0.0)

    t_to_vmax = np.maximum((vmax - v0) / accel, 0.0)
    d_acc = v0 * t_to_vmax + 0.5 * accel * (t_to_vmax ** 2)

    disc = np.maximum(v0 * v0 + 2.0 * accel * d, 0.0)
    t_acc_only = (-v0 + np.sqrt(disc)) / accel
    t_acc_cruise = t_to_vmax + (d - d_acc) / vmax
    t = np.where(d <= d_acc, t_acc_only, t_acc_cruise)
    t = np.where(d <= 1e-9, 0.0, t)

    return np.min(t, axis=0)


def compute_control_matrix_vectorized(
    x_ball: float,
    y_ball: float,
    ball_speed: float,
    home_players: List[PlayerState],
    away_players: List[PlayerState],
    cfg: ModelConfig,
    xs: List[float],
    ys: List[float],
) -> Tuple[List[List[int]], int, int, int]:
    xs_np = np.asarray(xs, dtype=np.float64)
    ys_np = np.asarray(ys, dtype=np.float64)

    # Flattened grid of cell centers: length = width_cells * height_cells
    cell_x = np.tile(xs_np, ys_np.shape[0])
    cell_y = np.repeat(ys_np, xs_np.shape[0])

    tb = np.hypot(cell_x - x_ball, cell_y - y_ball) / max(ball_speed, 1e-6)
    th = _vectorized_min_arrival_times(home_players, cell_x, cell_y, cfg)
    ta = _vectorized_min_arrival_times(away_players, cell_x, cell_y, cfg)

    eps = cfg.epsilon_control_s
    home_mask = (th + eps < ta) & (th <= tb + eps)
    away_mask = (ta + eps < th) & (ta <= tb + eps)

    codes = np.zeros(cell_x.shape[0], dtype=np.int8)
    codes[home_mask] = 1
    codes[away_mask] = -1

    home_cells = int(np.count_nonzero(codes == 1))
    away_cells = int(np.count_nonzero(codes == -1))
    none_cells = int(codes.size - home_cells - away_cells)

    control_matrix = codes.reshape((ys_np.shape[0], xs_np.shape[0])).astype(int).tolist()
    return control_matrix, home_cells, away_cells, none_cells


def compute_frame_map(
    frame_idx: int,
    frame: Mapping[str, Any],
    prev_frame: Optional[Mapping[str, Any]],
    player_to_team: Mapping[int, TeamId],
    player_physics: Mapping[int, Tuple[float, float]],
    possession_group_map: Mapping[str, TeamId],
    explicit_attacking_team: Optional[TeamId],
    cfg: ModelConfig,
    xs: List[float],
    ys: List[float],
    home_team_id: Optional[TeamId],
    away_team_id: Optional[TeamId],
    last_valid_velocities: Dict[int, Tuple[float, float]],
    last_valid_ball_speed: Optional[float],
) -> Tuple[Optional[Dict[str, Any]], Dict[int, Tuple[float, float]], Optional[float]]:
    dt = infer_dt_seconds(frame, prev_frame, fallback_fps=cfg.source_fps)

    curr_positions = get_player_positions(frame)
    prev_positions = get_player_positions(prev_frame) if prev_frame is not None else {}

    velocities = estimate_player_velocities(
        curr_positions=curr_positions,
        prev_positions=prev_positions,
        dt=dt,
        last_valid_velocities=last_valid_velocities,
        speed_clip_mps=cfg.player_speed_clip_mps,
    )

    x_ball, y_ball, ball_ok = get_ball_xy(frame)
    ball_speed = estimate_ball_speed(
        curr_frame=frame,
        prev_frame=prev_frame,
        dt=dt,
        cfg=cfg,
        last_valid_ball_speed=last_valid_ball_speed,
    )

    if not ball_ok and cfg.skip_frames_without_ball:
        return None, velocities, ball_speed

    all_players, by_team = split_players_by_team(frame, player_to_team, player_physics, velocities, cfg)

    attacking_team = infer_attacking_team(
        frame=frame,
        explicit_attacking_team=explicit_attacking_team,
        possession_group_map=possession_group_map,
    )
    attacking_team = normalize_attacking_team_label(attacking_team, home_team_id, away_team_id)

    if attacking_team is None and by_team:
        # Fallback: choose deterministically but preserve original team-id type.
        attacking_team = sorted(by_team.keys(), key=lambda t: str(t))[0]

    defending_team = infer_defending_team(attacking_team, by_team.keys())

    home_players = by_team.get(home_team_id, []) if home_team_id is not None else []
    away_players = by_team.get(away_team_id, []) if away_team_id is not None else []

    home_cells = 0
    away_cells = 0
    none_cells = 0

    if HAS_NUMPY and ball_ok and x_ball is not None and y_ball is not None:
        control_matrix, home_cells, away_cells, none_cells = compute_control_matrix_vectorized(
            x_ball=x_ball,
            y_ball=y_ball,
            ball_speed=ball_speed,
            home_players=home_players,
            away_players=away_players,
            cfg=cfg,
            xs=xs,
            ys=ys,
        )
    else:
        control_matrix: List[List[int]] = []
        for y in ys:
            row_codes: List[int] = []
            for x in xs:
                if not ball_ok or x_ball is None or y_ball is None:
                    code = 0
                else:
                    cell_result = compute_cell_control(
                        cell_x=x,
                        cell_y=y,
                        ball_x=x_ball,
                        ball_y=y_ball,
                        ball_speed=ball_speed,
                        home_players=home_players,
                        away_players=away_players,
                        cfg=cfg,
                    )
                    code = int(cell_result["control_code"])

                if code == 1:
                    home_cells += 1
                elif code == -1:
                    away_cells += 1
                else:
                    none_cells += 1

                row_codes.append(code)

            control_matrix.append(row_codes)

    control_rle_rows = rle_encode_rows(control_matrix)

    output = {
        "frame_index": frame_idx,
        "frame": frame.get("frame", frame_idx),
        "timestamp": frame.get("timestamp"),
        "period": frame.get("period"),
        "attacking_team": attacking_team,
        "defending_team": defending_team,
        "ball": {
            "x": x_ball,
            "y": y_ball,
            "is_detected": ball_ok,
            "speed_mps": round(ball_speed, cfg.round_decimals),
        },
        "model_params": {
            "sample_stride": cfg.sample_stride,
            "source_fps": cfg.source_fps,
            "cell_size_m": cfg.cell_size_m,
            "player_accel_mps2": cfg.player_accel_mps2,
            "player_vmax_mps": cfg.player_vmax_mps,
            "player_speed_clip_mps": cfg.player_speed_clip_mps,
            "ball_speed_constant_mps": cfg.ball_speed_constant_mps,
            "ball_speed_min_mps": cfg.ball_speed_min_mps,
            "ball_speed_max_mps": cfg.ball_speed_max_mps,
            "epsilon_control_s": cfg.epsilon_control_s,
        },
        "team_code_map": {
            "1": "home",
            "0": "none",
            "-1": "away",
        },
        "home_team_id": home_team_id,
        "away_team_id": away_team_id,
        "grid": {
            "field_length_m": cfg.field_length_m,
            "field_width_m": cfg.field_width_m,
            "x_min": round(-cfg.field_length_m / 2.0, cfg.round_decimals),
            "x_max": round(cfg.field_length_m / 2.0, cfg.round_decimals),
            "y_min": round(-cfg.field_width_m / 2.0, cfg.round_decimals),
            "y_max": round(cfg.field_width_m / 2.0, cfg.round_decimals),
            "cell_size_m": cfg.cell_size_m,
            "width_cells": len(xs),
            "height_cells": len(ys),
        },
        "summary": {
            "home": home_cells,
            "away": away_cells,
            "none": none_cells,
            "players_total_used": len(all_players),
            "home_players_used": len(home_players),
            "away_players_used": len(away_players),
        },
        "control_encoding": "rle_rows",
        "control_rle_rows": control_rle_rows,
    }

    return output, velocities, ball_speed


def process_sampled_frame(
    frame_idx: int,
    frame: Mapping[str, Any],
    prev_frame: Optional[Mapping[str, Any]],
    player_to_team: Mapping[int, TeamId],
    player_physics: Mapping[int, Tuple[float, float]],
    possession_group_map: Mapping[str, TeamId],
    explicit_attacking_team: Optional[TeamId],
    cfg: ModelConfig,
    xs: List[float],
    ys: List[float],
    home_team_id: Optional[TeamId],
    away_team_id: Optional[TeamId],
    last_valid_velocities: Dict[int, Tuple[float, float]],
    last_valid_ball_speed: Optional[float],
) -> Tuple[Optional[Dict[str, Any]], Dict[int, Tuple[float, float]], Optional[float]]:
    return compute_frame_map(
        frame_idx=frame_idx,
        frame=frame,
        prev_frame=prev_frame,
        player_to_team=player_to_team,
        player_physics=player_physics,
        possession_group_map=possession_group_map,
        explicit_attacking_team=explicit_attacking_team,
        cfg=cfg,
        xs=xs,
        ys=ys,
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        last_valid_velocities=last_valid_velocities,
        last_valid_ball_speed=last_valid_ball_speed,
    )


def write_jsonl(path: Path, rows: Iterable[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=True) + "\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compute pitch control / pass receivability JSONL from tracking data"
    )
    parser.add_argument(
        "--input-tracking",
        type=Path,
        default=Path("public/data/1886347_tracking_extrapolated.jsonl"),
        help="Input tracking JSONL path",
    )
    parser.add_argument(
        "--output-jsonl",
        type=Path,
        default=Path("public/data/1886347_pitch_control.jsonl"),
        help="Output JSONL path",
    )

    parser.add_argument(
        "--player-team-map",
        type=Path,
        default=Path("public/data/1886347_match.json"),
        help="JSON map/list/match file for player->team",
    )
    parser.add_argument(
        "--player-physics-csv",
        type=Path,
        default=Path("public/data/1886347_player_max_speed_accel.csv"),
        help="CSV with per-player max speed/acceleration",
    )
    parser.add_argument("--possession-group-map", type=Path, default=None, help="Optional JSON map for possession.group -> team_id")
    parser.add_argument("--attacking-team", type=str, default=None, help="Optional attacking team override")

    parser.add_argument("--sample-stride", type=int, default=2)
    parser.add_argument("--source-fps", type=float, default=10.0)
    parser.add_argument("--field-length-m", type=float, default=104.0)
    parser.add_argument("--field-width-m", type=float, default=68.0)
    parser.add_argument("--cell-size-m", type=float, default=1.0)

    parser.add_argument("--player-accel-mps2", type=float, default=2.5)
    parser.add_argument("--player-vmax-mps", type=float, default=7.0)
    parser.add_argument("--player-speed-clip-mps", type=float, default=10.0)

    parser.add_argument("--ball-speed-constant-mps", type=float, default=15.0)
    parser.add_argument("--ball-speed-min-mps", type=float, default=5.0)
    parser.add_argument("--ball-speed-max-mps", type=float, default=35.0)

    parser.add_argument("--epsilon-control-s", type=float, default=0.5)
    parser.add_argument("--round-decimals", type=int, default=3)

    parser.add_argument(
        "--keep-frames-without-ball",
        action="store_true",
        help="If set, keep frames with missing ball as contested/infinite-time outputs",
    )
    parser.add_argument("--home-team-id", type=str, default=None, help="Optional home team id for compact output labels")
    parser.add_argument("--away-team-id", type=str, default=None, help="Optional away team id for compact output labels")

    return parser.parse_args()


def make_config(args: argparse.Namespace) -> ModelConfig:
    cfg = ModelConfig(
        sample_stride=args.sample_stride,
        source_fps=args.source_fps,
        field_length_m=args.field_length_m,
        field_width_m=args.field_width_m,
        cell_size_m=args.cell_size_m,
        player_accel_mps2=args.player_accel_mps2,
        player_vmax_mps=args.player_vmax_mps,
        player_speed_clip_mps=args.player_speed_clip_mps,
        ball_speed_constant_mps=args.ball_speed_constant_mps,
        ball_speed_min_mps=args.ball_speed_min_mps,
        ball_speed_max_mps=args.ball_speed_max_mps,
        epsilon_control_s=args.epsilon_control_s,
        skip_frames_without_ball=not args.keep_frames_without_ball,
        round_decimals=args.round_decimals,
    )

    if cfg.sample_stride <= 0:
        raise ValueError("sample_stride must be > 0")
    if cfg.source_fps <= 0:
        raise ValueError("source_fps must be > 0")
    if cfg.cell_size_m <= 0:
        raise ValueError("cell_size_m must be > 0")
    if cfg.player_accel_mps2 <= 0:
        raise ValueError("player_accel_mps2 must be > 0")
    if cfg.player_vmax_mps <= 0:
        raise ValueError("player_vmax_mps must be > 0")
    if cfg.ball_speed_constant_mps <= 0:
        raise ValueError("ball_speed_constant_mps must be > 0")

    return cfg


def main() -> None:
    args = parse_args()
    cfg = make_config(args)

    input_tracking = args.input_tracking
    output_jsonl = args.output_jsonl

    explicit_attacking_team = parse_team_id(args.attacking_team) if args.attacking_team is not None else None
    player_to_team = load_player_to_team(args.player_team_map)
    player_physics = load_player_physics(args.player_physics_csv)
    possession_group_map = load_possession_group_map(args.possession_group_map)
    inferred_home_team, inferred_away_team = infer_home_away_teams(args.player_team_map)
    home_team_id = parse_team_id(args.home_team_id) if args.home_team_id is not None else inferred_home_team
    away_team_id = parse_team_id(args.away_team_id) if args.away_team_id is not None else inferred_away_team

    frames = list(iter_jsonl(input_tracking))
    xs, ys = build_grid(cfg.field_length_m, cfg.field_width_m, cfg.cell_size_m)

    output_jsonl.parent.mkdir(parents=True, exist_ok=True)
    last_valid_velocities: Dict[int, Tuple[float, float]] = {}
    last_valid_ball_speed: Optional[float] = None
    written_rows = 0

    with output_jsonl.open("w", encoding="utf-8") as out_f:
        for idx in range(0, len(frames), cfg.sample_stride):
            frame = frames[idx]
            prev_frame = frames[idx - 1] if idx > 0 else None

            row, velocities, ball_speed = process_sampled_frame(
                frame_idx=idx,
                frame=frame,
                prev_frame=prev_frame,
                player_to_team=player_to_team,
                player_physics=player_physics,
                possession_group_map=possession_group_map,
                explicit_attacking_team=explicit_attacking_team,
                cfg=cfg,
                xs=xs,
                ys=ys,
                home_team_id=home_team_id,
                away_team_id=away_team_id,
                last_valid_velocities=last_valid_velocities,
                last_valid_ball_speed=last_valid_ball_speed,
            )

            last_valid_velocities.update(velocities)
            last_valid_ball_speed = ball_speed

            if row is not None:
                out_f.write(json.dumps(row, ensure_ascii=True) + "\n")
                written_rows += 1

            if idx % (cfg.sample_stride * 100) == 0:
                print(f"Processed frame index {idx} / {len(frames) - 1} | written rows: {written_rows}")

    print(f"Done. Input frames: {len(frames)}")
    print(f"Sample stride: {cfg.sample_stride} -> output frames: {written_rows}")
    print(f"Output JSONL: {output_jsonl}")


if __name__ == "__main__":
    main()
