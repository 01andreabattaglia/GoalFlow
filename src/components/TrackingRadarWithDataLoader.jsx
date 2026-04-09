import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
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
 * Hook to load pitch control frames from JSONL.
 */
const usePitchControlData = (filePath) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();

        const lines = text.trim().split('\n').filter((line) => line.trim().length > 0);
        const frames = lines
          .map((line, idx) => {
            try {
              return JSON.parse(line);
            } catch (e) {
              console.warn(`Failed to parse pitch control JSONL line ${idx}:`, e);
              return null;
            }
          })
          .filter((f) => f !== null);

        setData(frames);
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error('Error loading pitch control data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [filePath]);

  return { data, loading, error };
};

/**
 * Hook to load player max acceleration and speed parameters from CSV.
 */
const usePlayerParams = (filePath) => {
  const [paramsByPlayerId, setParamsByPlayerId] = useState({});

  useEffect(() => {
    const loadParams = async () => {
      try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const text = await response.text();
        const lines = text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        if (lines.length <= 1) {
          setParamsByPlayerId({});
          return;
        }

        const headers = lines[0].split(',').map((h) => h.trim());
        const playerIdIdx = headers.indexOf('player_id');
        const accelIdx = headers.indexOf('max_acceleration_mps2');
        const vmaxKmhIdx = headers.indexOf('max_speed_kmh');

        if (playerIdIdx < 0 || accelIdx < 0 || vmaxKmhIdx < 0) {
          setParamsByPlayerId({});
          return;
        }

        const mapped = {};
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim());
          const playerId = Number(cols[playerIdIdx]);
          const accel = Number(cols[accelIdx]);
          const vmaxKmh = Number(cols[vmaxKmhIdx]);
          if (!Number.isFinite(playerId) || !Number.isFinite(accel) || !Number.isFinite(vmaxKmh)) continue;

          mapped[playerId] = {
            accel,
            vmax: vmaxKmh / 3.6,
          };
        }

        setParamsByPlayerId(mapped);
      } catch (err) {
        console.error('Error loading player params CSV:', err);
        setParamsByPlayerId({});
      }
    };

    loadParams();
  }, [filePath]);

  return paramsByPlayerId;
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
const CANVAS_WIDTH = 800;
// Default pitch dimensions (will be overridden by match data)
const DEFAULT_PITCH_LENGTH_M = 104;
const DEFAULT_PITCH_WIDTH_M = 68;

// ========= PITCH RENDERER =========
const drawPitch = (ctx, width, height, pitchColor = 'white') => {
  ctx.fillStyle = pitchColor;
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

const decodeControlRleRows = (rleRows, widthCells, heightCells) => {
  if (!Array.isArray(rleRows) || widthCells <= 0 || heightCells <= 0) return [];

  const matrix = [];
  for (let rowIdx = 0; rowIdx < Math.min(heightCells, rleRows.length); rowIdx++) {
    const rowEncoding = rleRows[rowIdx];
    const row = [];

    if (Array.isArray(rowEncoding)) {
      rowEncoding.forEach((pair) => {
        if (!Array.isArray(pair) || pair.length < 2) return;
        const value = Number(pair[0]) || 0;
        const count = Math.max(0, Number(pair[1]) || 0);
        for (let i = 0; i < count; i++) row.push(value);
      });
    }

    if (row.length < widthCells) {
      const padCount = widthCells - row.length;
      for (let i = 0; i < padCount; i++) row.push(0);
    }

    matrix.push(row.slice(0, widthCells));
  }

  while (matrix.length < heightCells) {
    matrix.push(Array.from({ length: widthCells }, () => 0));
  }

  return matrix;
};

const inferGridSizeFromRleRows = (rleRows) => {
  if (!Array.isArray(rleRows) || rleRows.length === 0) {
    return { widthCells: 0, heightCells: 0 };
  }

  const heightCells = rleRows.length;
  let widthCells = 0;

  rleRows.forEach((rowEncoding) => {
    if (!Array.isArray(rowEncoding)) return;
    const rowWidth = rowEncoding.reduce((sum, pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return sum;
      return sum + Math.max(0, Number(pair[1]) || 0);
    }, 0);
    if (rowWidth > widthCells) widthCells = rowWidth;
  });

  return { widthCells, heightCells };
};

const toRgba = (hex, alpha) => {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return hex;

  const raw = hex.slice(1);
  const full = raw.length === 3
    ? raw.split('').map((c) => c + c).join('')
    : raw;

  if (full.length !== 6) return hex;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizedToPitchMeters = (normX, normY, pitchLength, pitchWidth) => ({
  x: normX * pitchLength - pitchLength / 2,
  y: normY * pitchWidth - pitchWidth / 2,
});

const ballTimeToCell = (ballX, ballY, cellX, cellY, sBall) => {
  const dx = cellX - ballX;
  const dy = cellY - ballY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-9) return 0;
  if (sBall <= 0) return Number.POSITIVE_INFINITY;
  return dist / sBall;
};

const playerTimeToCell = (px, py, vx, vy, cellX, cellY, accel, vmax) => {
  const dx = cellX - px;
  const dy = cellY - py;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-9) return 0;
  if (vmax <= 0 && accel <= 0) return Number.POSITIVE_INFINITY;

  const ux = dx / d;
  const uy = dy / d;
  let v0 = Math.max(0, vx * ux + vy * uy);

  const safeVmax = Math.max(vmax, 1e-6);
  if (v0 > safeVmax) v0 = safeVmax;

  if (accel <= 0) {
    const vConst = Math.max(Math.min(safeVmax, Math.max(v0, 1e-6)), 1e-6);
    return d / vConst;
  }

  const tAcc = Math.max(0, (safeVmax - v0) / accel);
  const dAcc = v0 * tAcc + 0.5 * accel * tAcc * tAcc;

  if (d <= dAcc) {
    const disc = Math.max(0, v0 * v0 + 2 * accel * d);
    return (-v0 + Math.sqrt(disc)) / accel;
  }

  return tAcc + (d - dAcc) / safeVmax;
};

