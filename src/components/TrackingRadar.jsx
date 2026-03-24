import React, { useRef, useEffect, useState, useCallback } from 'react';

// ========= MOCK DATA =========
const mockTrackingData = Array.from({ length: 250 }, (_, frameIndex) => {
  // Simulate players moving around
  const time = frameIndex / 10; // 10 fps
  return {
    timestamp: time.toFixed(2),
    players: [
      // HOME TEAM (blue) - left to right movement
      ...Array.from({ length: 11 }, (_, i) => ({
        id: 1000 + i,
        number: i + 1,
        team: 'home',
        x: (0.2 + i * 0.03 + Math.sin(time * 0.5 + i) * 0.05) / 1.05,
        y: (0.3 + Math.sin(time + i * 0.3) * 0.2) / 1,
      })),
      // AWAY TEAM (red) - right to left movement
      ...Array.from({ length: 11 }, (_, i) => ({
        id: 2000 + i,
        number: i + 1,
        team: 'away',
        x: (0.7 - i * 0.03 + Math.cos(time * 0.5 + i) * 0.05) / 1.05,
        y: (0.5 + Math.cos(time + i * 0.3) * 0.2) / 1,
      })),
    ],
    ball: {
      x: (0.45 + Math.sin(time * 0.3) * 0.1) / 1.05,
      y: (0.4 + Math.cos(time * 0.25) * 0.15) / 1,
    },
  };
});

const FPS = 10;
const PITCH_WIDTH = 1.0; // normalized
const PITCH_HEIGHT = 1.0; // normalized
const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 700;

// ========= PITCH RENDERER =========
const drawPitch = (ctx, width, height) => {
  ctx.fillStyle = '#2d5016'; // grass green
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'white';
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
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Penalty boxes
  const boxWidth = width * 0.22;
  const boxHeight = height * 0.6;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;

  // Left penalty box
  ctx.strokeRect(0, (height - boxHeight) / 2, boxWidth, boxHeight);

  // Right penalty box
  ctx.strokeRect(width - boxWidth, (height - boxHeight) / 2, boxWidth, boxHeight);

  // Goal areas
  const goalWidth = width * 0.08;
  const goalHeight = height * 0.3;
  ctx.strokeRect(0, (height - goalHeight) / 2, goalWidth, goalHeight);
  ctx.strokeRect(width - goalWidth, (height - goalHeight) / 2, goalWidth, goalHeight);
};

// ========= COORDINATE CONVERTER =========
const normalizedToPixels = (normX, normY, width, height) => {
  return [normX * width, (1 - normY) * height];
};

// ========= TRACKING RADAR COMPONENT =========
const TrackingRadar = () => {
  const canvasRef = useRef(null);
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const animationRef = useRef(null);

  const totalFrames = mockTrackingData.length;
  const maxTime = (totalFrames - 1) / FPS;

  // Calculate current frame using direct indexing
  const frameIndex = Math.min(
    Math.floor(timeSeconds * FPS),
    totalFrames - 1
  );
  const currentFrame = mockTrackingData[frameIndex];

  // Draw function
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw pitch
    drawPitch(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw players
    currentFrame.players.forEach((player) => {
      const [px, py] = normalizedToPixels(player.x, player.y, CANVAS_WIDTH, CANVAS_HEIGHT);
      const isHome = player.team === 'home';
      const circleColor = isHome ? '#1e90ff' : '#ff4444'; // blue or red

      // Player circle
      ctx.fillStyle = circleColor;
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();

      // Player border
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Player number
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(player.number.toString(), px, py);
    });

    // Draw ball
    const [ballX, ballY] = normalizedToPixels(
      currentFrame.ball.x,
      currentFrame.ball.y,
      CANVAS_WIDTH,
      CANVAS_HEIGHT
    );
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(ballX, ballY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [currentFrame]);

  // Redraw on frame change
  useEffect(() => {
    drawFrame();
  }, [frameIndex, drawFrame]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) return;

    const animate = () => {
      setTimeSeconds((prev) => {
        const next = prev + 1 / FPS;
        return next > maxTime ? 0 : next;
      });
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, maxTime]);

  const handleSliderChange = (e) => {
    setTimeSeconds(parseFloat(e.target.value));
    setIsPlaying(false);
  };

  const handlePlayToggle = () => {
    setIsPlaying(!isPlaying);
  };

  return (
    <div style={styles.container}>
      {/* Canvas on left */}
      <div style={styles.canvasSection}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={styles.canvas}
        />
      </div>

      {/* Controls on right */}
      <div style={styles.controlsSection}>
        <h2 style={styles.title}>Football Tracking Radar</h2>

        {/* Time display */}
        <div style={styles.timeDisplay}>
          <span style={styles.timeLabel}>Time:</span>
          <span style={styles.timeValue}>{currentFrame.timestamp}s</span>
        </div>

        {/* Frame counter */}
        <div style={styles.frameDisplay}>
          Frame {frameIndex + 1} / {totalFrames}
        </div>

        {/* Time slider */}
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

        {/* Time input */}
        <div style={styles.inputContainer}>
          <label style={styles.label}>Jump to (seconds):</label>
          <input
            type="number"
            min="0"
            max={maxTime}
            step={1 / FPS}
            value={timeSeconds.toFixed(2)}
            onChange={(e) => {
              const val = Math.min(Math.max(parseFloat(e.target.value) || 0, 0), maxTime);
              setTimeSeconds(val);
              setIsPlaying(false);
            }}
            style={styles.input}
          />
        </div>

        {/* Play button */}
        <button
          onClick={handlePlayToggle}
          style={{
            ...styles.button,
            backgroundColor: isPlaying ? '#ff6b6b' : '#51cf66',
          }}
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>

        {/* Legend */}
        <div style={styles.legend}>
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendDot, backgroundColor: '#1e90ff' }} />
            <span>Home Team</span>
          </div>
          <div style={styles.legendItem}>
            <div style={{ ...styles.legendDot, backgroundColor: '#ff4444' }} />
            <span>Away Team</span>
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
  },
  frameDisplay: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#999',
    padding: '8px',
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
};

export default TrackingRadar;
