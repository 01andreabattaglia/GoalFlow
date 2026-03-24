import React, { useRef, useEffect, useState, useCallback } from 'react';

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
          ball_data: frame.ball_data && frame.ball_data.x !== null
            ? {
                x: (frame.ball_data.x + halfLength) / pitchLengthM,
                y: (frame.ball_data.y + halfWidth) / pitchWidthM,
                is_detected: frame.ball_data.is_detected,
              }
            : { x: 0.5, y: 0.5, is_detected: false },
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
  const animationRef = useRef(null);

  // Load match data first to get pitch dimensions
  const { matchData } = useMatchData('../../data/1886347_match.json');

  // Get pitch dimensions from match data or use defaults
  const pitchLength = matchData?.pitch_length || DEFAULT_PITCH_LENGTH_M;
  const pitchWidth = matchData?.pitch_width || DEFAULT_PITCH_WIDTH_M;
  const halfLength = pitchLength / 2;
  const halfWidth = pitchWidth / 2;

  // Calculate canvas height based on pitch proportions
  const canvasHeight = Math.round(CANVAS_WIDTH * (pitchWidth / pitchLength));

  // Load real data or use mock with correct pitch dimensions
  const { data: loadedData, loading, error } = useTrackingData(dataPath || '../../data/1886347_tracking_extrapolated.jsonl', pitchLength, pitchWidth);
  
  const trackingData = useMockData ? generateMockData() : loadedData;

  // Apply filter: only show frames where ball is detected (if enabled)
  const filteredTrackingData = filterBallInAction 
    ? trackingData.filter(frame => frame.ball_data?.is_detected === true)
    : trackingData;

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

  const totalFrames = filteredTrackingData.length;
  const maxTime = totalFrames > 0 ? (totalFrames - 1) / FPS : 0;

  // Direct frame indexing (O(1) lookup)
  const frameIndex = Math.min(Math.floor(timeSeconds * FPS), Math.max(0, totalFrames - 1));
  const currentFrame = filteredTrackingData[frameIndex] || {
    timestamp: '0',
    frameNumber: 0,
    player_data: [],
    ball_data: { x: 0.5, y: 0.5, is_detected: false },
  };

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

    // Draw ball only if it has valid data
    const ballData = currentFrame.ball_data;
    const hasBallData = ballData && ballData.x !== null && ballData.y !== null && ballData.is_detected === true;
    
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
  };

  const handlePlayToggle = () => {
    setIsPlaying(!isPlaying);
  };

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

  return (
    <div style={styles.container}>
      {/* Canvas */}
      <div style={styles.canvasSection}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={canvasHeight}
          style={styles.canvas}
        />
      </div>

      {/* Controls */}
      <div style={styles.controlsSection}>
        <h2 style={styles.title}>Football Tracking Radar</h2>

        <div style={styles.timeDisplay}>
          <span style={styles.timeLabel}>Match Time:</span>
          <span style={styles.timeValue}>{currentFrame.timestamp || '--:--:--'}</span>
        </div>

        <div style={styles.periodDisplay}>
          <span style={styles.periodLabel}>Period:</span>
          <span style={styles.periodValue}>{currentFrame.period || '-'}</span>
        </div>

        <div style={styles.framedisplaySection}>
          <div style={styles.frameDisplay}>
            Frame #{currentFrame.frameNumber || frameIndex + 1}
          </div>
          <div style={styles.frameCountDisplay}>
            {getDisplayTime()} / {maxTimeDisplay}
          </div>
        </div>

        <div style={styles.sliderContainer}>
          <input
            type="range"
            min="0"
            max={maxTime}
            step={1 / FPS}
            value={timeSeconds}
            onChange={handleSliderChange}
            style={styles.slider}
          />
        </div>

        <div style={styles.inputContainer}>
          <label style={styles.label}>Jump to time:</label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <select
                value={jumpPeriod}
                onChange={(e) => setJumpPeriod(parseInt(e.target.value))}
                style={{
                  ...styles.input,
                  width: '70px',
                  padding: '6px',
                  cursor: 'pointer',
                }}
              >
                <option value={1}>1st</option>
                <option value={2}>2nd</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <input
                type="number"
                min="0"
                max={Math.floor(maxTime / 60)}
                value={jumpMinutes}
                onChange={(e) => setJumpMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  ...styles.input,
                  width: '60px',
                }}
                placeholder="MM"
              />
              <span>min</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <input
                type="number"
                min="0"
                max="59"
                value={String(jumpSeconds).padStart(2, '0')}
                onChange={(e) => setJumpSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                style={{
                  ...styles.input,
                  width: '60px',
                }}
                placeholder="SS"
              />
              <span>sec</span>
            </div>
            <button
              onClick={handleJumpToTime}
              style={{
                ...styles.button,
                backgroundColor: '#4a90e2',
                fontSize: '12px',
                padding: '8px 12px',
              }}
            >
              Jump
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

        <div style={styles.filterContainer}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={filterBallInAction}
              onChange={(e) => {
                setFilterBallInAction(e.target.checked);
                setTimeSeconds(0);
                setIsPlaying(false);
              }}
              style={styles.checkbox}
            />
            <span>Show only ball in action</span>
          </label>
          {filterBallInAction && (
            <div style={styles.filterInfo}>
              Filtered: {filteredTrackingData.length} / {trackingData.length} frames
            </div>
          )}
        </div>

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
  },
  canvasSection: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvas: {
    border: '2px solid #333',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    backgroundColor: '#2d5016',
    cursor: 'crosshair',
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
  framedisplaySection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  frameDisplay: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#333',
    padding: '8px',
    backgroundColor: '#e8f4f8',
    borderRadius: '4px',
    fontWeight: '600',
    borderLeft: '4px solid #1e90ff',
  },
  frameCountDisplay: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#999',
    padding: '6px',
  },
  sliderContainer: {
    display: 'flex',
    alignItems: 'center',
  },
  slider: {
    width: '100%',
    cursor: 'pointer',
  },
  inputContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#666',
  },
  input: {
    padding: '8px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'monospace',
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
  filterContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    backgroundColor: '#f0f8ff',
    borderRadius: '6px',
    borderLeft: '4px solid #ff6b6b',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#333',
    fontWeight: '500',
    cursor: 'pointer',
  },
  checkbox: {
    cursor: 'pointer',
    width: '16px',
    height: '16px',
  },
  filterInfo: {
    fontSize: '11px',
    color: '#999',
    paddingLeft: '24px',
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
};

export default TrackingRadar;