const classifyControlCell = (th, ta, tb, eps) => {
  if (th < tb && ta < tb) return 0;
  if (th < tb && tb < ta) return 1;
  if (ta < tb && tb < th) return -1;
  if (tb < th && tb < ta) {
    if (th + eps < ta) return 1;
    if (ta + eps < th) return -1;
    return 0;
  }
  return 0;
};

const computePitchControlMatrix = ({
  players,
  ball,
  pitchLength,
  pitchWidth,
  homeTeamId,
  awayTeamId,
  cellSize = 1.0,
  sBall = 18.0,
  eps = 0.3,
}) => {
  if (!Array.isArray(players) || players.length === 0 || !pitchLength || !pitchWidth) {
    return null;
  }

  const xMin = -pitchLength / 2;
  const xMax = pitchLength / 2;
  const yMin = -pitchWidth / 2;
  const yMax = pitchWidth / 2;

  const widthCells = Math.max(1, Math.floor((xMax - xMin) / cellSize));
  const heightCells = Math.max(1, Math.floor((yMax - yMin) / cellSize));
  const matrix = Array.from({ length: heightCells }, () => Array.from({ length: widthCells }, () => 0));

  for (let i = 0; i < heightCells; i++) {
    for (let j = 0; j < widthCells; j++) {
      const cellX = xMin + (j + 0.5) * cellSize;
      const cellY = yMin + (i + 0.5) * cellSize;

      const tb = ballTimeToCell(ball.x, ball.y, cellX, cellY, sBall);
      let th = Number.POSITIVE_INFINITY;
      let ta = Number.POSITIVE_INFINITY;

      for (let pIdx = 0; pIdx < players.length; pIdx++) {
        const p = players[pIdx];
        const tp = playerTimeToCell(
          p.x,
          p.y,
          p.vx,
          p.vy,
          cellX,
          cellY,
          p.accel,
          p.vmax,
        );

        if (p.team_id === homeTeamId && tp < th) th = tp;
        else if (p.team_id === awayTeamId && tp < ta) ta = tp;
      }

      matrix[i][j] = classifyControlCell(th, ta, tb, eps);
    }
  }

  return { matrix, widthCells, heightCells };
};

const drawPitchControlMatrix = (ctx, controlMatrixObj, width, height, controlColors) => {
  if (!controlMatrixObj || !controlMatrixObj.matrix) return;

  const { matrix, widthCells, heightCells } = controlMatrixObj;
  if (!widthCells || !heightCells) return;

  const cellW = width / widthCells;
  const cellH = height / heightCells;

  for (let row = 0; row < heightCells; row++) {
    const drawRow = heightCells - 1 - row;
    const rowData = matrix[row];

    for (let col = 0; col < widthCells; col++) {
      const value = rowData[col];
      if (value === 1) {
        ctx.fillStyle = toRgba(controlColors.home, 0.22);
      } else if (value === -1) {
        ctx.fillStyle = toRgba(controlColors.away, 0.22);
      } else {
        ctx.fillStyle = toRgba(controlColors.neutral, 0.22);
      }

      ctx.fillRect(col * cellW, drawRow * cellH, cellW, cellH);
    }
  }
};

