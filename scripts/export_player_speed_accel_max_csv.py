import argparse
import csv
import json
from pathlib import Path
#!/usr/bin/env python3
"""Create a CSV with default max speed/accel/decel for each player in match.json."""

DEFAULT_MAX_SPEED_KMH = 35.0
DEFAULT_MAX_ACCEL_MPS2 = 4.0
DEFAULT_MAX_DECEL_MPS2 = 6.0


def safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def load_player_ids(match_path: Path):
    with match_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    players = data.get("players", [])
    ids = set()

    for player in players:
        if not isinstance(player, dict):
            continue
        pid = safe_int(player.get("id") or player.get("player_id"))
        if pid is not None:
            ids.add(pid)

    return sorted(ids)


def write_defaults_csv(player_ids, output_path: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "player_id",
                "max_speed_kmh",
                "max_acceleration_mps2",
                "max_deceleration_mps2",
            ]
        )

        for player_id in player_ids:
            writer.writerow(
                [
                    player_id,
                    f"{DEFAULT_MAX_SPEED_KMH:.3f}",
                    f"{DEFAULT_MAX_ACCEL_MPS2:.3f}",
                    f"{DEFAULT_MAX_DECEL_MPS2:.3f}",
                ]
            )


def main():
    parser = argparse.ArgumentParser(
        description="Generate defaults CSV from match.json player IDs only"
    )
    parser.add_argument(
        "--match",
        type=Path,
        default=Path("public/data/1886347_match.json"),
        help="Input match JSON path",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("public/data/1886347_player_max_speed_accel.csv"),
        help="Output CSV path",
    )
    args = parser.parse_args()

    if not args.match.exists():
        raise FileNotFoundError(f"Match file not found: {args.match}")

    player_ids = load_player_ids(args.match)
    write_defaults_csv(player_ids, args.output)

    print(f"Players exported: {len(player_ids)}")
    print(f"CSV written to: {args.output}")


if __name__ == "__main__":
    main()
