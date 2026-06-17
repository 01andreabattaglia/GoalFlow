# Sport Tech Project

A React + Vite web application for visualizing soccer tracking data on a 2D radar, synchronized video playback, and analytical dashboards (physical metrics and pitch control).

## Key Components

- `src/components/TrackingRadarWithDataLoader.jsx`: Main dashboard component with 2D canvas, time controls, what-if analysis, and analytics visualizations.
- `src/components/VideoPlayer.jsx`: Video player synchronized with tracking data timestamps.
- `src/components/TrackingRadar.jsx`: Simplified mock visualization component.

## Data Used

The main files are located in `public/data/`:

- `1886347_tracking_extrapolated.jsonl`
- `1886347_player_max_speed_accel.csv`
- `1886347_match.json`
- `video_sync.json`

## Required Data for the Dashboard

To display the dashboard correctly you must run the scripts in the `scripts/` folder to generate the tracking and pitch-control files, and provide the match video synchronized with the tracking data. The video is not included in this repository (listed in `.gitignore`), so you need to obtain it separately and place it in `public/data/`.

This project is designed to be easily extended to any match: once you provide the appropriate tracking files and a synchronized video, the dashboard can be used for other games with minimal changes.

## How to Run

### 1. Generate required data

Run the following scripts from the `scripts/` folder in order:

```bash
python scripts/create_enriched_tracking_json.py
python scripts/compute_pitch_control_jsonl.py
python scripts/compute_average_pitch_control_sw.py
python scripts/compute_ball_touch_map_sw.py
python scripts/sync_video_timestamps.py

### 2. Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Notes

- For more details: see documentation in `docs/`