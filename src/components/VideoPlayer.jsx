import React, { useRef, useEffect } from 'react';

const VideoPlayer = ({ 
  videoPath = '/data/Isuzu UTE A-League 2024-25 - Round 6 - Auckland FC v Newcastle Jets.mp4',
  syncedTime = null,
  shouldPlay = false,
}) => {
  const videoRef = useRef(null);

  // Sync play/pause command from radar - start/stop playback
  useEffect(() => {
    if (!videoRef.current) return;
    
    if (shouldPlay) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(err => console.log('Play error:', err));
      }
    } else {
      if (!videoRef.current.paused) {
        videoRef.current.pause();
      }
    }
  }, [shouldPlay]);

  // Sync only when target differs from actual current time to avoid unnecessary seeks.
  // This also fixes repeated jumps to the same target time after the video has advanced.
  useEffect(() => {
    if (syncedTime !== null && videoRef.current && isFinite(syncedTime)) {
      const currentVideoTime = videoRef.current.currentTime || 0;
      const timeDiff = Math.abs(currentVideoTime - syncedTime);

      if (timeDiff > 0.15) {
        videoRef.current.currentTime = syncedTime;
      }
    }
  }, [syncedTime]);

  const styles = {
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
  };

  return (
    <div style={styles.container}>
      <div style={styles.videoWrapper}>
        <video
          ref={videoRef}
          style={styles.video}
          src={videoPath}
        />
      </div>
    </div>
  );
};

export default VideoPlayer;
