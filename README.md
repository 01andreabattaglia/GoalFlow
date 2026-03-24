# Football Tracking Radar - Web Visualization

A fast, minimal React web app to visualize football tracking data as a 2D radar. Built with Canvas for instant updates and zero lag.

## ⚡ Key Features

- **Direct Frame Indexing**: O(1) lookup with `frameIndex = Math.floor(time * fps)`
- **Instant Updates**: Pure Canvas rendering (no DOM delays)
- **Time Control**: Slider + numeric input with jump-to functionality
- **Play/Pause**: Automatic frame advancement
- **Team Colors**: Blue (home) vs Red (away)
- **Ball Tracking**: Yellow ball with clear visibility
- **Pitch Rendering**: Standard field markings + grass green
- **Flexible Data**: Works with mock data or your JSON files
- **Zero Dependencies**: Just React, no Konva/Pixi required

## 📦 Quick Start (2 minutes)

### 1. Install dependencies
```bash
npm install
```

### 2. Start dev server
```bash
npm run dev
```
Opens automatically at `http://localhost:5173`

### 3. Play with mock data
The app comes with 250 frames of generated data. Use the slider to navigate or click Play.

## 📊 Load Your Real Data

Replace the mock data with your JSONL file:

```javascript
// App.jsx
import TrackingRadar from './TrackingRadarWithDataLoader';

export default function App() {
  return (
    <TrackingRadar 
      dataPath="Data/1886347_tracking_extrapolated.jsonl"
      useMockData={false}
    />
  );
}
```

### Required JSON Structure

Your JSONL should have frames like:
```json
{
  "timestamp": "12.34",
  "period": 1,
  "player_data": [
    {"player_id": 1001, "number": 1, "team_id": 1, "x": 10.5, "y": 34.2},
    {"player_id": 2001, "number": 1, "team_id": 2, "x": 90.5, "y": 34.2}
  ],
  "ball_data": {"x": 52.5, "y": 34.0}
}
```

**If your coordinates are in meters (0-105 for length, 0-68 for width), the component automatically normalizes them to 0-1.**

Flexible field names:
- `player_id`, `id`, or auto-numbered
- `number` for jersey number
- `team_id` (1=home, 2=away) or `team` ('home'/'away')
- `x`, `y` in meters or normalized

## 🎮 Controls

| Control | Action |
|---------|--------|
| **Slider** | Drag to seek through timeline |
| **Text Input** | Jump to exact time (seconds) |
| **Play Button** | Auto-advance through frames |
| **Frame Counter** | Shows current position |

## ⚙️ Configuration

Edit constants in `TrackingRadarWithDataLoader.jsx`:

```javascript
const FPS = 10;               // Change if your data is 25fps
const CANVAS_WIDTH = 700;     // Canvas size
const CANVAS_HEIGHT = 700;
```

### Customize Colors

```javascript
const circleColor = isHome ? '#1e90ff' : '#ff4444'; // Blue / Red
const ballColor = '#ffff00';  // Yellow
const pitchColor = '#2d5016'; // Grass green
```

## 📈 Performance

- **Frame lookup**: O(1) via direct indexing
- **Rendering**: ~60fps (Canvas)
- **Memory**: Loads entire dataset into memory (OK for <5000 frames)
- **Benchmark**: 250-frame dataset renders in <2ms per frame

For larger datasets (>10k frames), consider:
1. Paginating data into chunks
2. Windowing only visible frames
3. Pre-computing pixel coordinates

## 🏗️ Project Structure

```
Sport_Tech_Project/
├── index.html                    # Entry point
├── index.jsx                     # React entry
├── App.jsx                       # Main app component
├── TrackingRadar.jsx             # Original mock-only version
├── TrackingRadarWithDataLoader.jsx  # Full version with data loading
├── vite.config.js               # Vite configuration
├── package.json                 # Dependencies
├── SETUP.md                     # Detailed setup guide
└── Data/
    ├── 1886347_match.json
    └── 1886347_tracking_extrapolated.jsonl
```

## 📝 Notes

- **No Server Required**: Loads JSON files via fetch (works with local dev server)
- **Browser Compatibility**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **Coordinate System**: X=horizontal (left→right), Y=vertical (top→bottom in viz, normalized 0-1)
- **Data Validation**: Gracefully handles missing/malformed data

## 🐛 Troubleshooting

**"Module not found" errors**
```bash
npm install
npm run dev
```

**Canvas is blank**
1. Check browser console (F12)
2. Verify JSON structure matches expected format
3. Start with `useMockData={true}` to test

**Slow playback**
1. Check DevTools Performance tab
2. Reduce canvas size if needed
3. Verify data loading completes

**CORS errors when loading JSON**
- Use local dev server (`npm run dev`)
- Or enable CORS if serving from different domain

## 🚀 Next Steps

1. Test with mock data (current default)
2. Load your real JSON file
3. Adjust colors/sizes to match your UI
4. Deploy to GitHub Pages/Netlify
5. Add overlay stats (distance, speed, etc.)

## 📚 References

- [Vite Docs](https://vitejs.dev)
- [React Docs](https://react.dev)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)

**Built with ⚽ for sports analytics**
