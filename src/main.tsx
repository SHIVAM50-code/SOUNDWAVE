import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const CURRENT_VERSION = '1.7.2';
const windowVersion = (window as any).__APP_VERSION__;

if (windowVersion && windowVersion !== CURRENT_VERSION) {
  console.warn('[client] Stale version detected. Wiping service workers and reloading...');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) {
        reg.unregister();
      }
      localStorage.clear();
      window.location.reload();
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)