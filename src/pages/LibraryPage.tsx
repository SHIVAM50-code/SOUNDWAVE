// src/pages/LibraryPage.tsx
import { useState, useEffect } from 'react';
import { Heart, Clock, Download, Trash2, Wifi, WifiOff, List, Plus, X, GripVertical } from 'lucide-react';
import { downloadService, type DownloadedSong } from '../services/downloadService';
import type { Song } from '../services/pipedService';
import { SongCard } from '../components/SongCard';
import type { AudioPlayerHookType } from '../hooks/useAudioPlayer';
import type { Playlist } from '../services/firestoreService';

type LibTab = 'liked' | 'downloads' | 'history' | 'playlists';

interface Props {
  player: AudioPlayerHookType;
  likedSongs: Song[];
  onToggleLike: (song: Song) => void;
  playlists: Playlist[];
  onCreatePlaylist: (name: string) => void;
  onDeletePlaylist: (id: string) => void;
  onAddToPlaylist: (playlistId: string, song: Song) => void;
  onRemoveFromPlaylist: (playlistId: string, songId: string) => void;
  onReorderPlaylist: (playlistId: string, songs: Song[]) => void;
}

export function LibraryPage({ 
  player, 
  likedSongs, 
  onToggleLike, 
  playlists, 
  onCreatePlaylist, 
  onDeletePlaylist,
  onRemoveFromPlaylist,
  onReorderPlaylist 
}: Props) {
  const [activeTab, setActiveTab] = useState<LibTab>('liked');
  const [downloads, setDownloads] = useState<DownloadedSong[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  
  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Sync downloads list
  useEffect(() => {
    if (activeTab === 'downloads') {
      downloadService.getAllDownloads().then(setDownloads);
    }
  }, [activeTab]);

  // Reset playlist selection when active tab changes
  useEffect(() => {
    setSelectedPlaylistId(null);
  }, [activeTab]);

  const handleDeleteDownload = async (songId: string) => {
    await downloadService.deleteDownload(songId);
    setDownloads(prev => prev.filter(d => d.id !== songId));
  };

  const moveSong = (index: number, direction: 'up' | 'down') => {
    if (!selectedPlaylist) return;
    const songs = [...selectedPlaylist.songs];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= songs.length) return;
    
    // Swap songs
    const temp = songs[index];
    songs[index] = songs[newIndex];
    songs[newIndex] = temp;
    
    onReorderPlaylist(selectedPlaylist.id, songs);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index || !selectedPlaylist) return;
    const reordered = [...selectedPlaylist.songs];
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(index, 0, moved);
    onReorderPlaylist(selectedPlaylist.id, reordered);
    setDraggedIndex(null);
  };

  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId);

  const tabs: { id: LibTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'liked',     label: 'Liked',     icon: <Heart size={15} />,     count: likedSongs.length },
    { id: 'downloads', label: 'Downloads', icon: <Download size={15} />,  count: downloads.length },
    { id: 'history',   label: 'History',   icon: <Clock size={15} />,     count: player.history.length },
    { id: 'playlists', label: 'Playlists', icon: <List size={15} />,      count: playlists.length },
  ];

  // ── Render Playlist Detail View ───────────────────────────────────────────
  if (selectedPlaylist) {
    return (
      <div className="library-page">
        <div className="playlist-detail-header">
          <button className="back-btn" onClick={() => setSelectedPlaylistId(null)}>
            ← Back to Playlists
          </button>
          
          <div className="playlist-banner">
            <div className="playlist-large-art">
              {selectedPlaylist.songs.slice(0, 4).map((s, i) => (
                <img key={i} src={s.thumbnail} alt="" />
              ))}
              {selectedPlaylist.songs.length === 0 && <List size={32} />}
            </div>
            
            <div className="playlist-banner-info">
              <h2>{selectedPlaylist.name}</h2>
              <p className="playlist-detail-meta">{selectedPlaylist.songs.length} songs</p>
              
              {selectedPlaylist.songs.length > 0 && (
                <button 
                  className="play-all-playlist-btn"
                  onClick={() => player.playSong(selectedPlaylist.songs[0], selectedPlaylist.songs)}
                >
                  ▶ Play Playlist
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="playlist-songs-list">
          {selectedPlaylist.songs.length === 0 ? (
            <div className="empty-state">
              <List size={48} strokeWidth={1} />
              <p>This playlist is empty</p>
              <span>Add songs using the "+" button on any track</span>
            </div>
          ) : (
            <div className="playlist-songs-container">
              {selectedPlaylist.songs.map((song, index) => {
                const isCurrent = player.currentSong?.id === song.id;
                
                return (
                  <div 
                    key={`${song.id}-${index}`} 
                    className={`playlist-song-row ${isCurrent ? 'active' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(index)}
                    onClick={() => player.playSong(song, selectedPlaylist.songs)}
                  >
                    {/* Reorder actions */}
                    <div className="song-row-left" onClick={e => e.stopPropagation()}>
                      <div className="song-reorder-arrows">
                        <button 
                          disabled={index === 0} 
                          onClick={() => moveSong(index, 'up')}
                          className="arrow-btn"
                          title="Move up"
                        >▲</button>
                        <button 
                          disabled={index === selectedPlaylist.songs.length - 1} 
                          onClick={() => moveSong(index, 'down')}
                          className="arrow-btn"
                          title="Move down"
                        >▼</button>
                      </div>
                      
                      <div className="drag-handle-icon" title="Drag to reorder">
                        <GripVertical size={16} color="var(--text-muted)" />
                      </div>

                      <img src={song.thumbnail} alt="" className="song-row-thumb" />
                    </div>

                    <div className="song-row-info">
                      <p className={`song-row-title ${isCurrent ? 'playing-title' : ''}`}>{song.title}</p>
                      <p className="song-row-artist">{song.artist}</p>
                    </div>

                    <div className="song-row-actions" onClick={e => e.stopPropagation()}>
                      <button 
                        className="remove-song-btn"
                        onClick={() => onRemoveFromPlaylist(selectedPlaylist.id, song.id)}
                        title="Remove from playlist"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render General Library View ──────────────────────────────────────────
  return (
    <div className="library-page">
      <div className="library-header">
        <h1>Your Library</h1>
      </div>

      {/* Tab bar */}
      <div className="lib-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`lib-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.count !== undefined && t.count > 0 && (
              <span className="lib-tab-count">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Liked Songs */}
      {activeTab === 'liked' && (
        <div className="lib-content">
          {likedSongs.length === 0 ? (
            <div className="empty-state">
              <Heart size={48} strokeWidth={1} />
              <p>No liked songs yet</p>
              <span>Tap the ♡ on any song to save it here</span>
            </div>
          ) : (
            <div className="song-list">
              {likedSongs.map(song => (
                <SongCard
                  key={song.id}
                  song={song}
                  isPlaying={player.currentSong?.id === song.id && player.isPlaying}
                  isActive={player.currentSong?.id === song.id}
                  isLiked={true}
                  onPlay={() => player.playSong(song, likedSongs)}
                  onAddToQueue={() => player.addToQueue(song)}
                  onToggleLike={() => onToggleLike(song)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Downloads */}
      {activeTab === 'downloads' && (
        <div className="lib-content">
          {downloads.length === 0 ? (
            <div className="empty-state">
              <Download size={48} strokeWidth={1} />
              <p>No downloads yet</p>
              <span>Tap the ↓ button on any song to save it offline</span>
            </div>
          ) : (
            <>
              <div className="offline-banner">
                <WifiOff size={14} />
                <span>These songs play offline — even without internet</span>
                <button
                  className="play-all-offline-btn"
                  onClick={async () => {
                    const songs = downloads.map(d => d.song);
                    const first = downloads[0];
                    const url = await downloadService.getOfflineUrl(first.id);
                    if (url) {
                      player.playSong({ ...first.song, offlineUrl: url }, songs.map(s => s));
                    } else {
                      player.playSong(first.song, songs);
                    }
                  }}
                >▶ Play All</button>
              </div>
              <div className="downloads-list">
                {downloads.map(dl => (
                  <div key={dl.id} className="download-row">
                    <img src={dl.song.thumbnail} alt={dl.song.title} className="download-thumb" />
                    <div className="download-info">
                      <p className="download-title">{dl.song.title}</p>
                      <p className="download-meta">
                        {dl.song.artist} · {downloadService.formatSize(dl.size)}
                      </p>
                    </div>
                    <div className="download-actions">
                      <button
                        className="play-offline-btn"
                        onClick={async () => {
                          const url = await downloadService.getOfflineUrl(dl.id);
                          player.playSong(url ? { ...dl.song, offlineUrl: url } : dl.song, downloads.map(d => d.song));
                        }}
                        title="Play offline"
                      >
                        <Wifi size={14} />
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteDownload(dl.id)}
                        title="Delete download"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* History */}
      {activeTab === 'history' && (
        <div className="lib-content">
          {player.history.length === 0 ? (
            <div className="empty-state">
              <Clock size={48} strokeWidth={1} />
              <p>No listening history yet</p>
              <span>Songs you play will appear here</span>
            </div>
          ) : (
            <div className="song-list">
              {player.history.map(song => (
                <SongCard
                  key={song.id}
                  song={song}
                  isPlaying={player.currentSong?.id === song.id && player.isPlaying}
                  isActive={player.currentSong?.id === song.id}
                  isLiked={likedSongs.some(s => s.id === song.id)}
                  onPlay={() => player.playSong(song, player.history)}
                  onAddToQueue={() => player.addToQueue(song)}
                  onToggleLike={() => onToggleLike(song)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Playlists */}
      {activeTab === 'playlists' && (
        <div className="lib-content">
          <div className="playlist-header-row">
            <button className="create-playlist-btn" onClick={() => setShowNewPlaylist(true)}>
              <Plus size={16} /> New Playlist
            </button>
          </div>

          {showNewPlaylist && (
            <div className="new-playlist-form">
              <input
                className="playlist-name-input"
                placeholder="Playlist name..."
                value={newPlaylistName}
                onChange={e => setNewPlaylistName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newPlaylistName.trim()) {
                    onCreatePlaylist(newPlaylistName.trim());
                    setNewPlaylistName('');
                    setShowNewPlaylist(false);
                  }
                }}
                autoFocus
              />
              <button
                className="confirm-btn"
                onClick={() => {
                  if (newPlaylistName.trim()) {
                    onCreatePlaylist(newPlaylistName.trim());
                    setNewPlaylistName('');
                    setShowNewPlaylist(false);
                  }
                }}
              >Create</button>
              <button className="cancel-btn" onClick={() => setShowNewPlaylist(false)}>
                <X size={14} />
              </button>
            </div>
          )}

          {playlists.length === 0 ? (
            <div className="empty-state">
              <List size={48} strokeWidth={1} />
              <p>No playlists yet</p>
              <span>Create a playlist to organize your music</span>
            </div>
          ) : (
            <div className="playlists-grid">
              {playlists.map(pl => (
                <div 
                  key={pl.id} 
                  className="playlist-card"
                  onClick={() => setSelectedPlaylistId(pl.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="playlist-art">
                    {pl.songs.slice(0, 4).map((s, i) => (
                      <img key={i} src={s.thumbnail} alt="" />
                    ))}
                    {pl.songs.length === 0 && <List size={32} />}
                  </div>
                  <p className="playlist-name">{pl.name}</p>
                  <p className="playlist-count">{pl.songs.length} songs</p>
                  <div className="playlist-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="play-playlist-btn"
                      onClick={() => pl.songs.length > 0 && player.playSong(pl.songs[0], pl.songs)}
                    >Play</button>
                    <button className="delete-playlist-btn" onClick={() => onDeletePlaylist(pl.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
