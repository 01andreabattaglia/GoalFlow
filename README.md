# Sport Tech Project

A React + Vite web application for visualizing soccer tracking data on a 2D radar, synchronized video playback, and analytical dashboards (physical metrics and pitch control).

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Data Used

The main files are located in `public/data/`:

- `1886347_tracking_extrapolated.jsonl`
- `1886347_enriched_tracking.jsonl`
- `1886347_pitch_control.jsonl`
- `1886347_pitch_control_sw_average.jsonl`
- `1886347_pitch_control_minute_control.jsonl`
- `1886347_ball_touch_map_sw.jsonl`
- `1886347_match.json`
- `video_sync.json`

## Key Components

- `src/components/TrackingRadarWithDataLoader.jsx`: Main dashboard component with 2D canvas, time controls, what-if analysis, and analytics visualizations.
- `src/components/VideoPlayer.jsx`: Video player synchronized with tracking data timestamps.
- `src/components/TrackingRadar.jsx`: Simplified mock visualization component.

## Utility Scripts

The `scripts/` folder contains:

- Pitch control calculation
- Enriched tracking data generation
- Video timestamp synchronization
- Player speed and acceleration metrics export

## Required Data for the Dashboard

To display the dashboard correctly you must run the scripts in the `scripts/` folder to generate the tracking and pitch-control files, and provide the match video synchronized with the tracking data. The tracking files and the video are not included in this repository (they are listed in `.gitignore`), so you need to obtain them separately and place them in `public/data/` using the filenames expected by the app (see the list in the "Data Used" section above).

This project is designed to be easily extended to any match: once you provide the appropriate tracking files and a synchronized video, the dashboard can be used for other games with minimal changes.

## Notes

- Default FPS: `10`
- Default pitch size: `104m × 68m`
- For more details: see documentation in `docs/`
