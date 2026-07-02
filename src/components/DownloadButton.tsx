// src/components/DownloadButton.tsx
import { useState, useEffect } from 'react';
import { Download, CheckCircle, Loader, AlertCircle } from 'lucide-react';
import { downloadService } from '../services/downloadService';
import type { Song } from '../services/pipedService';

interface Props {
  song: Song;
  size?: number;
}

type State = 'idle' | 'checking' | 'downloading' | 'done' | 'deleting' | 'error';

export function DownloadButton({ song, size = 16 }: Props) {
  const [state, setState]       = useState<State>('checking');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;
    downloadService.isDownloaded(song.id).then(downloaded => {
      if (mounted) setState(downloaded ? 'done' : 'idle');
    });
    return () => { mounted = false; };
  }, [song.id]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (state === 'done') {
      setState('deleting');
      await downloadService.deleteDownload(song.id);
      setState('idle');
      return;
    }

    if (state === 'downloading' || state === 'checking') return;

    if (state === 'error') {
      // Retry on click
      setState('idle');
      return;
    }

    setState('downloading');
    setProgress(5);
    setErrorMsg('');

    const success = await downloadService.downloadSong(
      song,
      (pct) => setProgress(pct),
      (msg) => setErrorMsg(msg),
    );

    if (success) {
      setState('done');
    } else {
      setState('error');
    }
    setProgress(0);
  };

  const label =
    state === 'done'        ? 'Downloaded — click to delete' :
    state === 'downloading' ? `Downloading ${progress}%` :
    state === 'error'       ? (errorMsg || 'Download failed — click to retry') :
    'Download for offline';

  return (
    <button
      className={`download-btn state-${state}`}
      onClick={handleClick}
      title={label}
    >
      {state === 'checking'    && <Loader size={size} className="spin" />}
      {state === 'idle'        && <Download size={size} />}
      {state === 'deleting'    && <Loader size={size} className="spin" />}
      {state === 'done'        && <CheckCircle size={size} className="downloaded-icon" />}
      {state === 'error'       && <AlertCircle size={size} style={{ color: '#ef4444' }} />}
      {state === 'downloading' && (
        <div className="dl-progress-ring" style={{ '--pct': `${progress}%` } as React.CSSProperties}>
          <svg viewBox="0 0 32 32" width={size + 4} height={size + 4}>
            <circle className="ring-bg" cx="16" cy="16" r="13" />
            <circle
              className="ring-fg"
              cx="16" cy="16" r="13"
              strokeDasharray={`${(progress / 100) * 81.7} 81.7`}
              strokeLinecap="round"
              transform="rotate(-90 16 16)"
            />
          </svg>
        </div>
      )}
    </button>
  );
}
