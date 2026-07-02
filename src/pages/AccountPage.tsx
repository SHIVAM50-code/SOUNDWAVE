// src/pages/AccountPage.tsx
import { useState } from 'react';
import { LogOut, User, Shield, Trash2, ChevronRight, Music2, Cloud, CheckCircle, RefreshCw } from 'lucide-react';
import { authService, type User as FirebaseUser } from '../services/authService';
import { isFirebaseConfigured } from '../firebase';

interface Props {
  user: FirebaseUser | null;
  onUserChange: (user: FirebaseUser | null) => void;
  lastSynced: Date | null;
  onClearCache: () => void;
  onClearHistory: () => void;
}

export function AccountPage({ user, onUserChange, lastSynced, onClearCache, onClearHistory }: Props) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    setSigningIn(true);
    setError('');
    try {
      const u = await authService.signInWithGoogle();
      if (u) onUserChange(u);
    } catch (e: any) {
      setError(e.message || 'Sign-in failed. Try again.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await authService.signOut();
    onUserChange(null);
  };

  const formatSyncTime = (d: Date) => {
    const diff = Math.round((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    return d.toLocaleTimeString();
  };

  return (
    <div className="account-page">
      <div className="account-header">
        <h1>Account</h1>
      </div>

      {/* Profile card */}
      <div className="profile-card">
        {user ? (
          <div className="profile-signed-in">
            <div className="avatar-wrapper">
              {user.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="avatar" referrerPolicy="no-referrer" />
              ) : (
                <div className="avatar-placeholder">
                  <User size={28} />
                </div>
              )}
              <div className="online-dot" />
            </div>
            <div className="profile-info">
              <p className="profile-name">{user.displayName || 'Soundwave User'}</p>
              <p className="profile-email">{user.email}</p>
              {lastSynced && (
                <p className="sync-time">
                  <Cloud size={12} /> Synced {formatSyncTime(lastSynced)}
                </p>
              )}
            </div>
            <button className="sign-out-btn" onClick={handleSignOut} title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        ) : (
          <div className="profile-signed-out">
            <div className="avatar-placeholder large">
              <User size={40} />
            </div>
            <div className="sign-in-text">
              <p>Sign in to sync your music</p>
              <span>Your liked songs, history & playlists sync across all your devices</span>
            </div>
            {!isFirebaseConfigured && (
              <div className="firebase-notice">
                <Shield size={14} />
                <span>Firebase setup required — see <code>src/firebase.ts</code></span>
              </div>
            )}
            <button
              className="google-sign-in-btn"
              onClick={handleSignIn}
              disabled={signingIn}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              {signingIn ? 'Signing in...' : 'Sign in with Google'}
            </button>
            {error && <p className="auth-error">{error}</p>}
          </div>
        )}
      </div>

      {/* Sync features */}
      {user && (
        <div className="account-section">
          <h2>Cloud Sync</h2>
          <div className="feature-list">
            {['Liked Songs', 'Listening History', 'Playlists'].map(f => (
              <div key={f} className="feature-row">
                <CheckCircle size={16} className="feature-check" />
                <span>{f}</span>
                <span className="feature-synced">Synced</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="account-section">
        <h2>Settings</h2>
        <div className="settings-list">
          <button className="settings-row" onClick={onClearHistory}>
            <Trash2 size={16} className="settings-icon" />
            <span>Clear Listening History</span>
            <ChevronRight size={16} />
          </button>
          <button className="settings-row" onClick={onClearCache}>
            <RefreshCw size={16} className="settings-icon" />
            <span>Clear App Cache</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* About */}
      <div className="account-section">
        <h2>About</h2>
        <div className="about-card">
          <Music2 size={24} className="about-icon" />
          <div>
            <p className="about-title">Soundwave</p>
            <p className="about-sub">Ad-free music for everyone</p>
            <p className="about-version">v2.0.0 — Personal Edition</p>
          </div>
        </div>
      </div>
    </div>
  );
}
