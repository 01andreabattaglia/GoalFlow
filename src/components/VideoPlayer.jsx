import React, { useRef, useEffect } from 'react';

const VideoPlayer = ({ 
  videoPath = '/data/Isuzu UTE A-League 2024-25 - Round 6 - Auckland FC v Newcastle Jets.mp4',
  syncedTime = null,
  shouldPlay = false,
}) => {
  const videoRef = useRef(null);
  const lastSyncTimeRef = useRef(null);
  const hasInitializedRef = useRef(false);

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

  // Only sync video time when there's a significant jump (> 0.5 seconds)
  // This avoids constant updates that cause lag during normal playback
  useEffect(() => {
    if (syncedTime !== null && videoRef.current && isFinite(syncedTime)) {
      // Check if this is a significant jump or initial sync
      const timeDiff = lastSyncTimeRef.current !== null 
        ? Math.abs(syncedTime - lastSyncTimeRef.current)
        : Infinity;

      // Sync on: initial sync, or jump > 0.5 seconds
      if (!hasInitializedRef.current || timeDiff > 0.5) {
        videoRef.current.currentTime = syncedTime;
        lastSyncTimeRef.current = syncedTime;
        hasInitializedRef.current = true;
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
