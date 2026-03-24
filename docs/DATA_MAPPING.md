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

## 🎨 Team Assignment

### Using team_id (Recommended)
```python
"team_id": 1  # Home (rendered blue)
"team_id": 2  # Away (rendered red)
```

### Or using team string
```python
"team": "home"  # Rendered blue
"team": "away"  # Rendered red
```

---

## 🔢 Required vs Optional Fields

### Required
- `timestamp` - Time in seconds (for UI display)
- `player_data` - Array of player objects
- `ball_data` - Object with x, y coordinates

### Required per Player
- `x`, `y` - Coordinates (meters)
- Either `team_id` OR `team` - Team identification

### Optional per Player
- `number` - Jersey number (shown on radar)
- `player_id` - Unique ID
- other metadata fields (will be ignored)

### Optional Frame Fields
- `period` - Which half (for UI)
- Other metadata fields (ignored)

---

## ✅ Data Validation Checklist

Before loading your data:

- [ ] File is JSONL format (1 JSON per line)
- [ ] Each frame has `timestamp`, `player_data`, `ball_data`
- [ ] Players have `x`, `y`, and `team_id` or `team`
- [ ] Coordinates are in meters (or set normalization scale)
- [ ] Ball data has `x`, `y`
- [ ] No syntax errors (use [jsonlint.com](https://jsonlint.com))

---

## 🔧 Custom Normalization

If your pitch dimensions differ from 105m × 68m, update:

```javascript
// In TrackingRadarWithDataLoader.jsx, line ~40-50
const normalized = parsed.map((frame) => ({
  player_data: (frame.player_data || []).map((p) => ({
    ...p,
    x: (p.x || 0) / 120,  // Change 120 to YOUR field length
    y: (p.y || 0) / 75,   // Change 75 to YOUR field width
  })),
  ...
}));
```

Or hardcode in your JSON **before loading** (normalized to 0-1):
```json
{"player_data": [{"x": 0.1, "y": 0.5, ...}], ...}
```

---

## 📊 Test with Sample Data

Your files:
```
Data/1886347_match.json          ← Metadata
Data/1886347_tracking_extrapolated.jsonl  ← Tracking frames
```

Expected match.json fields:
```json
{
  "pitch_length": 105,
  "pitch_width": 68,
  "home_team": {"id": 1, ...},
  "away_team": {"id": 2, ...},
  ...
}
```

Expected tracking format:
```jsonl
{"timestamp": "0.00", "player_data": [...], "ball_data": {...}}
...
```

---

## 🚀 Load Your Data

Update `App.jsx`:
```javascript
<TrackingRadar 
  dataPath="Data/1886347_tracking_extrapolated.jsonl"
  useMockData={false}
/>
```

The component will:
1. Fetch the JSONL file
2. Parse line-by-line
3. Auto-normalize coordinates
4. Display immediately

---

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| "Unexpected token" | Check JSON syntax with online validator |
| Blank canvas | Verify coordinates are present (`x` and `y`) |
| Players off-screen | Check coordinate normalization is correct |
| Data not loading | Ensure file path is correct relative to `public/` |
| Wrong team colors | Check `team_id` (1=home blue, 2=away red) |

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
