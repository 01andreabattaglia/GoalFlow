"""Core pitch control model utilities.

This module contains the computational model used to classify each grid cell
as home-controlled, away-controlled, or neutral based on arrival times.
"""

from __future__ import annotations

import math
from typing import Dict, List

import numpy as np


def ball_time_to_cell(ball_x: float, ball_y: float, cell_x: float, cell_y: float, s_ball: float) -> float:
    """Compute ball arrival time tb = distance(ball, cell) / s_ball."""
    dx = cell_x - ball_x
    dy = cell_y - ball_y
    dist = math.sqrt(dx * dx + dy * dy)
    if dist < 1e-9:
        return 0.0
    if s_ball <= 0:
        return float("inf")
    return dist / s_ball


def player_time_to_cell(
    px: float,
    py: float,
    vx: float,
    vy: float,
    cell_x: float,
    cell_y: float,
    accel: float,
    vmax: float,
) -> float:
    """Compute player arrival time tp with projected velocity and acceleration model."""
    dx = cell_x - px
    dy = cell_y - py
    distance = math.sqrt(dx * dx + dy * dy)
    if distance < 1e-9:
        return 0.0

    if vmax <= 0 and accel <= 0:
        return float("inf")

    ux = dx / distance
    uy = dy / distance
    v0 = max(0.0, vx * ux + vy * uy)

    safe_vmax = max(vmax, 1e-6)
    if v0 > safe_vmax:
        v0 = safe_vmax

    if accel <= 0:
        v_const = max(min(safe_vmax, max(v0, 1e-6)), 1e-6)
        return distance / v_const

    t_acc = max(0.0, (safe_vmax - v0) / accel)
    d_acc = v0 * t_acc + 0.5 * accel * t_acc * t_acc

    if distance <= d_acc:
        disc = max(0.0, v0 * v0 + 2.0 * accel * distance)
        return (-v0 + math.sqrt(disc)) / accel

    return t_acc + (distance - d_acc) / safe_vmax


def classify_cell(th: float, ta: float, tb: float, eps: float) -> int:
    """Classify control cell based on home/away/ball arrival ordering."""
    if th < tb and ta < tb:
        return 0
    if th < tb < ta:
        return 1
    if ta < tb < th:
        return -1
    if tb < th and tb < ta:
        if th + eps < ta:
            return 1
        if ta + eps < th:
            return -1
        return 0
    return 0


def compute_pitch_control_grid(
    players_on_field: List[dict],
    ball_x: float,
    ball_y: float,
    pitch_length: float,
    pitch_width: float,
    cell_size: float,
    s_ball: float,
    eps: float,
    home_team_id: int,
    away_team_id: int,
) -> np.ndarray:
    """Compute the pitch control matrix for one frame."""
    x_min = -pitch_length / 2.0
    x_max = pitch_length / 2.0
    y_min = -pitch_width / 2.0
    y_max = pitch_width / 2.0

    grid_width = int((x_max - x_min) / cell_size)
    grid_height = int((y_max - y_min) / cell_size)
    control = np.zeros((grid_height, grid_width), dtype=np.int8)

    for row in range(grid_height):
        for col in range(grid_width):
            cell_x = x_min + (col + 0.5) * cell_size
            cell_y = y_min + (row + 0.5) * cell_size

            tb = ball_time_to_cell(ball_x, ball_y, cell_x, cell_y, s_ball)
            th = float("inf")
            ta = float("inf")

            for player in players_on_field:
                tp = player_time_to_cell(
                    px=player["x"],
                    py=player["y"],
                    vx=player["vx"],
                    vy=player["vy"],
                    cell_x=cell_x,
                    cell_y=cell_y,
                    accel=player["accel"],
                    vmax=player["vmax"],
                )
                if player["team_id"] == home_team_id and tp < th:
                    th = tp
                elif player["team_id"] == away_team_id and tp < ta:
                    ta = tp

            control[row, col] = classify_cell(th, ta, tb, eps)

    return control
