# Football Tracking Radar - Setup Guide

## Quick Start

### Option 1: Use Vite (Recommended - Fastest)

```bash
cd c:\DataScience_Unitn\Sport_Tech_Project

# Create a minimal Vite config
npm init vite@latest . -- --template react

# Install dependencies
npm install

# Start dev server
npm run dev
```

Then open `http://localhost:5173` in your browser.

### Option 2: Create React App

```bash
npm create-react-app tracking-app
cd tracking-app
cp TrackingRadar.jsx src/
cp App.jsx src/
npm start
```

---

## Project Structure After Setup

```
Sport_Tech_Project/
├── index.html
├── index.jsx
├── App.jsx
├── TrackingRadar.jsx
├── package.json
├── vite.config.js (if using Vite)
└── Data/
    ├── 1886347_match.json
    └── 1886347_tracking_extrapolated.jsonl
```

---

## Loading Your Real JSON Data

The current component uses mock data. To load your actual JSON files:

### Step 1: Create a data loader hook

Create a file `useTrackingData.js`:

```javascript
import { useState, useEffect } from 'react';

export const useTrackingData = (jsonPath) => {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(jsonPath)
      .then(res => res.text())
      .then(text => {
        // For JSONL files (one JSON per line)
        const lines = text.split('\n').filter(line => line.trim());
        const parsed = lines.map(line => JSON.parse(line));
        setData(parsed);
      })
      .catch(err => setError(err.message));
  }, [jsonPath]);

  return { data, error };
};
```

### Step 2: Update TrackingRadar.jsx

Replace the mock data section with:

```javascript
import { useTrackingData } from './useTrackingData';

const TrackingRadar = ({ dataPath = 'Data/1886347_tracking_extrapolated.jsonl' }) => {
  const { data: trackingData, error } = useTrackingData(dataPath);
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  if (error) return <div style={{padding: '20px', color: 'red'}}>Error: {error}</div>;
  if (!trackingData.length) return <div style={{padding: '20px'}}>Loading...</div>;

  // ... rest of the component remains the same, but use trackingData instead of mockTrackingData
```

### Step 3: Expected JSON Structure

Your JSONL file should have frames like:

```json
{
  "timestamp": "12.34",
  "period": 1,
  "player_data": [
    {"player_id": 1001, "x": 10.5, "y": 34.2, ...},
    ...
  ],
  "ball_data": {"x": 52.5, "y": 34.0}
}
```

If coordinates are in meters (0-105 for length, 0-68 for width), normalize them:

```javascript
const normalizeCoords = (value, maxValue) => value / maxValue;
// Then in player object: x: normalizeCoords(player.x, 105), y: normalizeCoords(player.y, 68)
```

---

## Features

✅ **Direct Frame Indexing**: `frameIndex = Math.floor(timeSeconds * FPS)` - O(1) lookup  
✅ **Instant Updates**: No array searching, just canvas redraw  
✅ **Smooth Animation**: RequestAnimationFrame for 60fps rendering  
✅ **Time Control**: Slider + numeric input for precise control  
✅ **Play/Pause**: Automatic frame advancement  
✅ **Color Teams**: Blue (home) vs Red (away)  
✅ **Player Numbers**: Rendered on each circle  
✅ **Ball Tracking**: Yellow circle with contrast  
✅ **Pitch Drawing**: Grass green with standard markings  

---

## Performance Tips

1. **Frame Rate**: Default is 10 FPS (matches typical tracking data)
   - Adjust `FPS` constant if your data differs
   
2. **Data Optimization**: If tracking large datasets (>5000 frames)
   - Consider paginating or windowing data
   - Pre-compute pixel positions if needed

3. **Canvas vs Konva**: 
   - Canvas is ~3x faster for static scenes
   - Konva is better if you need object interactions

---

## Customization

### Change colors
In `TrackingRadar.jsx`:
```javascript
const circleColor = isHome ? '#1e90ff' : '#ff4444'; // Modify these
```

### Change canvas size
```javascript
const CANVAS_WIDTH = 700;  // Adjust
const CANVAS_HEIGHT = 700; // Adjust
```

### Change FPS
```javascript
const FPS = 10; // Change to 25 if your data is 25fps
```

---

## Troubleshooting

**Issue**: "Module not found" errors
- Make sure all imports use correct paths
- Run `npm install` to install React dependencies

**Issue**: Canvas is blank
- Check browser console for errors (F12)
- Verify `mockTrackingData` or loaded data structure
- Test with mock data first

**Issue**: Slow performance
- Reduce canvas resolution (CANVAS_WIDTH/HEIGHT)
- Check if JS is minified in production
- Profile with DevTools Performance tab

---

## Next Steps

1. Test with mock data first (current setup)
2. Implement `useTrackingData` hook for your JSON
3. Adjust normalization if coordinates are in meters
4. Customize colors and sizes to match your needs
5. Deploy to GitHub Pages or Netlify

Enjoy your tracking app! 🎯📊
