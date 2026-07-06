// src/services/downloadService.ts — Offline downloads via IndexedDB
import type { Song } from './pipedService';
import { API_BASE_URL } from './apiConfig';
import { getStreamUrl } from './streamService';

const DB_NAME    = 'soundwave-downloads';
const STORE_NAME = 'songs';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbTransaction<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db    = await openDB();
  const tx    = db.transaction(STORE_NAME, mode);
  const store = tx.objectStore(STORE_NAME);
  return new Promise<T>((resolve, reject) => {
    const req  = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export interface DownloadedSong {
  id: string;
  song: Song;
  blob: Blob;
  mimeType: string;
  downloadedAt: number;
  size: number;
}

export const downloadService = {
  async isDownloaded(songId: string): Promise<boolean> {
    try {
      const item = await dbTransaction<DownloadedSong | undefined>('readonly', (s) => s.get(songId));
      return !!item;
    } catch { return false; }
  },

  async getOfflineUrl(songId: string): Promise<string | null> {
    try {
      const item = await dbTransaction<DownloadedSong | undefined>('readonly', (s) => s.get(songId));
      if (!item) return null;
      return URL.createObjectURL(item.blob);
    } catch { return null; }
  },

  async getAllDownloads(): Promise<DownloadedSong[]> {
    try {
      const db   = await openDB();
      const tx   = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result as DownloadedSong[]);
        req.onerror   = () => reject(req.error);
      });
    } catch { return []; }
  },

  async deleteDownload(songId: string): Promise<void> {
    await dbTransaction<undefined>('readwrite', (s) => s.delete(songId));
  },

  // ── Main download function ─────────────────────────────────────────────────
  async downloadSong(
    song: Song,
    onProgress?: (pct: number) => void,
    onError?: (msg: string) => void,
  ): Promise<boolean> {
    try {
      onProgress?.(5);

      // Strategy A: Try browser-side direct download first using Piped stream URL
      // (Piped proxy endpoints have CORS enabled, so we can fetch them directly)
      try {
        console.log('[download] Attempting direct browser-side download...');
        const result = await getStreamUrl(song.id);
        if (result?.url) {
          console.log(`[download] Fetching stream directly from: ${result.url}`);
          const response = await fetch(result.url, {
            signal: AbortSignal.timeout(90000), // 90s timeout for browser download
          });
          if (response.ok && response.body) {
            console.log('[download] ✅ Browser-side direct download succeeded!');
            onProgress?.(10);
            const mimeType = response.headers.get('content-type') || result.type || 'audio/mp4';
            return await downloadService._streamToIndexedDB(song, response, mimeType, onProgress);
          }
        }
      } catch (browserErr: any) {
        console.warn('[download] Browser-side direct download failed, falling back to server proxy:', browserErr.message || browserErr);
      }

      // Strategy B: Fallback to server-side proxy-stream
      console.log('[download] Falling back to server-side proxy-stream...');
      const response = await fetch(`${API_BASE_URL}/api/proxy-stream?id=${song.id}`, {
        signal: AbortSignal.timeout(180000), // 3 min timeout for large files
      });

      if (!response.ok || !response.body) {
        throw new Error(`Proxy stream failed: HTTP ${response.status}`);
      }

      onProgress?.(10);
      const mimeType = response.headers.get('content-type') || 'audio/mp4';
      return await downloadService._streamToIndexedDB(song, response, mimeType, onProgress);
    } catch (err: any) {
      console.error('[download] Failed:', err);
      onError?.(`Download failed: ${err.message || 'Check connection'}`);
      return false;
    }
  },

  // ── Internal: stream response body into IndexedDB ─────────────────────────
  async _streamToIndexedDB(
    song: Song,
    response: Response,
    mimeType: string,
    onProgress?: (pct: number) => void,
  ): Promise<boolean> {
    const contentLength = Number(response.headers.get('content-length') || 0);
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (contentLength > 0) {
          onProgress?.(10 + Math.round((received / contentLength) * 85));
        } else {
          onProgress?.(Math.min(90, 10 + Math.round(received / 50000)));
        }
      }
    }

    const actualMime = response.headers.get('content-type') || mimeType;
    const blob = new Blob(chunks as unknown as BlobPart[], { type: actualMime });

    const record: DownloadedSong = {
      id: song.id,
      song,
      blob,
      mimeType: actualMime,
      downloadedAt: Date.now(),
      size: blob.size,
    };
    await dbTransaction<IDBValidKey>('readwrite', (s) => s.put(record));

    onProgress?.(100);
    return true;
  },

  // ── Save to device filesystem (creates Soundwave/ folder on supported browsers) ──
  async saveToFileSystem(blob: Blob, song: Song, mimeType: string): Promise<void> {
    const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
    const filename = `${song.title} - ${song.artist}.${ext}`
      .replace(/[<>:"/\\|?*]/g, '') // sanitize
      .substring(0, 200);

    // Modern browsers: File System Access API (saves to any folder user picks or default Downloads)
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          startIn: 'music',
          types: [{ description: 'Audio', accept: { [mimeType]: [`.${ext}`] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (e: any) {
        if (e.name === 'AbortError') return; // user cancelled
      }
    }

    // Fallback: trigger anchor download (works on all browsers/mobile)
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  },
};