const drawPitchControlOverlay = (ctx, pitchControlFrame, width, height, controlColors) => {
  if (!pitchControlFrame) return;

  const rleRows = pitchControlFrame.control_rle_rows;

  const gridWidthFromMeta = pitchControlFrame.grid?.width_cells;
  const gridHeightFromMeta = pitchControlFrame.grid?.height_cells;

  const inferredGrid = inferGridSizeFromRleRows(rleRows);
  const widthCells = gridWidthFromMeta || inferredGrid.widthCells;
  const heightCells = gridHeightFromMeta || inferredGrid.heightCells;

  if (!widthCells || !heightCells || !Array.isArray(rleRows)) return;

  const controlMatrix = decodeControlRleRows(rleRows, widthCells, heightCells);
  if (!controlMatrix.length) return;

  const cellW = width / widthCells;
  const cellH = height / heightCells;

  for (let row = 0; row < heightCells; row++) {
    const rowData = controlMatrix[row];
    const drawRow = heightCells - 1 - row;
    for (let col = 0; col < widthCells; col++) {
      const value = rowData[col];
      if (value === 1) {
        ctx.fillStyle = toRgba(controlColors.home, 0.22);
      } else if (value === -1) {
        ctx.fillStyle = toRgba(controlColors.away, 0.22);
      } else {
        ctx.fillStyle = toRgba(controlColors.neutral, 0.22);
      }

      ctx.fillRect(col * cellW, drawRow * cellH, cellW, cellH);
    }
  }
};

