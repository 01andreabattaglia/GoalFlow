import React from 'react';
import TrackingRadar from './components/TrackingRadarWithDataLoader';

// To use real data: pass useMockData={false} (default)
// To use mock data: pass useMockData={true}

function App() {
  return (
    <TrackingRadar 
      useMockData={false}  // Use real tracking data
      dataPath="/data/1886347_tracking_extrapolated.jsonl"
    />
  );
}

export default App;
