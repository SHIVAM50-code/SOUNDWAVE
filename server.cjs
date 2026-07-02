// server.cjs — Music API backend server
// Run with: node server.cjs
// Provides: GET /api/search, GET /api/stream, GET /api/proxy-stream, GET /api/lyrics

const express = require('express');
const cors    = require('cors');
const https   = require('https');
const http    = require('http');
const yts     = require('yt-search');
const { execSync, spawn } = require('child_process');

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
const PORT = 3001;

app.use(cors());
app.use(express.json());

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

// ── Strategy 1: yt-dlp (most reliable — updated daily) ───────────────────────
async function tryYtDlp(videoId) {
  if (!youtubedl) return null;
  try {
    console.log('[stream] Trying yt-dlp...');
    const result = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      format: 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
      noPlaylist: true,
    });
    if (result && result.url) {
      console.log(`[stream] ✅ yt-dlp | format: ${result.ext || 'unknown'} | ${result.acodec || ''}`);
      const mime = (result.ext === 'm4a' || result.ext === 'mp4') ? 'audio/mp4' : 'audio/webm';
      return { url: result.url, type: mime, source: 'yt-dlp' };
    }
    // Try requested_formats array
    if (result && result.requested_formats) {
      const audio = result.requested_formats.find(f => f.acodec !== 'none' && f.vcodec === 'none');
      if (audio?.url) {
        const mime = (audio.ext === 'm4a' || audio.ext === 'mp4') ? 'audio/mp4' : 'audio/webm';
        console.log(`[stream] ✅ yt-dlp (requested_formats) | ${audio.ext}`);
        return { url: audio.url, type: mime, source: 'yt-dlp' };
      }
    }
    console.log('[stream] yt-dlp: no audio URL in result');
  } catch (e) {
    console.log(`[stream] yt-dlp failed: ${e.message?.substring(0, 120)}`);
  }
  return null;
}

// ── Strategy 2: @distube/ytdl-core ───────────────────────────────────────────
async function tryYtdlCore(videoId) {
  if (!ytdl) return null;
  try {
    console.log('[stream] Trying @distube/ytdl-core...');
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    const m4a  = audioFormats.find(f => f.itag === 140 || f.container === 'mp4');
    const webm = audioFormats.find(f => f.container === 'webm');
    const chosen = m4a || webm || audioFormats[0];
    if (chosen?.url) {
      console.log(`[stream] ✅ ytdl-core | itag: ${chosen.itag}`);
      return { url: chosen.url, type: chosen.mimeType || 'audio/mp4', source: 'ytdl-core' };
    }
  } catch (e) {
    console.log(`[stream] ytdl-core failed: ${e.message?.substring(0, 100)}`);
  }
  return null;
}

// ── Piped / Invidious ────────────────────────────────────────────────────────
const PIPED_HOSTS = ['pipedapi.kavin.rocks', 'piped-api.lunar.icu', 'pipedapi.moomoo.me'];
const INVIDIOUS_HOSTS = ['inv.tux.pizza', 'invidious.perennialte.ch', 'iv.melmac.space'];

async function tryPiped(videoId) {
  for (const host of PIPED_HOSTS) {
    try {
      console.log(`[stream] Trying Piped: ${host}`);
      const r = await httpsGet(host, `/streams/${videoId}`, 8000);
      if (r.status !== 200) { console.log(`[stream] ${host} → HTTP ${r.status}`); continue; }
      const data = JSON.parse(r.body);
      const streams = data.audioStreams || [];
      const chosen = streams.find(s => s.mimeType?.includes('audio/mp4'))
                  || streams.find(s => s.mimeType?.includes('audio/webm'))
                  || streams[0];
      if (chosen?.url) {
        console.log(`[stream] ✅ Piped:${host}`);
        return { url: chosen.url, type: chosen.mimeType, source: `piped:${host}` };
      }
    } catch (e) {
      console.log(`[stream] Piped ${host}: ${e.message?.substring(0, 80)}`);
    }
  }
  return null;
}