// ========= MAIN COMPONENT =========
const TrackingRadar = ({ dataPath = null, useMockData = false }) => {
  const canvasRef = useRef(null);
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedDashboard, setSelectedDashboard] = useState('physical');
  const [physicalColors, setPhysicalColors] = useState({
    home: '#1e90ff',
    away: '#ff4444',
    field: '#6EA26D',
  });
  const [hasCustomPhysicalColors, setHasCustomPhysicalColors] = useState(false);
  const [pitchControlColors, setPitchControlColors] = useState({
    home: '#1e90ff',
    away: '#ff4444',
    neutral: '#d7dce8',
  });
  const [hasCustomPitchColors, setHasCustomPitchColors] = useState(false);
  const [filterBallInAction, setFilterBallInAction] = useState(false);
  const [jumpMinutes, setJumpMinutes] = useState(0);
  const [jumpSeconds, setJumpSeconds] = useState(0);
  const [jumpPeriod, setJumpPeriod] = useState(1);
  const [wasTimeChangedManually, setWasTimeChangedManually] = useState(false);
  const [isWhatIfSimulationOpen, setIsWhatIfSimulationOpen] = useState(false);
  const [whatIfInitialPositions, setWhatIfInitialPositions] = useState({});
  const [whatIfPlayerPositions, setWhatIfPlayerPositions] = useState({});
  const [draggedPlayerId, setDraggedPlayerId] = useState(null);
  const animationRef = useRef(null);

  // Load match data first to get pitch dimensions
  const { matchData } = useMatchData('/data/1886347_match.json');

  // Load enriched tracking data
  const { data: enrichedTrackingData } = useEnrichedTrackingData('/data/1886347_enriched_tracking.jsonl');

  // Load pitch control data
  const { data: pitchControlData } = usePitchControlData('/data/1886347_pitch_control.jsonl');

  // Load video sync data
  const { syncData } = useVideoSyncData('/data/video_sync.json');

  // Load per-player acceleration and max speed used by pitch control equations
  const playerParamsById = usePlayerParams('/data/1886347_player_max_speed_accel.csv');

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

  useEffect(() => {
    if (hasCustomPhysicalColors) return;
    setPhysicalColors((prev) => ({
      ...prev,
      home: teamInfo.home_jersey || prev.home,
      away: teamInfo.away_jersey || prev.away,
    }));
  }, [teamInfo.home_jersey, teamInfo.away_jersey, hasCustomPhysicalColors]);

  useEffect(() => {
    if (hasCustomPitchColors) return;
    setPitchControlColors((prev) => ({
      ...prev,
      home: teamInfo.home_jersey || prev.home,
      away: teamInfo.away_jersey || prev.away,
    }));
  }, [teamInfo.home_jersey, teamInfo.away_jersey, hasCustomPitchColors]);

  useEffect(() => {
    if (selectedDashboard !== 'pitch-control') {
      setIsWhatIfSimulationOpen(false);
    }
  }, [selectedDashboard]);

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

  // Find closest pitch control frame to current tracking frame.
  const currentPitchControlFrame = useMemo(() => {
    if (!pitchControlData || pitchControlData.length === 0) return null;

    const currentTrackingFrame = currentFrame.frameNumber ?? currentFrame.frame;
    if (currentTrackingFrame === undefined || currentTrackingFrame === null) {
      return pitchControlData[0];
    }

    let best = pitchControlData[0];
    let bestDiff = Math.abs((best.frame ?? 0) - currentTrackingFrame);

    for (let i = 1; i < pitchControlData.length; i++) {
      const candidate = pitchControlData[i];
      const diff = Math.abs((candidate.frame ?? 0) - currentTrackingFrame);
      if (diff < bestDiff) {
        best = candidate;
        bestDiff = diff;
      }
    }

    return best;
  }, [pitchControlData, currentFrame]);

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
    const dashboardHome = selectedDashboard === 'physical' ? physicalColors.home : teamInfo.home_jersey;
    const dashboardAway = selectedDashboard === 'physical' ? physicalColors.away : teamInfo.away_jersey;
    
    return {
      jerseyColor: isHome ? dashboardHome : dashboardAway,
      numberColor: isHome ? teamInfo.home_number : teamInfo.away_number,
    };
  };

  const isWhatIfMode = isWhatIfSimulationOpen && selectedDashboard === 'pitch-control';

  useEffect(() => {
    if (!isWhatIfMode) {
      setDraggedPlayerId(null);
      setWhatIfPlayerPositions({});
      setWhatIfInitialPositions({});
      return;
    }

    if (Object.keys(whatIfInitialPositions).length === 0) {
      const initialSnapshot = {};
      (currentFrame.player_data || []).forEach((player) => {
        if (player?.player_id === undefined || player.x === undefined || player.y === undefined) return;
        initialSnapshot[player.player_id] = { x: player.x, y: player.y };
      });
      setWhatIfInitialPositions(initialSnapshot);
      setWhatIfPlayerPositions({});
      setDraggedPlayerId(null);
    }

    // What-if is detached from timeline and video playback.
    setIsPlaying(false);
    setWasTimeChangedManually(false);
  }, [isWhatIfMode, currentFrame, whatIfInitialPositions]);

  useEffect(() => {
    // Reset custom positions when frame changes.
    setDraggedPlayerId(null);
    setWhatIfPlayerPositions({});
  }, [frameIndex]);

  const previousFrame = frameIndex > 0 ? trackingData[frameIndex - 1] : null;

  const velocityByPlayerId = useMemo(() => {
    const velocityMap = {};
    const previousById = {};

    if (previousFrame?.player_data?.length) {
      previousFrame.player_data.forEach((p) => {
        if (p?.player_id !== undefined && p.x !== undefined && p.y !== undefined) {
          previousById[p.player_id] = p;
        }
      });
    }

    const currentFrameNumber = Number(currentFrame.frameNumber ?? currentFrame.frame ?? frameIndex);
    const previousFrameNumber = Number(previousFrame?.frameNumber ?? previousFrame?.frame ?? Math.max(0, frameIndex - 1));
    const frameDelta = Math.max(1, currentFrameNumber - previousFrameNumber);
    const dt = frameDelta / FPS;

    (currentFrame.player_data || []).forEach((p) => {
      if (!p || p.player_id === undefined || p.x === undefined || p.y === undefined) return;

      const prev = previousById[p.player_id];
      if (!prev || prev.x === undefined || prev.y === undefined) {
        velocityMap[p.player_id] = { vx: 0, vy: 0 };
        return;
      }

      const nowMeters = normalizedToPitchMeters(p.x, p.y, pitchLength, pitchWidth);
      const prevMeters = normalizedToPitchMeters(prev.x, prev.y, pitchLength, pitchWidth);
      velocityMap[p.player_id] = {
        vx: (nowMeters.x - prevMeters.x) / dt,
        vy: (nowMeters.y - prevMeters.y) / dt,
      };
    });

    return velocityMap;
  }, [currentFrame, previousFrame, frameIndex, pitchLength, pitchWidth]);

  const whatIfPlayers = useMemo(() => {
    return (currentFrame.player_data || [])
      .map((p) => {
        if (!p || p.player_id === undefined || p.x === undefined || p.y === undefined) return null;

        const basePosition = whatIfInitialPositions[p.player_id];
        const baseNormX = basePosition?.x ?? p.x;
        const baseNormY = basePosition?.y ?? p.y;
        const overridden = whatIfPlayerPositions[p.player_id];
        const normX = overridden?.x ?? baseNormX;
        const normY = overridden?.y ?? baseNormY;
        const meters = normalizedToPitchMeters(normX, normY, pitchLength, pitchWidth);
        const velocity = velocityByPlayerId[p.player_id] || { vx: 0, vy: 0 };
        const teamId = getPlayerTeamId(p);
        const params = playerParamsById[p.player_id] || { accel: 2.5, vmax: 7.0 };

        return {
          ...p,
          team_id: teamId,
          normX,
          normY,
          x: meters.x,
          y: meters.y,
          vx: velocity.vx,
          vy: velocity.vy,
          accel: params.accel,
          vmax: params.vmax,
        };
      })
      .filter((p) => p !== null);
  }, [currentFrame, whatIfInitialPositions, whatIfPlayerPositions, pitchLength, pitchWidth, velocityByPlayerId, playerParamsById, getPlayerTeamId]);

  const whatIfBallMeters = useMemo(() => {
    const ballNormX = Number.isFinite(currentFrame.ball_data?.x) ? currentFrame.ball_data.x : 0.5;
    const ballNormY = Number.isFinite(currentFrame.ball_data?.y) ? currentFrame.ball_data.y : 0.5;
    return normalizedToPitchMeters(ballNormX, ballNormY, pitchLength, pitchWidth);
  }, [currentFrame, pitchLength, pitchWidth]);

  const whatIfPitchControl = useMemo(() => {
    if (!isWhatIfMode) return null;

    return computePitchControlMatrix({
      players: whatIfPlayers,
      ball: whatIfBallMeters,
      pitchLength,
      pitchWidth,
      homeTeamId: teamInfo.home_id,
      awayTeamId: teamInfo.away_id,
      cellSize: 1.0,
      sBall: 18.0,
      eps: 0.3,
    });
  }, [isWhatIfMode, whatIfPlayers, whatIfBallMeters, pitchLength, pitchWidth, teamInfo.home_id, teamInfo.away_id]);

  // Draw function
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_WIDTH, canvasHeight);

    // Draw pitch
    const pitchBackgroundColor = selectedDashboard === 'physical' ? physicalColors.field : 'white';
    drawPitch(ctx, CANVAS_WIDTH, canvasHeight, pitchBackgroundColor);

    // In Pitch Control dashboard, render controlled zones as background overlay.
    if (selectedDashboard === 'pitch-control') {
      if (isWhatIfMode && whatIfPitchControl) {
        drawPitchControlMatrix(ctx, whatIfPitchControl, CANVAS_WIDTH, canvasHeight, pitchControlColors);
      } else {
        drawPitchControlOverlay(ctx, currentPitchControlFrame, CANVAS_WIDTH, canvasHeight, pitchControlColors);
      }
    }

    // Draw players
    const players = isWhatIfMode
      ? whatIfPlayers.map((p) => ({ ...p, x: p.normX, y: p.normY }))
      : currentFrame.player_data || [];
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
  }, [
    currentFrame,
    playerMeta,
    teamInfo,
    canvasHeight,
    selectedDashboard,
    currentPitchControlFrame,
    pitchControlColors,
    physicalColors,
    isWhatIfMode,
    whatIfPlayers,
    whatIfPitchControl,
  ]);

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

  const stepFrame = useCallback((direction) => {
    const maxFrameIndex = Math.max(0, totalFrames - 1);

    setIsPlaying(false);
    setWasTimeChangedManually(true);
    setTimeSeconds((prev) => {
      const currentIndex = Math.min(Math.floor(prev * FPS), maxFrameIndex);
      const nextIndex = Math.max(0, Math.min(maxFrameIndex, currentIndex + direction));
      return nextIndex / FPS;
    });
  }, [totalFrames]);

  useEffect(() => {
    const isEditableTarget = (target) => {
      if (!target) return false;

      const tagName = target.tagName?.toLowerCase();
      return (
        target.isContentEditable ||
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select'
      );
    };

    const handleKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;
      if (isWhatIfMode) return;

      if (event.code === 'Space') {
        event.preventDefault();
        setIsPlaying((prev) => !prev);
        setWasTimeChangedManually(false);
      } else if (event.code === 'ArrowLeft') {
        event.preventDefault();
        stepFrame(-1);
      } else if (event.code === 'ArrowRight') {
        event.preventDefault();
        stepFrame(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stepFrame, isWhatIfMode]);

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

  const getCanvasCoordinates = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const pixelX = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const pixelY = ((event.clientY - rect.top) / rect.height) * canvasHeight;
    const normX = clamp(pixelX / CANVAS_WIDTH, 0, 1);
    const normY = clamp(1 - pixelY / canvasHeight, 0, 1);

    return { pixelX, pixelY, normX, normY };
  }, [canvasHeight]);

  const handleWhatIfMouseDown = useCallback((event) => {
    if (!isWhatIfMode) return;

    const coords = getCanvasCoordinates(event);
    if (!coords) return;

    let selectedPlayerId = null;
    let bestDist = Number.POSITIVE_INFINITY;
    const maxPickRadius = 16;

    whatIfPlayers.forEach((player) => {
      const [px, py] = normalizedToPixels(player.normX, player.normY, CANVAS_WIDTH, canvasHeight);
      const dx = px - coords.pixelX;
      const dy = py - coords.pixelY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= maxPickRadius && dist < bestDist) {
        bestDist = dist;
        selectedPlayerId = player.player_id;
      }
    });

    if (selectedPlayerId !== null) {
      setDraggedPlayerId(selectedPlayerId);
    }
  }, [isWhatIfMode, getCanvasCoordinates, whatIfPlayers, canvasHeight]);

  const handleWhatIfMouseMove = useCallback((event) => {
    if (!isWhatIfMode || draggedPlayerId === null) return;

    const coords = getCanvasCoordinates(event);
    if (!coords) return;

    setWhatIfPlayerPositions((prev) => ({
      ...prev,
      [draggedPlayerId]: {
        x: coords.normX,
        y: coords.normY,
      },
    }));
  }, [isWhatIfMode, draggedPlayerId, getCanvasCoordinates]);

  const stopDragging = useCallback(() => {
    if (draggedPlayerId !== null) {
      setDraggedPlayerId(null);
    }
  }, [draggedPlayerId]);

  const handleResetWhatIfPositions = useCallback(() => {
    setDraggedPlayerId(null);
    setWhatIfPlayerPositions({});
  }, []);

  const hasWhatIfOverrides = Object.keys(whatIfPlayerPositions).length > 0;

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
        {isWhatIfSimulationOpen && selectedDashboard === 'pitch-control' ? (
          <div style={styles.whatIfMainView}>
            <div style={styles.whatIfMainQuadrant}>
              <div style={styles.whatIfMainHeader}>What-if Simulation</div>
              <div style={styles.whatIfRadarContainer}>
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={canvasHeight}
                  style={{ ...styles.canvas, ...styles.whatIfCanvas }}
                  onMouseDown={handleWhatIfMouseDown}
                  onMouseMove={handleWhatIfMouseMove}
                  onMouseUp={stopDragging}
                  onMouseLeave={stopDragging}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Top Row */}
            <div style={styles.quadrantRow}>
              {/* Top Left - Video Player */}
              <div style={styles.quadrant}>
                <VideoPlayer
                  syncedTime={syncedVideoTime}
                  initialSyncedTime={calculateSyncedVideoTime()}
                  shouldPlay={isPlaying}
                />
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
          </>
        )}
      </div>

      {/* Controls - Right Panel */}
      <div style={styles.controlsSection}>
        <div style={styles.logoHeader}>
          <img
            src="/images/goalflow-logo.jpg"
            alt="GoalFlow"
            style={styles.logoImage}
          />
        </div>

        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px', marginBottom: '16px', borderLeft: '4px solid #7E6AE0'}}>
          <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
            <span style={{fontSize: '12px', color: '#999', fontWeight: '600', textTransform: 'uppercase'}}>Period</span>
            <span style={{fontSize: '24px', fontWeight: 'bold', color: '#7E6AE0'}}>{currentFrame.period || '-'}</span>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
            <span style={{fontSize: '12px', color: '#999', fontWeight: '600', textTransform: 'uppercase'}}>Time</span>
            <span style={{fontSize: '24px', fontWeight: 'bold', color: '#7E6AE0', fontFamily: 'monospace'}}>{getMatchTime()}</span>
          </div>
        </div>

        {!isWhatIfMode && (
          <>
            <div style={styles.playbackControlsCard}>
              <div style={styles.playbackMainRow}>
                <button
                  onClick={handlePlayToggle}
                  style={{
                    ...styles.button,
                    ...styles.playbackPlayButton,
                    backgroundColor: isPlaying ? '#ff6b6b' : '#51cf66',
                  }}
                >
                  {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>

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
          </>
        )}

        <div style={styles.dashboardModeContainer}>
          <span style={styles.dashboardModeTitle}>Dashboard View</span>
          <div style={styles.dashboardModeButtons}>
            <button
              onClick={() => setSelectedDashboard('physical')}
              style={{
                ...styles.dashboardModeButton,
                ...(selectedDashboard === 'physical' ? styles.dashboardModeButtonActive : {}),
              }}
            >
              Physical
            </button>
            <button
              onClick={() => setSelectedDashboard('pitch-control')}
              style={{
                ...styles.dashboardModeButton,
                ...(selectedDashboard === 'pitch-control' ? styles.dashboardModeButtonActive : {}),
              }}
            >
              Pitch Control
            </button>
          </div>

          {selectedDashboard === 'physical' && (
            <div style={styles.pitchLegendPanel}>
              <span style={styles.pitchLegendTitle}>Legenda Colori Physical</span>

              <div style={styles.pitchLegendRow}>
                <div
                  style={{
                    ...styles.pitchLegendSwatch,
                    backgroundColor: physicalColors.home,
                    borderColor: physicalColors.home,
                  }}
                />
                <span style={styles.pitchLegendLabel}>{matchData?.home_team?.name || 'Home'}</span>
                <input
                  type="color"
                  value={physicalColors.home}
                  onChange={(e) => {
                    setHasCustomPhysicalColors(true);
                    setPhysicalColors((prev) => ({ ...prev, home: e.target.value }));
                  }}
                  style={styles.pitchLegendColorInput}
                />
              </div>

              <div style={styles.pitchLegendRow}>
                <div
                  style={{
                    ...styles.pitchLegendSwatch,
                    backgroundColor: physicalColors.away,
                    borderColor: physicalColors.away,
                  }}
                />
                <span style={styles.pitchLegendLabel}>{matchData?.away_team?.name || 'Away'}</span>
                <input
                  type="color"
                  value={physicalColors.away}
                  onChange={(e) => {
                    setHasCustomPhysicalColors(true);
                    setPhysicalColors((prev) => ({ ...prev, away: e.target.value }));
                  }}
                  style={styles.pitchLegendColorInput}
                />
              </div>

              <div style={styles.pitchLegendRow}>
                <div
                  style={{
                    ...styles.pitchLegendSwatch,
                    backgroundColor: physicalColors.field,
                    borderColor: physicalColors.field,
                  }}
                />
                <span style={styles.pitchLegendLabel}>Colore Campo</span>
                <input
                  type="color"
                  value={physicalColors.field}
                  onChange={(e) => {
                    setHasCustomPhysicalColors(true);
                    setPhysicalColors((prev) => ({ ...prev, field: e.target.value }));
                  }}
                  style={styles.pitchLegendColorInput}
                />
              </div>
            </div>
          )}

          {selectedDashboard === 'pitch-control' && (
            <div style={styles.pitchLegendPanel}>
              <span style={styles.pitchLegendTitle}>Legenda Aree</span>

              <div style={styles.pitchLegendRow}>
                <div
                  style={{
                    ...styles.pitchLegendSwatch,
                    backgroundColor: toRgba(pitchControlColors.home, 0.22),
                    borderColor: pitchControlColors.home,
                  }}
                />
                <span style={styles.pitchLegendLabel}>{matchData?.home_team?.name || 'Home'}</span>
                <input
                  type="color"
                  value={pitchControlColors.home}
                  onChange={(e) => {
                    setHasCustomPitchColors(true);
                    setPitchControlColors((prev) => ({ ...prev, home: e.target.value }));
                  }}
                  style={styles.pitchLegendColorInput}
                />
              </div>

              <div style={styles.pitchLegendRow}>
                <div
                  style={{
                    ...styles.pitchLegendSwatch,
                    backgroundColor: toRgba(pitchControlColors.away, 0.22),
                    borderColor: pitchControlColors.away,
                  }}
                />
                <span style={styles.pitchLegendLabel}>{matchData?.away_team?.name || 'Away'}</span>
                <input
                  type="color"
                  value={pitchControlColors.away}
                  onChange={(e) => {
                    setHasCustomPitchColors(true);
                    setPitchControlColors((prev) => ({ ...prev, away: e.target.value }));
                  }}
                  style={styles.pitchLegendColorInput}
                />
              </div>

              <div style={styles.pitchLegendRow}>
                <div
                  style={{
                    ...styles.pitchLegendSwatch,
                    backgroundColor: toRgba(pitchControlColors.neutral, 0.22),
                    borderColor: pitchControlColors.neutral,
                  }}
                />
                <span style={styles.pitchLegendLabel}>Zona Neutra</span>
                <input
                  type="color"
                  value={pitchControlColors.neutral}
                  onChange={(e) => {
                    setHasCustomPitchColors(true);
                    setPitchControlColors((prev) => ({ ...prev, neutral: e.target.value }));
                  }}
                  style={styles.pitchLegendColorInput}
                />
              </div>
            </div>
          )}
        </div>

        {selectedDashboard === 'pitch-control' && (
          <div style={styles.whatIfButtonSection}>
            {isWhatIfMode && (
              <button
                onClick={handleResetWhatIfPositions}
                disabled={!hasWhatIfOverrides}
                style={{
                  ...styles.button,
                  ...styles.whatIfResetButton,
                  ...(hasWhatIfOverrides ? {} : styles.whatIfResetButtonDisabled),
                }}
              >
                Reset What-If Positions
              </button>
            )}

            <button
              onClick={() => setIsWhatIfSimulationOpen((prev) => !prev)}
              style={{
                ...styles.button,
                ...styles.whatIfButton,
                backgroundColor: isWhatIfSimulationOpen ? '#e03131' : '#2f9e44',
              }}
            >
              {isWhatIfSimulationOpen ? 'Close What-If Simulation' : 'Open What-If Simulation'}
            </button>
          </div>
        )}
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
    backgroundColor: '#C7CEF8',
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
  whatIfMainView: {
    flex: 1,
    display: 'flex',
    minHeight: '0',
  },
  whatIfMainQuadrant: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    width: '100%',
    minHeight: '0',
  },
  whatIfMainHeader: {
    width: '100%',
    textAlign: 'left',
    fontSize: '14px',
    fontWeight: '700',
    color: '#3b4562',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
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
  whatIfRadarContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    padding: '0',
  },
  whatIfCanvas: {
    width: '66.67%',
    maxWidth: '66.67%',
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
    width: '100%',
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
    position: 'relative',
    paddingBottom: '250px',
  },
  whatIfButtonSection: {
    position: 'absolute',
    left: '24px',
    right: '24px',
    bottom: '24px',
  },
  whatIfButton: {
    width: '100%',
    padding: '12px 14px',
    fontSize: '13px',
  },
  whatIfResetButton: {
    width: '100%',
    padding: '10px 14px',
    fontSize: '12px',
    marginBottom: '8px',
    backgroundColor: '#1971c2',
  },
  whatIfResetButtonDisabled: {
    backgroundColor: '#adb5bd',
    cursor: 'not-allowed',
    opacity: 0.85,
  },
  title: {
    margin: '0 0 12px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
  },
  logoHeader: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    margin: '0 0 8px 0',
  },
  logoImage: {
    width: '100%',
    maxWidth: '210px',
    height: 'auto',
    objectFit: 'contain',
    display: 'block',
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
    color: '#7E6AE0',
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
  playbackControlsCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #d8dced',
    backgroundColor: '#f7f8fd',
  },
  playbackMainRow: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '10px',
    alignItems: 'start',
  },
  playbackPlayButton: {
    minWidth: '90px',
    padding: '8px 12px',
    alignSelf: 'start',
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
    accentColor: '#7E6AE0',
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
    backgroundColor: '#7E6AE0',
  },
  markerLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
  },
  jumpToTimeContainer: {
    padding: '16px',
    backgroundColor: '#D3D7E3',
    border: '2px solid #7E6AE0',
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
    backgroundColor: '#7E6AE0',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
  dashboardModeContainer: {
    position: 'absolute',
    left: '24px',
    right: '24px',
    top: '430px',
    minHeight: '210px',
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: '#f9f9f9',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  dashboardModeTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  dashboardModeButtons: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  dashboardModeButton: {
    padding: '8px 10px',
    borderRadius: '6px',
    border: '1px solid #cfd3dc',
    backgroundColor: 'white',
    color: '#444',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  dashboardModeButtonActive: {
    backgroundColor: '#7E6AE0',
    border: '1px solid #7E6AE0',
    color: 'white',
  },
  pitchLegendPanel: {
    marginTop: '4px',
    padding: '10px',
    borderRadius: '8px',
    backgroundColor: '#eef1fa',
    border: '1px solid #d3d9ed',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  pitchLegendTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#4f5b7a',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  pitchLegendRow: {
    display: 'grid',
    gridTemplateColumns: '16px 1fr auto',
    alignItems: 'center',
    gap: '8px',
  },
  pitchLegendSwatch: {
    width: '14px',
    height: '14px',
    borderRadius: '4px',
    border: '1px solid #cfd3dc',
  },
  pitchLegendLabel: {
    fontSize: '12px',
    color: '#333',
    fontWeight: '600',
  },
  pitchLegendColorInput: {
    width: '28px',
    height: '22px',
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
  },
};

export default TrackingRadar;