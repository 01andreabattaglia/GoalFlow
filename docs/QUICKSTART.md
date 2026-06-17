# ⚡ Quick Start - Get Running in 30 Seconds

## Option 1: Use Vite (Recommended)

```bash
# Navigate to project
cd c:\DataScience_Unitn\Sport_Tech_Project

# Install dependencies
npm install

# Start dev server (opens automatically)
npm run dev
```

That's it! You'll see the app with **mock data** at `http://localhost:5173`

---

## Option 2: Use Create React App

```bash
cd c:\DataScience_Unitn\Sport_Tech_Project
npx create-react-app .
npm start
```

---

## Load Your Real Data (Next Step)

Edit `App.jsx`:

```javascript
<TrackingRadar 
  useMockData={false}
  dataPath="Data/1886347_tracking_extrapolated.jsonl"
/>
```

That's it - the component will:
1. Fetch your JSONL file
2. Auto-normalize meter coordinates (if 0-105 x 0-68 pitch)
3. Display it in the radar

---

## What You Get

✅ **Canvas Visualization**: Pitch with players (blue/red) and ball (yellow)  
✅ **Time Slider**: Drag to navigate, or use Play button  
✅ **Instant Updates**: Direct frame indexing, zero lag  
✅ **Flexible**: Works with mock data OR your JSON  

---

## Files You Have

- **TrackingRadar.jsx** - Simple mock-only version
- **TrackingRadarWithDataLoader.jsx** - Full version (mock + real data)
- **App.jsx** - Entry point (uses enhanced version)
- **README.md** - Full documentation

