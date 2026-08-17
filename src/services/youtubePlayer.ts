// YouTube IFrame Player wrapper service
// Provides direct, client-side, zero-latency playback of YouTube audio
// Bypasses all server-side datacenter blocks and CORS issues

let ytPlayer: any = null;
let isReady = false;
const readyCallbacks: (() => void)[] = [];

let stateChangeCallback: ((state: number) => void) | null = null;
let endedCallback: (() => void) | null = null;
let timeUpdateInterval: any = null;
let timeUpdateCallback: ((time: number) => void) | null = null;

// Silent audio loop to keep browser tab active on mobile background
const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
silentAudio.loop = true;
silentAudio.preload = 'auto';

// Initialize YouTube IFrame API
if (typeof window !== 'undefined') {
  // Check if API is already loaded
  if (!(window as any).onYouTubeIframeAPIReady) {
    (window as any).onYouTubeIframeAPIReady = () => {
      ytPlayer = new (window as any).YT.Player('yt-player-container', {
        height: '1',
        width: '1',
        videoId: '',
        playerVars: {
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3
        },
        events: {
          onReady: () => {
            isReady = true;
            console.log('[yt-player] IFrame Player is ready');
            readyCallbacks.forEach(cb => cb());
            readyCallbacks.length = 0;
          },
          onStateChange: (event: any) => {
            // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (cued)
            const state = event.data;
            if (stateChangeCallback) stateChangeCallback(state);
            
            if (state === 1) { // Playing
              startTrackingTime();
              playSilence();
            } else {
              stopTrackingTime();
              pauseSilence();
              if (state === 0 && endedCallback) { // Ended
                endedCallback();
              }
            }
          }
        }
      });
    };

    // Load the IFrame API script if not already present
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }
}

function playSilence() {
  silentAudio.play().catch(e => console.warn('[yt-player] Silent loop failed to play:', e.message));
}

function pauseSilence() {
  silentAudio.pause();
}

function startTrackingTime() {
  if (timeUpdateInterval) clearInterval(timeUpdateInterval);
  timeUpdateInterval = setInterval(() => {
    if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function' && timeUpdateCallback) {
      timeUpdateCallback(ytPlayer.getCurrentTime());
    }
  }, 250);
}

function stopTrackingTime() {
  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval);
    timeUpdateInterval = null;
  }
}

export const youtubePlayer = {
  isReady: () => isReady,
  
  ensureReady: (callback: () => void) => {
    if (isReady) callback();
    else readyCallbacks.push(callback);
  },

  loadAndPlay: (videoId: string, startSeconds = 0) => {
    youtubePlayer.ensureReady(() => {
      if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        console.log('[yt-player] Loading video:', videoId);
        ytPlayer.loadVideoById({
          videoId: videoId,
          startSeconds: startSeconds
        });
        playSilence();
      }
    });
  },

  play: () => {
    if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
      ytPlayer.playVideo();
      playSilence();
    }
  },

  pause: () => {
    if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
      ytPlayer.pauseVideo();
      pauseSilence();
    }
  },

  seekTo: (seconds: number) => {
    if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
      ytPlayer.seekTo(seconds, true);
    }
  },

  setVolume: (volume: number) => { // 0.0 to 1.0
    youtubePlayer.ensureReady(() => {
      if (ytPlayer && typeof ytPlayer.setVolume === 'function') {
        ytPlayer.setVolume(Math.round(volume * 100));
      }
    });
  },

  getCurrentTime: (): number => {
    if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
      return ytPlayer.getCurrentTime();
    }
    return 0;
  },

  getDuration: (): number => {
    if (ytPlayer && typeof ytPlayer.getDuration === 'function') {
      return ytPlayer.getDuration();
    }
    return 0;
  },

  onStateChange: (callback: (state: number) => void) => {
    stateChangeCallback = callback;
  },

  onTimeUpdate: (callback: (time: number) => void) => {
    timeUpdateCallback = callback;
  },

  onEnded: (callback: () => void) => {
    endedCallback = callback;
  }
};
