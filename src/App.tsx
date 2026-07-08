import { useState, useEffect, useCallback } from 'react';
import { Home, Search, Library, User, Music2 } from 'lucide-react';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import type { Song } from './services/pipedService';
import { wakeupBackend } from './services/pipedService';
import { authService, type User as FirebaseUser } from './services/authService';
import { firestoreService, type Playlist } from './services/firestoreService';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { LibraryPage } from './pages/LibraryPage';
import { AccountPage } from './pages/AccountPage';
import { AudioPlayerControls } from './components/AudioPlayerControls';
import { PlaylistContext } from './context/PlaylistContext';
import './App.css';

// Pre-warm Render backend (free tier sleeps after 15min of inactivity)
wakeupBackend();


type Tab = 'home' | 'search' | 'library' | 'account';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [searchQuery, setSearchQuery]   = useState('');
  const [likedSongs, setLikedSongs]     = useState<Song[]>([]);
  const [playlists, setPlaylists]       = useState<Playlist[]>([]);
  const [user, setUser]                 = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading]   = useState(true);
  const [lastSynced, setLastSynced]     = useState<Date | null>(null);

  const player = useAudioPlayer();
  const { toastMessage, setHistory } = player;

  // ── Auth state ─────────────────────────────────────────────────────────────
  useEffect(() => {
    return authService.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        // Merge cloud data on login
        const [cloudLikes, cloudHistory, cloudPlaylists] = await Promise.all([
          firestoreService.getLikedSongs(u.uid),
          firestoreService.getHistory(u.uid),
          firestoreService.getPlaylists(u.uid),
        ]);
        if (cloudLikes.length > 0) {
          setLikedSongs(prev => {
            const merged = [...cloudLikes, ...prev.filter(p => !cloudLikes.some(c => c.id === p.id))];
            localStorage.setItem('soundwave_liked', JSON.stringify(merged));
            return merged;
          });
        }
        if (cloudHistory.length > 0) {
          setHistory(cloudHistory);
        }
        if (cloudPlaylists.length > 0) {
          setPlaylists(cloudPlaylists);
        }
        setLastSynced(new Date());
      }
      setAuthLoading(false);
    });
  }, [setHistory]);

  // ── Load local storage on mount ────────────────────────────────────────────
  useEffect(() => {
    const savedLikes = localStorage.getItem('soundwave_liked');
    if (savedLikes) setLikedSongs(JSON.parse(savedLikes));

    const savedHistory = localStorage.getItem('soundwave_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));

    const savedPlaylists = localStorage.getItem('soundwave_playlists');
    if (savedPlaylists) setPlaylists(JSON.parse(savedPlaylists));
  }, [setHistory]);

  // ── Sync to Firestore when data changes ────────────────────────────────────
  const syncToCloud = useCallback(async (
    likes: Song[], hist: Song[], pls: Playlist[]
  ) => {
    if (!user) return;
    await Promise.all([
      firestoreService.saveLikedSongs(user.uid, likes),
      firestoreService.saveHistory(user.uid, hist),
      firestoreService.savePlaylists(user.uid, pls),
    ]);
    setLastSynced(new Date());
  }, [user]);

  // ── Like / Unlike ──────────────────────────────────────────────────────────
  const handleToggleLike = useCallback((song: Song) => {
    setLikedSongs(prev => {
      const isLiked = prev.some(s => s.id === song.id);
      const updated = isLiked ? prev.filter(s => s.id !== song.id) : [...prev, song];
      localStorage.setItem('soundwave_liked', JSON.stringify(updated));
      syncToCloud(updated, player.history, playlists);
      player.showToast(isLiked ? 'Removed from Liked' : '❤️ Added to Liked');
      return updated;
    });
  }, [player, playlists, syncToCloud]);

  // ── Playlists ──────────────────────────────────────────────────────────────
  const handleCreatePlaylist = useCallback((name: string, initialSong?: Song) => {
    const newPl: Playlist = {
      id: `pl_${Date.now()}`,
      name,
      songs: initialSong ? [initialSong] : [],
      createdAt: Date.now(),
    };
    setPlaylists(prev => {
      const updated = [...prev, newPl];
      localStorage.setItem('soundwave_playlists', JSON.stringify(updated));
      syncToCloud(likedSongs, player.history, updated);
      return updated;
    });
    player.showToast(initialSong ? `Added to new playlist "${name}"` : `Playlist "${name}" created`);
  }, [likedSongs, player, syncToCloud]);

  const handleDeletePlaylist = useCallback((id: string) => {
    setPlaylists(prev => {
      const updated = prev.filter(p => p.id !== id);
      localStorage.setItem('soundwave_playlists', JSON.stringify(updated));
      syncToCloud(likedSongs, player.history, updated);
      return updated;
    });
    player.showToast('Playlist deleted');
  }, [likedSongs, player, syncToCloud]);

  const handleAddToPlaylist = useCallback((playlistId: string, song: Song) => {
    setPlaylists(prev => {
      const updated = prev.map(p => {
        if (p.id !== playlistId) return p;
        if (p.songs.some(s => s.id === song.id)) return p;
        return { ...p, songs: [...p.songs, song] };
      });
      localStorage.setItem('soundwave_playlists', JSON.stringify(updated));
      syncToCloud(likedSongs, player.history, updated);
      return updated;
    });
    player.showToast('Added to playlist');
  }, [likedSongs, player, syncToCloud]);

  // ── Search navigation ──────────────────────────────────────────────────────
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    setActiveTab('search');
  }, []);

  // ── Account actions ────────────────────────────────────────────────────────
  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('soundwave_history');
    player.showToast('History cleared');
  };

  const handleClearCache = () => {
    sessionStorage.clear();
    player.showToast('Cache cleared');
  };

  const navItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'home',    label: 'Home',    icon: <Home size={22} /> },
    { id: 'search',  label: 'Search',  icon: <Search size={22} /> },
    { id: 'library', label: 'Library', icon: <Library size={22} /> },
    { id: 'account', label: 'Account', icon: <User size={22} /> },
  ];

  const hasPlayer = !!player.currentSong;

  if (authLoading) {
    return (
      <div className="auth-loading-splash">
        <Music2 size={48} className="spin-logo" />
        <h2>SOUNDWAVE</h2>
        <p>Loading your music library...</p>
      </div>
    );
  }

  // Force Sign In for new devices/unauthenticated users
  if (!user) {
    return (
      <div className="app guest-mode">
        <header className="top-bar">
          <div className="logo">
            <Music2 size={20} className="logo-icon" />
            <span>SOUNDWAVE</span>
          </div>
        </header>
        <main className="page-content">
          <AccountPage
            user={null}
            onUserChange={setUser}
            lastSynced={null}
            onClearCache={handleClearCache}
            onClearHistory={handleClearHistory}
          />
        </main>
        {toastMessage && (
          <div className="toast">
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <PlaylistContext.Provider
      value={{ playlists, addToPlaylist: handleAddToPlaylist, createPlaylist: handleCreatePlaylist }}
    >
    <div className="app">
      {/* Top bar */}
      <header className="top-bar">
        <div className="logo">
          <Music2 size={20} className="logo-icon" />
          <span>SOUNDWAVE</span>
        </div>
        {user?.photoURL && (
          <img src={user.photoURL} alt="User" className="top-avatar" onClick={() => setActiveTab('account')} referrerPolicy="no-referrer" />
        )}
      </header>

      {/* Page content */}
      <main className={`page-content ${hasPlayer ? 'has-player' : ''}`}>
        {activeTab === 'home' && (
          <HomePage
            player={player}
            likedSongs={likedSongs}
            onToggleLike={handleToggleLike}
            onSearch={handleSearch}
          />
        )}

        {activeTab === 'search' && (
          <SearchPage
            player={player}
            likedSongs={likedSongs}
            onToggleLike={handleToggleLike}
            initialQuery={searchQuery}
            onBack={() => setActiveTab('home')}
          />
        )}

        {activeTab === 'library' && (
          <LibraryPage
            player={player}
            likedSongs={likedSongs}
            onToggleLike={handleToggleLike}
            playlists={playlists}
            onCreatePlaylist={handleCreatePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            onAddToPlaylist={handleAddToPlaylist}
          />
        )}

        {activeTab === 'account' && (
          <AccountPage
            user={user}
            onUserChange={setUser}
            lastSynced={lastSynced}
            onClearCache={handleClearCache}
            onClearHistory={handleClearHistory}
          />
        )}
      </main>

      {/* Audio Player Controls (self-contained with fixed positioning) */}
      <AudioPlayerControls
        player={player}
        likedSongs={likedSongs}
        onToggleLike={handleToggleLike}
      />

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => {
              if (item.id === 'search' && activeTab === 'search') return;
              setActiveTab(item.id);
            }}
            aria-label={item.label}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.id === 'account' && user && <span className="nav-dot" />}
          </button>
        ))}
      </nav>

      {/* Toast */}
      {toastMessage && (
        <div className="toast">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
    </PlaylistContext.Provider>
  );
}

export default App;
