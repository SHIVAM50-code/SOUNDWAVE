// server.cjs — Music API backend server
// Run with: node server.cjs
// Provides: GET /api/search, GET /api/stream, GET /api/proxy-stream, GET /api/lyrics

const express = require('express');
const cors    = require('cors');
const https   = require('https');
const http    = require('http');
const yts     = require('yt-search');
const { execSync, spawn, exec } = require('child_process');

// Try to load youtube-dl-exec (yt-dlp wrapper) — primary strategy
let youtubedl, ytdlpBinPath;
try {
  youtubedl = require('youtube-dl-exec');
  ytdlpBinPath = youtubedl.constants?.YOUTUBE_DL_PATH || 'yt-dlp';
} catch { youtubedl = null; ytdlpBinPath = 'yt-dlp'; }

// Fallback: @distube/ytdl-core
let ytdl;
try { ytdl = require('@distube/ytdl-core'); } catch { ytdl = null; }

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Auto-update yt-dlp on startup (keeps it fresh on Render) ─────────────────
function updateYtDlp() {
  if (!ytdlpBinPath) return;
  console.log('[startup] Attempting yt-dlp self-update...');
  exec(`"${ytdlpBinPath}" -U`, (err, stdout, stderr) => {
    if (err) {
      console.log('[startup] yt-dlp update skipped (may be latest):', err.message?.substring(0,80));
    } else {
      console.log('[startup] yt-dlp update:', (stdout || stderr)?.substring(0,100));
    }
  });
}
updateYtDlp();

// ── GET /api/update-ytdlp ────────────────────────────────────────────────────
app.get('/api/update-ytdlp', (req, res) => {
  exec(`"${ytdlpBinPath}" -U`, (err, stdout, stderr) => {
    res.json({ success: !err, message: (stdout || stderr) });
  });
});

// ── Helper: HTTPS GET ─────────────────────────────────────────────────────────
function httpsGet(hostname, path, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout },
      (res) => {
        let body = '';
        res.on('data', c => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ── Strategy 1: yt-dlp with multiple player clients ──────────────────────────
async function tryYtDlp(videoId) {
  const CLIENTS = ['android', 'mweb', 'tv_embedded', 'web'];
  for (const client of CLIENTS) {
    try {
      console.log(`[stream] Trying yt-dlp (client=${client})...`);
      const args = [
        '--dump-json', '--no-warnings', '--no-check-certificates',
        '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
        '--no-playlist', '--extractor-args', `youtube:player_client=${client}`,
        `https://www.youtube.com/watch?v=${videoId}`,
      ];
      const result = await new Promise((resolve, reject) => {
        let out = ''; let err = '';
        const proc = spawn(ytdlpBinPath, args);
        proc.stdout.on('data', d => { out += d; });
        proc.stderr.on('data', d => { err += d; });
        proc.on('close', code => {
          if (code === 0 && out) {
            try { resolve(JSON.parse(out)); }
            catch (e) { reject(new Error('JSON parse failed')); }
          } else { reject(new Error(err.substring(0, 120) || `exit ${code}`)); }
        });
        proc.on('error', reject);
        setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, 30000);
      });
      if (result?.url) {
        const mime = (result.ext === 'm4a' || result.ext === 'mp4') ? 'audio/mp4' : 'audio/webm';
        return { url: result.url, type: mime, source: `yt-dlp:${client}` };
      }
    } catch (e) {
      console.log(`[stream] yt-dlp (${client}) failed: ${e.message?.substring(0, 100)}`);
    }
  }
  return null;
}

// ── Strategy 2: @distube/ytdl-core with android client ───────────────────────
async function tryYtdlCore(videoId) {
  if (!ytdl) return null;
  try {
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, {
      requestOptions: { headers: { 'User-Agent': 'com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip' } }
    });
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    const chosen = audioFormats.find(f => f.itag === 140) || audioFormats[0];
    return { url: chosen.url, type: chosen.mimeType, source: 'ytdl-core' };
  } catch (e) { return null; }
}

// ── Strategy 3: Piped & Invidious ────────────────────────────────────────────
const PIPED_HOSTS = ['pipedapi.kavin.rocks', 'pipedapi.adminforge.de', 'pipedapi.in.projectsegfau.lt', 'piped-api.lunar.icu'];
const INVIDIOUS_HOSTS = ['inv.tux.pizza', 'invidious.perennialte.ch', 'iv.melmac.space', 'yt.cdaut.de'];

