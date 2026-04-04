import React, { useRef, useState, useCallback, useMemo } from 'react';

const VideoPlayer = ({ 
  videoPath = '/data/Isuzu UTE A-League 2024-25 - Round 6 - Auckland FC v Newcastle Jets.mp4',
  syncedTime = null,
  shouldPlay = false,
  onPlayChange = null
}) => {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const lastSyncTimeRef = useRef(null);

  // Sync play/pause command from radar
  React.useEffect(() => {
    if (videoRef.current) {
      if (shouldPlay && !videoRef.current.paused) {
        return; // Already playing
      }
      if (shouldPlay && videoRef.current.paused) {
        videoRef.current.play().catch(err => console.log('Play error:', err));
        setIsPlaying(true);
      } else if (!shouldPlay && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  }, [shouldPlay]);

  // Debounce syncedTime to avoid frequent video.currentTime updates that cause lag
  React.useEffect(() => {
    if (syncedTime !== null && videoRef.current && isFinite(syncedTime)) {
      // Only update if time diff is > 0.5 seconds to avoid jitter
      if (lastSyncTimeRef.current === null || Math.abs(syncedTime - lastSyncTimeRef.current) > 0.5) {
        videoRef.current.currentTime = syncedTime;
        lastSyncTimeRef.current = syncedTime;
      }
    }
  }, [syncedTime]);

  const handlePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleSliderChange = useCallback((e) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  }, []);

  const formatTime = useCallback((seconds) => {
    if (!isFinite(seconds)) return '00:00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, []);

  const styles = useMemo(() => ({
    container: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: '#000',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    },
    videoWrapper: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000',
      minHeight: '200px',
    },
    video: {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
    },
    controls: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '12px',
      backgroundColor: '#1a1a1a',
      borderTop: '1px solid #333',
    },
    sliderContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    slider: {
      flex: 1,
      height: '6px',
      borderRadius: '3px',
      outline: 'none',
      WebkitAppearance: 'none',
      appearance: 'none',
      background: '#444',
      cursor: 'pointer',
    },
    timeDisplay: {
      color: '#fff',
      fontSize: '12px',
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
      minWidth: '110px',
    },
    buttonContainer: {
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
    },
    button: {
      padding: '8px 16px',
      backgroundColor: '#0078d4',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
      transition: 'background 0.2s',
    },
    buttonHover: {
      backgroundColor: '#106ebe',
    },
  }), []);

  return (
    <div style={styles.container}>
      <div style={styles.videoWrapper}>
        <video
          ref={videoRef}
          style={styles.video}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          src={videoPath}
        />
      </div>
      
      <div style={styles.controls}>
        <div style={styles.sliderContainer}>
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSliderChange}
            style={styles.slider}
          />
          <div style={styles.timeDisplay}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
        
        <div style={styles.buttonContainer}>
          <button
            style={styles.button}
            onMouseEnter={(e) => e.target.style.backgroundColor = styles.buttonHover.backgroundColor}
            onMouseLeave={(e) => e.target.style.backgroundColor = styles.button.backgroundColor}
            onClick={handlePlayPause}
          >
            {isPlaying ? '⏸ Pausa' : '▶ Play'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
