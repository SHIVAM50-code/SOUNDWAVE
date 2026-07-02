// src/components/LyricsPanel.tsx
import { useState, useEffect, useRef } from 'react';
import { X, Music2, Loader } from 'lucide-react';
import { lyricsService } from '../services/lyricsService';
import type { Song } from '../services/pipedService';

interface Props {
  song: Song | null;
  currentTime: number;
  isOpen: boolean;
  onClose: () => void;
  inline?: boolean; // true = render inside player, no backdrop/sheet
}

export function LyricsPanel({ song, currentTime, isOpen, onClose, inline = false }: Props) {
  const [lyrics, setLyrics] = useState<{ time: number; text: string }[] | null>(null);
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeLine, setActiveLine] = useState(0);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Fetch lyrics when song changes or panel opens
  useEffect(() => {
    if (!song || !isOpen) return;
    setLyrics(null);
    setPlainLyrics(null);
    setLoading(true);
    setActiveLine(0);

    const cleanTitle  = song.title.replace(/\(.*?\)|\[.*?\]/g, '').trim();
    const cleanArtist = song.artist.replace(/VEVO|Official|Music/gi, '').trim();

    lyricsService.getLyrics(cleanTitle, cleanArtist, song.duration)
      .then(result => {
        if (result.syncedLyrics) {
          setLyrics(lyricsService.parseLRC(result.syncedLyrics));
        } else if (result.plainLyrics) {
          setPlainLyrics(result.plainLyrics);
        }
      })
      .finally(() => setLoading(false));
  }, [song?.id, isOpen]);

  // Sync active line
  useEffect(() => {
    if (!lyrics) return;
    let idx = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentTime) idx = i;
      else break;
    }
    if (idx !== activeLine) {
      setActiveLine(idx);
      lineRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentTime, lyrics]);

  // ── Inline mode (inside full player) ──────────────────────────────────────
  if (inline) {
    return (
      <div className="lyrics-inline">
        {loading && (
          <div className="lyrics-loading">
            <Loader size={22} className="spin" />
            <p>Fetching lyrics...</p>
          </div>
        )}
        {!loading && !lyrics && !plainLyrics && (
          <div className="lyrics-empty">
            <Music2 size={36} strokeWidth={1} />
            <p>No lyrics found</p>
            <span>Try searching a different version of the song</span>
          </div>
        )}
        {!loading && lyrics && (
          <div className="lyrics-lines">
            {lyrics.map((line, i) => (
              <div
                key={i}
                ref={el => { lineRefs.current[i] = el; }}
                className={`lyrics-line ${i === activeLine ? 'active' : i < activeLine ? 'past' : ''}`}
              >
                {line.text}
              </div>
            ))}
            <div className="lyrics-end-spacer" />
          </div>
        )}
        {!loading && !lyrics && plainLyrics && (
          <div className="lyrics-plain">
            {plainLyrics.split('\n').map((line, i) => (
              <p key={i} className={line.trim() === '' ? 'lyrics-gap' : 'lyrics-plain-line'}>
                {line || '\u00A0'}
              </p>
            ))}
          </div>
        )}
        <div className="lyrics-source">Lyrics via LRCLIB.net</div>
      </div>
    );
  }

  // ── Sheet mode (global floating panel from Home/Search/Library) ───────────
  if (!isOpen) return null;

  return (
    <>
      <div className="lyrics-backdrop" onClick={onClose} />
      <div className="lyrics-panel open">
        <div className="lyrics-header">
          <div className="lyrics-song-info">
            {song?.thumbnail && <img src={song.thumbnail} alt="" className="lyrics-thumb" />}
            <div>
              <p className="lyrics-title">{song?.title || 'Now Playing'}</p>
              <p className="lyrics-artist">{song?.artist}</p>
            </div>
          </div>
          <button className="lyrics-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="lyrics-body">
          {loading && (
            <div className="lyrics-loading">
              <Loader size={24} className="spin" />
              <p>Fetching lyrics...</p>
            </div>
          )}
          {!loading && !lyrics && !plainLyrics && (
            <div className="lyrics-empty">
              <Music2 size={40} strokeWidth={1} />
              <p>No lyrics found</p>
              <span>Couldn't find lyrics for this song.</span>
            </div>
          )}
          {!loading && lyrics && (
            <div className="lyrics-lines">
              {lyrics.map((line, i) => (
                <div
                  key={i}
                  ref={el => { lineRefs.current[i] = el; }}
                  className={`lyrics-line ${i === activeLine ? 'active' : i < activeLine ? 'past' : ''}`}
                >
                  {line.text}
                </div>
              ))}
              <div className="lyrics-end-spacer" />
            </div>
          )}
          {!loading && !lyrics && plainLyrics && (
            <div className="lyrics-plain">
              {plainLyrics.split('\n').map((line, i) => (
                <p key={i} className={line.trim() === '' ? 'lyrics-gap' : 'lyrics-plain-line'}>
                  {line || '\u00A0'}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="lyrics-source">Lyrics via LRCLIB.net</div>
      </div>
    </>
  );
}