async function tryPiped(videoId) {
  for (const host of PIPED_HOSTS) {
    try {
      const r = await httpsGet(host, `/streams/${videoId}`, 8000);
      if (r.status !== 200) continue;
      const data = JSON.parse(r.body);
      const chosen = (data.audioStreams || []).find(s => s.mimeType?.includes('audio/mp4')) || data.audioStreams?.[0];
      if (chosen?.url) return { url: chosen.url, type: chosen.mimeType, source: `piped:${host}` };
    } catch (e) {}
  }
  return null;
}

async function tryInvidious(videoId) {
  for (const host of INVIDIOUS_HOSTS) {
    try {
      const r = await httpsGet(host, `/api/v1/videos/${videoId}?fields=adaptiveFormats`, 8000);
      if (r.status !== 200) continue;
      const data = JSON.parse(r.body);
      const chosen = (data.adaptiveFormats || []).find(f => f.type?.includes('audio/mp4')) || data.adaptiveFormats?.[0];
      if (chosen?.url) return { url: chosen.url, type: chosen.type, source: `invidious:${host}` };
    } catch (e) {}
  }
  return null;
}

// ── Strategy 5: oEmbed fallback ──────────────────────────────────────────────
async function tryOEmbed(videoId) {
  try {
    const r = await httpsGet('youtube.com', `/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, 5000);
    if (r.status === 200) return { title: JSON.parse(r.body).title, source: 'oembed' };
  } catch (e) {}
  return null;
}

// ── GET /api/search ──────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.status(400).json({ error: 'Missing query' });
  console.log(`[search] "${q}"`);
  try {
    const result = await yts({ query: q, pages: 1 });
    const videos = (result.videos || []).slice(0, 25).map(v => ({
      id: v.videoId,
      title: v.title,
      artist: v.author?.name || 'Unknown Artist',
      thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
      duration: v.seconds || 0,
    }));
    console.log(`[search] Returning ${videos.length} results`);
    return res.json(videos);
  } catch (err) {
    console.error('[search] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stream ──────────────────────────────────────────────────────────
app.get('/api/stream', async (req, res) => {
  const videoId = req.query.id;
  const result = await tryYtDlp(videoId) || await tryPiped(videoId) || await tryInvidious(videoId) || await tryYtdlCore(videoId);
  if (result) res.json(result);
  else res.status(503).json({ error: 'All sources failed' });
});

// ── GET /api/proxy-stream ────────────────────────────────────────────────────
app.get('/api/proxy-stream', async (req, res) => {
  const videoId = req.query.id;
  res.setHeader('Access-Control-Allow-Origin', '*');
  const PIPE_CLIENTS = ['android', 'mweb', 'tv_embedded'];
  for (const client of PIPE_CLIENTS) {
    try {
      console.log(`[proxy-stream] Trying yt-dlp (client=${client})`);
      let hasData = false;
      const proc = spawn(ytdlpBinPath, [
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        '--no-playlist', '--no-warnings',
        '--extractor-args', `youtube:player_client=${client}`,
        '-o', '-',
        `https://www.youtube.com/watch?v=${videoId}`,
      ]);
      proc.stdout.once('data', () => {
        hasData = true;
        res.setHeader('Content-Type', 'audio/mp4');
        proc.stdout.pipe(res);
      });
      proc.stderr.on('data', d => console.log(`[proxy-stream] stderr: ${d.toString().trim().substring(0,80)}`));
      await new Promise(r => setTimeout(r, 6000));
      if (hasData) return;
      proc.kill();
      console.log(`[proxy-stream] yt-dlp (${client}) no data, trying next`);
    } catch (e) {
      console.log(`[proxy-stream] error (${client}): ${e.message}`);
    }
  }
  if (!res.headersSent) res.status(503).end('Proxy failed');
});

// ── GET /api/lyrics ──────────────────────────────────────────────────────────
app.get('/api/lyrics', async (req, res) => {
  const { track_name, artist_name } = req.query;
  try {
    const r = await httpsGet('lrclib.net', `/api/get?track_name=${encodeURIComponent(track_name)}&artist_name=${encodeURIComponent(artist_name)}`);
    if (r.status === 200) res.send(r.body);
    else res.status(404).json({ error: 'Not found' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
  console.log(`\n🎵 Music API server running at http://localhost:${PORT}`);
  console.log(`   yt-dlp:      ${ytdlpBinPath ? '✅ available' : '❌ not found'}`);
  console.log(`   ytdl-core:   ${ytdl ? '✅ available' : '❌ not installed'}`);
});
