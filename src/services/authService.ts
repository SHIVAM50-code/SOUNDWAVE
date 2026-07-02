// src/services/authService.ts
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, type User } from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../firebase';

export type { User };

export const authService = {
  isConfigured: isFirebaseConfigured,

  signInWithGoogle: async (): Promise<User | null> => {
    if (!isFirebaseConfigured) {
      alert('Firebase is not configured yet. See src/firebase.ts for setup instructions.');
      return null;
    }
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (err: any) {
      console.error('[auth] Sign-in error details:', err);
      let msg = err.message || 'Sign-in failed.';
      
      // Provide actionable solutions for common Firebase auth errors
      if (err.code === 'auth/internal-error') {
        msg = 'Firebase Internal Error. If you are accessing the app via a local IP (e.g. on a phone or other device) or a custom domain, you MUST add that IP/domain to the "Authorized Domains" list in your Firebase Console (Authentication -> Settings -> Authorized Domains).';
      } else if (err.code === 'auth/unauthorized-domain') {
        msg = 'Unauthorized Domain. This domain is not authorized in the Firebase Console. Go to Authentication -> Settings -> Authorized Domains and add the current domain/IP.';
      } else if (err.code === 'auth/popup-blocked') {
        msg = 'Sign-in popup was blocked by your browser. Please allow popups for this site or try again.';
      } else if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Sign-in popup was closed before completing. Please try again.';
      }
      
      throw new Error(msg);
    }
  },

  signOut: async (): Promise<void> => {
    await firebaseSignOut(auth);
  },

  onAuthStateChanged: (callback: (user: User | null) => void) => {
    if (!isFirebaseConfigured) {
      callback(null);
      return () => {};
    }
    return onAuthStateChanged(auth, callback);
  },

  getCurrentUser: (): User | null => auth.currentUser,
};