async function tryInvidious(videoId) {
  for (const host of INVIDIOUS_HOSTS) {
    try {
      console.log(`[stream] Trying Invidious: ${host}`);
      const r = await httpsGet(host, `/api/v1/videos/${videoId}?fields=adaptiveFormats`, 8000);
      if (r.status !== 200) { console.log(`[stream] ${host} → HTTP ${r.status}`); continue; }
      const data = JSON.parse(r.body);
      const fmts = data.adaptiveFormats || [];
      const chosen = fmts.find(f => f.type?.includes('audio/mp4') || f.itag === 140)
                  || fmts.find(f => f.type?.includes('audio/webm'))
                  || fmts[0];
      if (chosen?.url) {
        console.log(`[stream] ✅ Invidious:${host}`);
        return { url: chosen.url, type: chosen.type, source: `invidious:${host}` };
      }
    } catch (e) {
      console.log(`[stream] Invidious ${host}: ${e.message?.substring(0, 80)}`);
    }
  }
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

// ── GET /api/stream?id=VIDEO_ID ──────────────────────────────────────────────
app.get('/api/stream', async (req, res) => {
  const videoId = req.query.id || '';
  if (!videoId) return res.status(400).json({ error: 'Missing video ID' });
  console.log(`\n[stream] Fetching audio for: ${videoId}`);

  // Try strategies in order of reliability
  const ytdlpResult = await tryYtDlp(videoId);
  if (ytdlpResult) return res.json(ytdlpResult);

  const ytdlResult = await tryYtdlCore(videoId);
  if (ytdlResult) return res.json(ytdlResult);

  const pipedResult = await tryPiped(videoId);
  if (pipedResult) return res.json(pipedResult);

  const invResult = await tryInvidious(videoId);
  if (invResult) return res.json(invResult);

  console.error('[stream] ❌ All strategies failed for', videoId);
  return res.status(503).json({ error: 'All stream sources failed', videoId });
});

// ── GET /api/proxy-stream?id=VIDEO_ID ────────────────────────────────────────
// Pipes audio bytes through our server (avoids CORS issues in browser)
app.get('/api/proxy-stream', async (req, res) => {
  const videoId = req.query.id || '';
  if (!videoId) return res.status(400).end('Missing id');
  console.log(`[proxy-stream] Request for ${videoId}`);

  // Strategy A: yt-dlp direct pipe to stdout
  if (youtubedl) {
    try {
      console.log(`[proxy-stream] Trying yt-dlp pipe... (${ytdlpBinPath})`);
      
      res.setHeader('Content-Type', 'audio/mp4');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      const proc = spawn(ytdlpBinPath, [
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        '--no-playlist',
        '--no-warnings',
        '-o', '-',  // output to stdout
        `https://www.youtube.com/watch?v=${videoId}`,
      ]);

      let hasData = false;
      proc.stdout.on('data', () => { hasData = true; });
      proc.stdout.pipe(res);

      proc.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) console.log(`[proxy-stream] yt-dlp stderr: ${msg.substring(0, 100)}`);
      });

      proc.on('close', (code) => {
        if (code !== 0 && !hasData) {
          console.log(`[proxy-stream] yt-dlp exited with code ${code}`);
          if (!res.headersSent) res.status(500).end('yt-dlp failed');
        }
      });

      proc.on('error', (e) => {
        console.log(`[proxy-stream] yt-dlp spawn error: ${e.message}`);
        if (!res.headersSent) res.status(500).end('yt-dlp spawn failed');
      });

      // Give yt-dlp 3 seconds to start sending data; if nothing, try next strategy
      await new Promise(resolve => setTimeout(resolve, 3000));
      if (hasData) return; // yt-dlp is working, let it finish

      // If no data yet, don't kill it — it might just be slow. Let it continue.
      // But we won't fall through to other strategies since we already started piping.
      return;
    } catch (e) {
      console.log(`[proxy-stream] yt-dlp pipe failed: ${e.message}`);
    }
  }

  // Strategy B: Get URL from any working strategy, then pipe via https
  try {
    const streamResult = await tryYtDlp(videoId) || await tryYtdlCore(videoId) 
                      || await tryPiped(videoId) || await tryInvidious(videoId);
    if (streamResult?.url) {
      const loc = new URL(streamResult.url);
      const mod = loc.protocol === 'https:' ? https : http;
      res.setHeader('Content-Type', streamResult.type || 'audio/mp4');
      res.setHeader('Access-Control-Allow-Origin', '*');
      mod.get(streamResult.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
        if (r.statusCode >= 400) {
          console.log(`[proxy-stream] URL fetch returned ${r.statusCode}`);
          if (!res.headersSent) res.status(502).end('Upstream error');
          return;
        }
        r.pipe(res);
      }).on('error', (e) => {
        console.error('[proxy-stream] pipe error:', e.message);
        if (!res.headersSent) res.status(500).end('Pipe error');
      });
      return;
    }
  } catch (e) {
    console.log(`[proxy-stream] URL strategy failed: ${e.message}`);
  }

  // Strategy C: ytdl-core direct pipe (last resort)
  if (ytdl) {
    try {
      res.setHeader('Content-Type', 'audio/webm');
      res.setHeader('Access-Control-Allow-Origin', '*');
      ytdl(`https://www.youtube.com/watch?v=${videoId}`, { quality: 'highestaudio', filter: 'audioonly' })
        .on('error', (e) => {
          console.error('[proxy-stream] ytdl pipe error:', e.message);
          if (!res.headersSent) res.status(500).end();
        })
        .pipe(res);
      return;
    } catch (e) {
      console.log(`[proxy-stream] ytdl pipe failed: ${e.message}`);
    }
  }

  res.status(503).end('All proxy strategies failed');
});

// ── GET /api/lyrics ──────────────────────────────────────────────────────────
app.get('/api/lyrics', async (req, res) => {
  const { track_name, artist_name, duration } = req.query;
  if (!track_name || !artist_name) return res.status(400).json({ error: 'Missing params' });
  console.log(`[lyrics] "${track_name}" by "${artist_name}"`);
  try {
    const params = new URLSearchParams({
      track_name: String(track_name),
      artist_name: String(artist_name),
      ...(duration ? { duration: String(duration) } : {}),
    });
    const r = await httpsGet('lrclib.net', `/api/get?${params.toString()}`, 8000);
    if (r.status === 200) {
      console.log('[lyrics] ✅ Found');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(r.body);
    }
    console.log(`[lyrics] Not found (${r.status})`);
    return res.status(r.status).json({ error: 'Lyrics not found' });
  } catch (err) {
    console.error('[lyrics] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎵 Music API server running at http://localhost:${PORT}`);
  console.log(`   yt-dlp:      ${youtubedl ? '✅ available' : '❌ not installed'}`);
  console.log(`   ytdl-core:   ${ytdl ? '✅ available' : '❌ not installed'}`);
  console.log(`   Search:      GET /api/search?q=brown+rang`);
  console.log(`   Stream URL:  GET /api/stream?id=VIDEO_ID`);
  console.log(`   Proxy audio: GET /api/proxy-stream?id=VIDEO_ID`);
  console.log(`   Lyrics:      GET /api/lyrics?track_name=X&artist_name=Y\n`);
});
