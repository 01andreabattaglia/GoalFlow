import React, { useRef, useEffect, useState, useCallback } from 'react';
import VideoPlayer from './VideoPlayer';

/**
 * Hook to load match metadata (colors, teams, players)
 */
const useMatchData = (filePath) => {
  const [matchData, setMatchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadMatchData = async () => {
      try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setMatchData(data);
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error('Error loading match data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadMatchData();
  }, [filePath]);

  return { matchData, loading, error };
};

/**
 * Hook to load video synchronization data
 */
const useVideoSyncData = (filePath) => {
  const [syncData, setSyncData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadSyncData = async () => {
      try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setSyncData(data);
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error('Error loading video sync data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSyncData();
  }, [filePath]);

  return { syncData, loading, error };
};

/**
 * Hook to load JSONL tracking data from a file with proper coordinate normalization
 */
const useTrackingData = (filePath, pitchLengthM = DEFAULT_PITCH_LENGTH_M, pitchWidthM = DEFAULT_PITCH_WIDTH_M) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const text = await response.text();
        const lines = text.split('\n').filter((line) => line.trim());
        
        // Load ALL frames, including those with null data
        const parsed = lines.map((line) => JSON.parse(line));

        const halfLength = pitchLengthM / 2;
        const halfWidth = pitchWidthM / 2;

        // Normalize coordinates: meters with center origin [-halfLength, halfLength] x [-halfWidth, halfWidth] -> [0, 1]
        const normalized = parsed.map((frame) => ({
          ...frame,
          // Keep the original frame number from JSON
          frameNumber: frame.frame,
          player_data: (frame.player_data || []).map((p) => ({
            ...p,
            x: (p.x + halfLength) / pitchLengthM,
            y: (p.y + halfWidth) / pitchWidthM,
          })),
          ball_data: frame.ball_data && frame.ball_data.x !== null && frame.ball_data.y !== null
            ? {
                x: (frame.ball_data.x + halfLength) / pitchLengthM,
                y: (frame.ball_data.y + halfWidth) / pitchWidthM,
                is_detected: frame.ball_data.is_detected,
              }
            : { x: null, y: null, is_detected: false },
        }));

        setData(normalized);
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error('Error loading tracking data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [filePath, pitchLengthM, pitchWidthM]);

  return { data, loading, error };
};

/**
 * Hook to load enriched tracking data with player stats (velocity, distance_cumulated)
 */
const useEnrichedTrackingData = (filePath) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        
        // Parse JSONL format (one JSON object per line)
        const lines = text.trim().split('\n').filter(line => line.trim().length > 0);
        const frames = lines.map((line, idx) => {
          try {
            return JSON.parse(line);
          } catch (e) {
            console.warn(`Failed to parse JSONL line ${idx}:`, e);
            return null;
          }
        }).filter(f => f !== null);
        
        console.log(`Loaded ${frames.length} frames from enriched tracking JSONL`);
        setData(frames);
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error('Error loading enriched tracking data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [filePath]);

  return { data, loading, error };
};

/**
 * Generate mock data with realistic dimensions (104m x 68m)
 */
const generateMockData = (frameCount = 250) => {
  return Array.from({ length: frameCount }, (_, frameIndex) => {
    const time = frameIndex / 10;
    const PITCH_LENGTH = 104;
    const PITCH_WIDTH = 68;
    return {
      timestamp: time.toFixed(2),
      period: frameIndex < 125 ? 1 : 2,
      player_data: [
        // HOME TEAM (blue) - team_id: 1
        ...Array.from({ length: 11 }, (_, i) => ({
          player_id: 1000 + i,
          number: i + 1,
          team_id: 1,
          x: (0.2 + i * 0.03 + Math.sin(time * 0.5 + i) * 0.05) * PITCH_LENGTH,
          y: (0.3 + Math.sin(time + i * 0.3) * 0.2) * PITCH_WIDTH,
        })),
        // AWAY TEAM (red) - team_id: 2
        ...Array.from({ length: 11 }, (_, i) => ({
          player_id: 2000 + i,
          number: i + 1,
          team_id: 2,
          x: (0.7 - i * 0.03 + Math.cos(time * 0.5 + i) * 0.05) * PITCH_LENGTH,
          y: (0.5 + Math.cos(time + i * 0.3) * 0.2) * PITCH_WIDTH,
        })),
      ],
      ball_data: {
        x: (0.45 + Math.sin(time * 0.3) * 0.1) * PITCH_LENGTH,
        y: (0.4 + Math.cos(time * 0.25) * 0.15) * PITCH_WIDTH,
      },
    };
  });
};

const FPS = 10;
const CANVAS_WIDTH = 700;
// Default pitch dimensions (will be overridden by match data)
const DEFAULT_PITCH_LENGTH_M = 104;
const DEFAULT_PITCH_WIDTH_M = 68;

// ========= PITCH RENDERER =========
const drawPitch = (ctx, width, height) => {
  ctx.fillStyle = 'white';  // white background instead of green
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.stroke();

  // Center line
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.stroke();

  // Center circle
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, width * 0.1, 0, Math.PI * 2);
  ctx.stroke();

  // Center spot
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Penalty boxes
  const boxWidth = width * 0.22;
  const boxHeight = height * 0.6;
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;

  ctx.strokeRect(0, (height - boxHeight) / 2, boxWidth, boxHeight);
  ctx.strokeRect(width - boxWidth, (height - boxHeight) / 2, boxWidth, boxHeight);

  // Goal areas
  const goalWidth = width * 0.08;
  const goalHeight = height * 0.3;
  ctx.strokeRect(0, (height - goalHeight) / 2, goalWidth, goalHeight);
  ctx.strokeRect(width - goalWidth, (height - goalHeight) / 2, goalWidth, goalHeight);
};

// ========= COORDINATE CONVERTER =========
const normalizedToPixels = (normX, normY, width, height) => {
  // Clamp to valid range
  const x = Math.max(0, Math.min(normX, 1));
  const y = Math.max(0, Math.min(normY, 1));
  return [x * width, (1 - y) * height];
};

// ========= MAIN COMPONENT =========
const TrackingRadar = ({ dataPath = null, useMockData = false }) => {
  const canvasRef = useRef(null);
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [filterBallInAction, setFilterBallInAction] = useState(false);
  const [jumpMinutes, setJumpMinutes] = useState(0);
  const [jumpSeconds, setJumpSeconds] = useState(0);
  const [jumpPeriod, setJumpPeriod] = useState(1);
  const [wasTimeChangedManually, setWasTimeChangedManually] = useState(false);
  const animationRef = useRef(null);

  // Load match data first to get pitch dimensions
  const { matchData } = useMatchData('/data/1886347_match.json');

  // Load enriched tracking data
  const { data: enrichedTrackingData } = useEnrichedTrackingData('/data/1886347_enriched_tracking.jsonl');

  // Load video sync data
  const { syncData } = useVideoSyncData('/data/video_sync.json');

  // Get pitch dimensions from match data or use defaults
  const pitchLength = matchData?.pitch_length || DEFAULT_PITCH_LENGTH_M;
  const pitchWidth = matchData?.pitch_width || DEFAULT_PITCH_WIDTH_M;
  const halfLength = pitchLength / 2;
  const halfWidth = pitchWidth / 2;

  // Calculate canvas height based on pitch proportions
  const canvasHeight = Math.round(CANVAS_WIDTH * (pitchWidth / pitchLength));

  // Load real data or use mock with correct pitch dimensions
  const { data: loadedData, loading, error } = useTrackingData(dataPath || '/data/1886347_tracking_extrapolated.jsonl', pitchLength, pitchWidth);
  
  const trackingData = useMockData ? generateMockData() : loadedData;

  // Extract team and color info from match data
  const getTeamInfo = useCallback(() => {
    if (!matchData) {
      return {
        home_id: 1,
        away_id: 2,
        home_jersey: '#1e90ff',
        home_number: '#ffffff',
        away_jersey: '#ff4444',
        away_number: '#000000',
      };
    }

    return {
      home_id: matchData.home_team?.id,
      away_id: matchData.away_team?.id,
      home_jersey: matchData.home_team_kit?.jersey_color || '#1e90ff',
      home_number: matchData.home_team_kit?.number_color || '#ffffff',
      away_jersey: matchData.away_team_kit?.jersey_color || '#ff4444',
      away_number: matchData.away_team_kit?.number_color || '#000000',
    };
  }, [matchData]);

  // Build player metadata from match data
  const getPlayerMeta = useCallback(() => {
    if (!matchData) return {};

    const meta = {};
    matchData.players?.forEach((p) => {
      if (p.id && p.team_id) {
        meta[p.id] = {
          team_id: p.team_id,
          number: p.number,
        };
      }
    });
    return meta;
  }, [matchData]);

  const teamInfo = getTeamInfo();
  const playerMeta = getPlayerMeta();

  // Use TOTAL trackingData for frame indexing, independent of filter
  const totalFrames = trackingData.length;
  const maxTime = totalFrames > 0 ? (totalFrames - 1) / FPS : 0;

  // Direct frame indexing on TOTAL data (O(1) lookup) - always same frame regardless of filter
  const frameIndex = Math.min(Math.floor(timeSeconds * FPS), Math.max(0, totalFrames - 1));
  const currentFrame = trackingData[frameIndex] || {
    timestamp: '0',
    frameNumber: 0,
    player_data: [],
    ball_data: { x: null, y: null, is_detected: false },
  };

  // Calculate synchronized video time from radar timestamp
  const calculateSyncedVideoTime = useCallback(() => {
    if (!syncData) return null;

    const period = currentFrame.period || 1;
    const timestamp = currentFrame.timestamp || '00:00:00.0';
    
    // Parse timestamp to seconds
    const timeParts = timestamp.split(':');
    const radarSeconds = parseInt(timeParts[0]) * 3600 + parseInt(timeParts[1]) * 60 + parseFloat(timeParts[2]);

    // Calculate video time based on period
    let videoTime;
    if (period === 1) {
      // First half: video_time = first_half_start + radar_seconds
      videoTime = syncData.sync_points.first_half_start + radarSeconds;
    } else {
      // Second half: video_time = second_half_start + (radar_seconds - 45 minutes)
      videoTime = syncData.sync_points.second_half_start + (radarSeconds - 45 * 60);
    }

    return Math.max(0, videoTime);
  }, [currentFrame, syncData]);

  // Only pass syncedTime to VideoPlayer when time was changed manually
  // During playback, VideoPlayer goes independently without constant updates
  const syncedVideoTime = wasTimeChangedManually ? calculateSyncedVideoTime() : null;

  // Check if current frame is visible based on filter
  const isCurrentFrameVisible = !filterBallInAction || (
    currentFrame.ball_data && 
    currentFrame.ball_data.x !== null && 
    currentFrame.ball_data.y !== null && 
    currentFrame.ball_data.is_detected === true
  );

  // Count filtered frames for display
  const filteredFramesCount = filterBallInAction
    ? trackingData.filter(frame => 
        frame.ball_data && 
        frame.ball_data.x !== null && 
        frame.ball_data.y !== null && 
        frame.ball_data.is_detected === true
      ).length
    : trackingData.length;

  // Helper functions for player data
  const getPlayerTeamId = (player) => {
    // First try to get from player metadata (mapped from match data)
    const meta = playerMeta[player.player_id];
    if (meta?.team_id) return meta.team_id;
    
    // Fallback to team_id in player object
    if (player.team_id) return player.team_id;
    
    // Last resort: use team name if available
    if (player.team === 'home') return teamInfo.home_id;
    if (player.team === 'away') return teamInfo.away_id;
    
    return teamInfo.home_id; // default
  };

  const getPlayerNumber = (player) => {
    // Try to get number from player metadata
    const meta = playerMeta[player.player_id];
    if (meta?.number) return meta.number;
    
    return player.number || player.player_id || '?';
  };

  const getPlayerColors = (player) => {
    const teamId = getPlayerTeamId(player);
    const isHome = teamId === teamInfo.home_id;
    
    return {
      jerseyColor: isHome ? teamInfo.home_jersey : teamInfo.away_jersey,
      numberColor: isHome ? teamInfo.home_number : teamInfo.away_number,
    };
  };

  // Draw function
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_WIDTH, canvasHeight);

    // Draw pitch
    drawPitch(ctx, CANVAS_WIDTH, canvasHeight);

    // Draw players
    const players = currentFrame.player_data || [];
    players.forEach((player) => {
      const x = player.x;
      const y = player.y;
      if (x === undefined || y === undefined) return;

      const [px, py] = normalizedToPixels(x, y, CANVAS_WIDTH, canvasHeight);
      const colors = getPlayerColors(player);

      // Player circle with jersey color
      ctx.fillStyle = colors.jerseyColor;
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, Math.PI * 2); // slightly larger than before
      ctx.fill();

      // Border
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Player number with number color from kit
      const number = getPlayerNumber(player);
      ctx.fillStyle = colors.numberColor;
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(number), px, py);
    });

    // Draw ball only if it has valid coordinates (regardless of is_detected)
    const ballData = currentFrame.ball_data;
    const hasBallData = ballData && ballData.x !== null && ballData.y !== null;
    
    if (hasBallData) {
      const [ballX, ballY] = normalizedToPixels(ballData.x, ballData.y, CANVAS_WIDTH, canvasHeight);
      ctx.fillStyle = '#ffff00';
      ctx.beginPath();
      ctx.arc(ballX, ballY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }, [currentFrame, playerMeta, teamInfo, canvasHeight]);

  // Redraw on frame change
  useEffect(() => {
    drawFrame();
  }, [frameIndex, drawFrame]);

  // Animation loop with proper timing
  useEffect(() => {
    if (!isPlaying || totalFrames === 0) return;

    let lastUpdateTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const deltaTime = (now - lastUpdateTime) / 1000; // convert to seconds
      lastUpdateTime = now;

      // Update time based on actual elapsed time (10 fps means 0.1 seconds per frame)
      setTimeSeconds((prev) => {
        const next = prev + deltaTime;
        return next > maxTime ? 0 : next;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, maxTime, totalFrames]);

  const handleSliderChange = (e) => {
    setTimeSeconds(parseFloat(e.target.value));
    setIsPlaying(false);
    setWasTimeChangedManually(true);
  };

  const handlePlayToggle = () => {
    setIsPlaying(!isPlaying);
    setWasTimeChangedManually(false);
  };

  // Calculate marker positions for first and second half
  const getMarkerPositions = () => {
    const firstHalfSeconds = 0; // First half starts at 0:00
    const secondHalfSeconds = 45 * 60; // Second half starts at 45:00
    
    const firstHalfPercent = (firstHalfSeconds / maxTime) * 100;
    const secondHalfPercent = (secondHalfSeconds / maxTime) * 100;
    
    return { firstHalfPercent, secondHalfPercent };
  };

  const { firstHalfPercent, secondHalfPercent } = getMarkerPositions();

  // Convert seconds to MM:SS:D format
  const formatTimeDisplay = (seconds) => {
    if (!isFinite(seconds) || seconds < 0) return '00:00:0';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const decisecs = Math.floor((seconds % 1) * 10);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${decisecs}`;
  };

  // Get current display time from currentFrame timestamp or calculated
  const getDisplayTime = () => {
    if (currentFrame.timestamp) {
      return currentFrame.timestamp; // Use actual timestamp from frame
    }
    return formatTimeDisplay(timeSeconds);
  };

  // Jump to specific minutes, seconds, and period
  const handleJumpToTime = () => {
    const targetSeconds = jumpMinutes * 60 + jumpSeconds;
    
    // Find the first frame with matching period and timestamp >= target time
    const frameIndex = trackingData.findIndex((frame) => {
      const frameSeconds = parseTimestampToSeconds(frame.timestamp);
      return frame.period === jumpPeriod && frameSeconds >= targetSeconds;
    });
    
    if (frameIndex !== -1) {
      const newTimeSeconds = frameIndex / FPS;
      setTimeSeconds(newTimeSeconds);
    } else {
      // If no frame found, jump to the last frame
      setTimeSeconds(maxTime);
    }
    setIsPlaying(false);
    setWasTimeChangedManually(true);
  };

  // Parse timestamp string "HH:MM:SS.D" to total seconds
  const parseTimestampToSeconds = (timestamp) => {
    if (!timestamp) return 0;
    const parts = timestamp.split(':');
    const hours = parseInt(parts[0]) || 0;
    const mins = parseInt(parts[1]) || 0;
    const secAndDecisec = parseFloat(parts[2]) || 0;
    return hours * 3600 + mins * 60 + secAndDecisec;
  };

  // Format max time for display
  const maxTimeDisplay = formatTimeDisplay(maxTime);

  // Error state
  if (error && !useMockData) {
    return (
      <div style={styles.errorContainer}>
        <h2>Error loading data</h2>
        <p>{error}</p>
        <p style={styles.hint}>Using mock data instead (pass useMockData=true)</p>
      </div>
    );
  }

  if (loading && !useMockData) {
    return (
      <div style={styles.loadingContainer}>
        <h2>Loading tracking data...</h2>
      </div>
    );
  }

  if (totalFrames === 0) {
    return (
      <div style={styles.errorContainer}>
        <h2>No data available</h2>
        <p>Enable mock data or check your data path</p>
      </div>
    );
  }

  // Extract players data for table
  const playersTable = matchData?.players ? matchData.players.map(p => ({
    name: `${p.first_name} ${p.last_name}`,
    number: p.number,
    team: p.team_id === teamInfo.home_id ? matchData.home_team?.short_name : matchData.away_team?.short_name,
    team_id: p.team_id,
  })).sort((a, b) => a.number - b.number) : [];

  // Helper function to calculate match time based on period
  const getMatchTime = () => {
    const period = currentFrame.period || 1;
    const timestamp = currentFrame.timestamp || '00:00:00.0';
    
    if (period === 1) {
      const seconds = parseTimestampToSeconds(timestamp);
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    
    // Period 2: subtract 45 minutes from timestamp
    const seconds = parseTimestampToSeconds(timestamp);
    const adjustedSeconds = Math.max(0, seconds - 45 * 60);
    
    const mins = Math.floor(adjustedSeconds / 60);
    const secs = Math.floor(adjustedSeconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Helper function to format minutes to MM:SS
  const formatMinutesPlayed = (minutes) => {
    if (!minutes || isNaN(minutes)) return '00:00';
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Get enriched tracking data for current frame
  let enrichedPlayersData = [];
  
  try {
    if (enrichedTrackingData && enrichedTrackingData.length > 0) {
      // Enriched data contains frames every 10 frames (0, 10, 20, 30...)
      // Find the matching enriched frame by searching for the frame number
      const targetFrameNum = Math.floor(frameIndex / 10) * 10;
      
      const enrichedFrame = enrichedTrackingData.find(f => f && f.frame === targetFrameNum);
      
      if (enrichedFrame && enrichedFrame.players && Array.isArray(enrichedFrame.players)) {
        enrichedPlayersData = enrichedFrame.players
          .filter(p => p && p.name) // Filter out invalid players
          .map(p => {
            try {
              const vel = parseFloat(p.velocity_kmh);
              const dist = parseFloat(p.distance_cumulated);
              const numberColor = p.team_id === teamInfo.home_id ? teamInfo.home_number : teamInfo.away_number;
              
              return {
                player_id: p.player_id,
                name: p.name || 'Unknown',
                number: p.number || '?',
                team_id: p.team_id,
                jersey_color: p.jersey_color || '#000000',
                number_color: numberColor || '#ffffff',
                role: p.role || 'N/A',
                status: p.status || 'unknown',
                minutes_played: p.minutes_played !== undefined && p.minutes_played !== null ? parseFloat(p.minutes_played) : 0,
                velocity_kmh: !isNaN(vel) && vel !== null ? vel.toFixed(2) : '--',
                distance_cumulated: !isNaN(dist) && dist !== null ? (dist / 1000).toFixed(3) : '0.000',
                walking_time: p.walking_time || '00:00',
                jogging_time: p.jogging_time || '00:00',
                sprinting_time: p.sprinting_time || '00:00',
              };
            } catch (playerErr) {
              console.warn('Error mapping player:', p, playerErr);
              return null;
            }
          })
          .filter(p => p !== null)
          .sort((a, b) => {
            const distA = parseFloat(a.distance_cumulated);
            const distB = parseFloat(b.distance_cumulated);
            return isNaN(distB) || isNaN(distA) ? 0 : distB - distA;
          });
      }
    }
  } catch (e) {
    console.error('Error getting enriched players data:', e);
    enrichedPlayersData = [];
  }

  return (
    <div style={styles.container}>
      {/* Left Panel - Grid Layout */}
      <div style={styles.leftPanel}>
        {/* Top Row */}
        <div style={styles.quadrantRow}>
          {/* Top Left - Video Player */}
          <div style={styles.quadrant}>
            <VideoPlayer syncedTime={syncedVideoTime} shouldPlay={isPlaying} />
          </div>
          
          {/* Top Right - Radar */}
          <div style={styles.quadrant}>
            <div style={styles.radarContainer}>
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={canvasHeight}
                style={styles.canvas}
              />
            </div>
          </div>
        </div>

        {/* Bottom Row - Full Width Table */}
        <div style={styles.bottomRow}>
          <div style={styles.tableContainer}>
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th style={styles.tableHeaderCell}>Stato</th>
                    <th style={styles.tableHeaderCell}>#</th>
                    <th style={styles.tableHeaderCell}>Nome</th>
                    <th style={styles.tableHeaderCell}>Ruolo</th>
                    <th style={styles.tableHeaderCell}>Min Giocati</th>
                    <th style={styles.tableHeaderCell}>Distanza (km)</th>
                    <th style={styles.tableHeaderCell}>Velocità (km/h)</th>
                    <th style={styles.tableHeaderCell}>Sprinting (min)</th>
                    <th style={styles.tableHeaderCell}>Jogging (min)</th>
                    <th style={styles.tableHeaderCell}>Walking (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichedPlayersData && enrichedPlayersData.length > 0 ? enrichedPlayersData.map((player, idx) => {
                    if (!player) return null;
                    return (
                    <tr key={idx} style={styles.tableRow}>
                      <td style={{
                        ...styles.tableCell,
                        backgroundColor: player.status === 'playing' ? '#90EE90' : player.status === 'substituted' ? '#FFB6C1' : '#D3D3D3',
                        fontWeight: 'bold',
                      }}>
                        {player.status === 'playing' ? '🟢 In campo' : player.status === 'substituted' ? '🔴 Sostituito' : '⚫ Panchina'}
                      </td>
                      <td style={{...styles.tableCell, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: player.jersey_color || '#000000',
                            border: '2px solid #333',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: player.number_color || '#ffffff',
                            fontWeight: 'bold',
                            fontSize: '13px',
                          }}
                        >
                          {player.number}
                        </div>
                      </td>
                      <td style={styles.tableCell}>{player.name || 'N/A'}</td>
                      <td style={styles.tableCell}>{player.role || 'N/A'}</td>
                      <td style={styles.tableCell}>{formatMinutesPlayed(player.minutes_played)}</td>
                      <td style={styles.tableCell}>{player.distance_cumulated || '0'}</td>
                      <td style={styles.tableCell}>{player.velocity_kmh || '--'}</td>
                      <td style={styles.tableCell}>{player.sprinting_time || '00:00'}</td>
                      <td style={styles.tableCell}>{player.jogging_time || '00:00'}</td>
                      <td style={styles.tableCell}>{player.walking_time || '00:00'}</td>
                    </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan="10" style={{...styles.tableCell, textAlign: 'center'}}>
                        Caricamento dati...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Controls - Right Panel */}
      <div style={styles.controlsSection}>
        <h2 style={styles.title}>Football Tracking Radar</h2>

        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px', marginBottom: '16px', borderLeft: '4px solid #1e90ff'}}>
          <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
            <span style={{fontSize: '12px', color: '#999', fontWeight: '600', textTransform: 'uppercase'}}>Period</span>
            <span style={{fontSize: '24px', fontWeight: 'bold', color: '#1e90ff'}}>{currentFrame.period || '-'}</span>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
            <span style={{fontSize: '12px', color: '#999', fontWeight: '600', textTransform: 'uppercase'}}>Time</span>
            <span style={{fontSize: '24px', fontWeight: 'bold', color: '#1e90ff', fontFamily: 'monospace'}}>{getMatchTime()}</span>
          </div>
        </div>

        <div style={styles.sliderContainer}>
          <div style={styles.sliderWrapper}>
            <input
              type="range"
              min="0"
              max={maxTime}
              step={1 / FPS}
              value={timeSeconds}
              onChange={handleSliderChange}
              style={styles.slider}
            />
            <div style={styles.timelineMarkers}>
              <div style={{...styles.marker, left: `${firstHalfPercent}%`}}>
                <div style={styles.markerLine}></div>
                <span style={styles.markerLabel}>1st</span>
              </div>
              <div style={{...styles.marker, left: `${secondHalfPercent}%`}}>
                <div style={styles.markerLine}></div>
                <span style={styles.markerLabel}>2nd</span>
              </div>
            </div>
          </div>
        </div>

        <div style={styles.jumpToTimeContainer}>
          <div style={styles.jumpHeaderRow}>
            <label style={styles.label}>Jump to time</label>
            <div style={styles.jumpSelectHeader}>
              <select
                value={jumpPeriod}
                onChange={(e) => setJumpPeriod(parseInt(e.target.value))}
                style={styles.jumpSelectInput}
              >
                <option value={1}>1st Half</option>
                <option value={2}>2nd Half</option>
              </select>
            </div>
          </div>
          <div style={styles.jumpInputGrid}>
            <div style={styles.jumpTimeInputs}>
              <input
                type="number"
                min="0"
                max={Math.floor(maxTime / 60)}
                value={jumpMinutes || ''}
                onChange={(e) => setJumpMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  ...styles.jumpInput,
                  color: jumpMinutes ? '#000' : '#999'
                }}
                placeholder="00"
              />
              <span style={styles.timeSeparator}>:</span>
              <input
                type="number"
                min="0"
                max="59"
                value={jumpSeconds ? String(jumpSeconds).padStart(2, '0') : ''}
                onChange={(e) => setJumpSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                style={{
                  ...styles.jumpInput,
                  color: jumpSeconds ? '#000' : '#999'
                }}
                placeholder="00"
              />
            </div>
            <button
              onClick={handleJumpToTime}
              style={styles.jumpButton}
            >
              Go
            </button>
          </div>
        </div>

        <button
          onClick={handlePlayToggle}
          style={{
            ...styles.button,
            backgroundColor: isPlaying ? '#ff6b6b' : '#51cf66',
          }}
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>

        <div style={styles.legend}>
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendDot, backgroundColor: teamInfo.home_jersey }} />
            <span>{matchData?.home_team?.name || 'Home'}</span>
          </div>
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendDot, backgroundColor: teamInfo.away_jersey }} />
            <span>{matchData?.away_team?.name || 'Away'}</span>
          </div>
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendDot, backgroundColor: '#ffff00', border: '1px solid black' }} />
            <span>Ball</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ========= STYLES =========
const styles = {
  container: {
    display: 'flex',
    gap: '20px',
    padding: '20px',
    backgroundColor: '#f5f5f5',
    minHeight: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    height: '100%',
  },
  leftPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    minHeight: '0',
  },
  quadrantRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    flex: 1,
    minHeight: '300px',
  },
  quadrant: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '10px',
    minHeight: '300px',
    overflow: 'hidden',
  },
  emptyQuadrant: {
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: '6px',
    border: '2px dashed #ddd',
  },
  emptyText: {
    color: '#999',
    fontSize: '14px',
    fontWeight: '600',
    margin: 0,
  },
  radarContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    padding: '10px',
  },
  bottomRow: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    padding: '20px',
    minHeight: '200px',
    maxHeight: '300px',
  },
  tableContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    height: '100%',
  },
  tableTitle: {
    margin: '0 0 12px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
    flexShrink: 0,
  },
  tableWrapper: {
    overflowX: 'auto',
    overflowY: 'auto',
    borderRadius: '6px',
    border: '1px solid #ddd',
    flex: 1,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  tableHeader: {
    backgroundColor: '#f0f0f0',
    borderBottom: '2px solid #ddd',
    position: 'sticky',
    top: 0,
  },
  tableHeaderCell: {
    padding: '12px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#333',
    borderRight: '1px solid #e0e0e0',
  },
  tableRow: {
    borderBottom: '1px solid #e0e0e0',
    transition: 'background-color 0.2s',
    height: '28px',
  },
  tableCell: {
    padding: '4px 8px',
    borderRight: '1px solid #e0e0e0',
    fontSize: '13px',
  },
  canvas: {
    border: '2px solid #333',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    backgroundColor: '#2d5016',
    cursor: 'crosshair',
    maxWidth: '100%',
    maxHeight: '100%',
    width: 'auto',
    height: 'auto',
  },
  controlsSection: {
    width: '280px',
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  title: {
    margin: '0 0 12px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
  },
  timeDisplay: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: '#f0f0f0',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
  },
  timeLabel: {
    color: '#666',
  },
  timeValue: {
    color: '#1e90ff',
    fontWeight: '700',
    fontFamily: 'monospace',
    fontSize: '16px',
  },
  periodDisplay: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: '#fff3cd',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    borderLeft: '4px solid #ffc107',
  },
  periodLabel: {
    color: '#666',
  },
  periodValue: {
    color: '#ff6b35',
    fontWeight: '700',
    fontSize: '14px',
  },
  sliderContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
  },
  sliderWrapper: {
    position: 'relative',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  slider: {
    width: '100%',
    cursor: 'pointer',
  },
  label: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#666',
  },
  button: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    color: 'white',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  legend: {
    padding: '12px',
    backgroundColor: '#f9f9f9',
    borderRadius: '6px',
    fontSize: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  legendDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    gap: '16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#d62728',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#666',
  },
  hint: {
    fontSize: '12px',
    color: '#999',
  },
  timelineMarkers: {
    position: 'relative',
    width: '100%',
    height: '30px',
  },
  marker: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    transform: 'translateX(-50%)',
    top: '0',
  },
  markerLine: {
    width: '2px',
    height: '12px',
    backgroundColor: '#1e90ff',
  },
  markerLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
  },
  jumpToTimeContainer: {
    padding: '16px',
    backgroundColor: '#f0f8ff',
    border: '2px solid #1e90ff',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  jumpHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  jumpSelectHeader: {
    width: '120px',
  },
  jumpInputGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '10px',
    alignItems: 'center',
  },
  jumpSelectInput: {
    width: '100%',
    padding: '8px',
    border: '1px solid #ccc',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    backgroundColor: 'white',
  },
  jumpTimeInputs: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    flex: 1,
  },
  jumpInput: {
    width: '55px',
    padding: '8px',
    border: '1px solid #ccc',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  jumpInputPlaceholder: {
    color: 'rgba(0, 0, 0, 0.3)',
  },
  timeSeparator: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333',
  },
  jumpButton: {
    padding: '8px 16px',
    backgroundColor: '#1e90ff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
};

export default TrackingRadar;