# Data Mapping Guide

This guide explains how to format your data for the tracking radar visualization.

## 📐 Coordinate System

### Input Coordinates (Meters)
Your tracking data is in **meters** with origin at center field:
```
    (-52.5, 34)  ← Top-Left (away team GK view)
         |
         |  FIELD (105m × 68m)
         |
    (0, 0) ← Center Pitch
         |
         |
    (52.5, -34) ← Bottom-Right
```

### Output Visualization
The component normalizes to **0-1 range**:
```
(0, 0) ─── (1, 0)
  |          |
  |   PITCH  |
  |          |
(0, 1) ─── (1, 1)
```

**Automatic conversion happens in TrackingRadarWithDataLoader.jsx:**
```javascript
x: (x_meters) / 105  // normalize 0-105m → 0-1
y: (y_meters) / 68   // normalize 0-68m → 0-1
```

---

## 📋 JSON Structure

Your JSONL file should have **one JSON object per line**:

```jsonl
{"timestamp": "0.10", "period": 1, "player_data": [...], "ball_data": {...}}
{"timestamp": "0.20", "period": 1, "player_data": [...], "ball_data": {...}}
{"timestamp": "0.30", "period": 1, "player_data": [...], "ball_data": {...}}
```

### Frame Object
```json
{
  "timestamp": "12.34",
  "period": 1,
  "player_data": [
    {
      "player_id": 1001,
      "number": 1,
      "team_id": 1,
      "x": 10.5,
      "y": 34.2
    },
    ...more players
  ],
  "ball_data": {
    "x": 52.5,
    "y": 34.0
  }
}
```

---

## 🔄 Field Mapping

Your actual field dimensions (from `1886347_match.json`):
- **Length**: 105m (X-axis)
- **Width**: 68m (Y-axis)

### Example Positions

| Location | X (m) | Y (m) | X (norm) | Y (norm) |
|----------|-------|-------|----------|----------|
| Home GK | -52.5 | 0 | 0 | 0.5 |
| Home Box | -78.35 | 0 | 0.25 | 0.5 |
| Center | 0 | 0 | 0.5 | 0.5 |
| Away Box | 26.25 | 0 | 0.75 | 0.5 |
| Away GK | 52.5 | 0 | 1.0 | 0.5 |

---


## 📝 Example Minimal Frame

```json
{
  "timestamp": "0.10",
  "player_data": [
    {"player_id": 1, "number": 1, "team_id": 1, "x": -52, "y": 0},
    {"player_id": 11, "number": 11, "team_id": 1, "x": 0, "y": 0},
    {"player_id": 21, "number": 1, "team_id": 2, "x": 52, "y": 0}
  ],
  "ball_data": {"x": 0, "y": 0}
}
```

This is all you need! Processing handles the rest.

---

**Questions?** Check README.md or SETUP.md for more info.
