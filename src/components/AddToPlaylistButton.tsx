// src/components/AddToPlaylistButton.tsx
import { useState, useRef, useEffect } from 'react';
import { ListPlus, Plus, Check } from 'lucide-react';
import type { Song } from '../services/pipedService';
import { usePlaylistContext } from '../context/PlaylistContext';

interface Props {
  song: Song;
  size?: number;
  className?: string;
}

export function AddToPlaylistButton({ song, size = 18, className = '' }: Props) {
  const { playlists, addToPlaylist, createPlaylist } = usePlaylistContext();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside it
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setNewName('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleAdd = (playlistId: string) => {
    addToPlaylist(playlistId, song);
    setJustAdded(playlistId);
    setTimeout(() => setJustAdded(null), 1200);
  };

  const handleCreateAndAdd = () => {
    const name = newName.trim();
    if (!name) return;
    createPlaylist(name, song);
    setNewName('');
    setCreating(false);
    setOpen(false);
  };

  return (
    <div className={`add-to-playlist-wrap ${className}`} ref={wrapRef}>
      <button
        className="song-action-btn"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title="Add to playlist"
      >
        <ListPlus size={size} />
      </button>

      {open && (
        <div className="atp-popover" onClick={(e) => e.stopPropagation()}>
          <p className="atp-popover-label">Add to playlist</p>

          <div className="atp-list">
            {playlists.length === 0 && !creating && (
              <p className="atp-empty">No playlists yet</p>
            )}
            {playlists.map((pl) => (
              <button
                key={pl.id}
                className="atp-item"
                onClick={() => handleAdd(pl.id)}
              >
                <span>{pl.name}</span>
                {justAdded === pl.id ? (
                  <Check size={14} style={{ color: 'var(--primary)' }} />
                ) : (
                  <span className="atp-count">{pl.songs.length}</span>
                )}
              </button>
            ))}
          </div>

          {creating ? (
            <div className="atp-new-row">
              <input
                autoFocus
                className="atp-new-input"
                placeholder="Playlist name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateAndAdd()}
              />
              <button className="atp-new-confirm" onClick={handleCreateAndAdd}>Add</button>
            </div>
          ) : (
            <button className="atp-item atp-create" onClick={() => setCreating(true)}>
              <Plus size={14} /> New playlist
            </button>
          )}
        </div>
      )}
    </div>
  );
}
