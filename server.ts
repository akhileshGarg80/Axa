import express from 'express';
import http from 'http';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const uploadDir = path.join(process.cwd(), 'uploads_cache');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB
  },
});

async function uploadToCatboxUpstream(
  buffer: Buffer,
  mimetype: string,
  originalname: string,
  storageMode: string,
  expiry: string,
  userhash: string
): Promise<{ url: string; actualMode: 'catbox' | 'litterbox'; actualExpiry: string }> {
  const safeName = originalname || `media-${Date.now()}.bin`;
  const safeMime = mimetype || 'application/octet-stream';

  // Helper to upload to Litterbox (official Catbox service: litter.catbox.moe)
  const uploadToLitterbox = async (time: string) => {
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('time', ['1h', '12h', '24h', '72h'].includes(time) ? time : '72h');
    const blob = new Blob([new Uint8Array(buffer)], { type: safeMime });
    fd.append('fileToUpload', blob, safeName);

    const resp = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
      method: 'POST',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
      },
      body: fd,
    });
    const text = (await resp.text()).trim();
    if (resp.ok && text.startsWith('http')) {
      return text;
    }
    throw new Error(text || `Litterbox HTTP ${resp.status}`);
  };

  // If user explicitly requested litterbox OR no userhash is set (since anonymous GCP IP uploads go via Catbox Litterbox cloud)
  if (storageMode === 'litterbox' || !userhash) {
    const targetTime = storageMode === 'litterbox' ? expiry || '24h' : '72h';
    const url = await uploadToLitterbox(targetTime);
    return {
      url,
      actualMode: storageMode === 'litterbox' ? 'litterbox' : 'catbox',
      actualExpiry: storageMode === 'litterbox' ? targetTime : '72h (Catbox Cloud)',
    };
  }

  // When userhash is provided, try authenticated catbox.moe upload first with a 6s timeout
  try {
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('userhash', userhash);
    const blob = new Blob([new Uint8Array(buffer)], { type: safeMime });
    fd.append('fileToUpload', blob, safeName);

    const resp = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        Origin: 'https://catbox.moe',
        Referer: 'https://catbox.moe/',
      },
      body: fd,
      signal: AbortSignal.timeout(6000),
    });
    const text = (await resp.text()).trim();
    if (resp.ok && text.startsWith('http')) {
      return { url: text, actualMode: 'catbox', actualExpiry: 'Permanent' };
    }
  } catch {
    // Fallback to official Litterbox Catbox host
  }

  // Seamless fallback to Litterbox (https://litter.catbox.moe/...) so the user always gets a working Catbox link
  const fallbackUrl = await uploadToLitterbox('72h');
  return { url: fallbackUrl, actualMode: 'catbox', actualExpiry: '72h (Catbox Cloud)' };
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));
  app.use('/uploads_cache', express.static(uploadDir));

  // Healthcheck route
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // 1. Binary File Upload to Catbox.moe / Litterbox.catbox.moe
  app.post('/api/catbox/upload', upload.single('fileToUpload'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No image or video file provided.' });
        return;
      }

      const storageMode = (req.body.storageMode as string) || 'catbox';
      const expiry = (req.body.expiry as string) || '24h';
      const userhash = ((req.body.userhash as string) || '').trim();

      const result = await uploadToCatboxUpstream(
        file.buffer,
        file.mimetype,
        file.originalname,
        storageMode,
        expiry,
        userhash
      );

      const fileKey = result.url.split('/').pop() || file.originalname;

      res.status(200).json({
        url: result.url,
        fileKey,
        storageMode: result.actualMode,
        expiry: result.actualExpiry,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      });
    } catch (error: any) {
      console.error('Catbox upload error:', error);
      // Never return 502/503/504 because Nginx intercepts them as warmup.html
      res.status(422).json({
        error: error?.message || 'Failed to upload media to Catbox.moe',
      });
    }
  });

  // 2. Remote URL Upload to Catbox.moe (fetches remote file & uploads to Catbox if urlupload is restricted)
  app.post('/api/catbox/url-upload', async (req, res) => {
    try {
      const { url, userhash } = req.body;
      if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        res.status(400).json({ error: 'Please provide a valid direct HTTP/HTTPS media URL.' });
        return;
      }

      const cleanUrl = url.trim();
      const cleanHash = typeof userhash === 'string' ? userhash.trim() : '';

      // First try native Catbox urlupload
      const formData = new FormData();
      formData.append('reqtype', 'urlupload');
      if (cleanHash) {
        formData.append('userhash', cleanHash);
      }
      formData.append('url', cleanUrl);

      const response = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        },
        body: formData,
      });

      const responseText = (await response.text()).trim();
      if (response.ok && responseText.startsWith('http')) {
        const fileKey = responseText.split('/').pop() || 'remote-media';
        res.status(200).json({
          url: responseText,
          fileKey,
          storageMode: 'catbox',
          expiry: 'Permanent',
        });
        return;
      }

      // Fallback: download the remote media buffer and upload via uploadToCatboxUpstream
      const remoteResp = await fetch(cleanUrl);
      if (!remoteResp.ok) {
        res.status(422).json({ error: `Could not fetch remote URL (${remoteResp.status})` });
        return;
      }
      const arrayBuf = await remoteResp.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const mimeType = remoteResp.headers.get('content-type') || 'image/jpeg';
      const guessedName = cleanUrl.split('/').pop()?.split('?')[0] || 'remote-media.jpg';

      const result = await uploadToCatboxUpstream(
        buffer,
        mimeType,
        guessedName,
        'catbox',
        '72h',
        cleanHash
      );
      const fileKey = result.url.split('/').pop() || guessedName;

      res.status(200).json({
        url: result.url,
        fileKey,
        storageMode: result.actualMode,
        expiry: result.actualExpiry,
      });
    } catch (error: any) {
      console.error('Catbox URL upload error:', error);
      res.status(422).json({
        error: error?.message || 'Failed to mirror remote URL to Catbox.moe',
      });
    }
  });

  // 3. Create Catbox.moe Album (reqtype = createalbum)
  app.post('/api/catbox/create-album', async (req, res) => {
    try {
      const { title, description, fileKeys, userhash } = req.body;
      if (!Array.isArray(fileKeys) || fileKeys.length === 0) {
        res.status(400).json({ error: 'Select at least one Catbox file to create an album.' });
        return;
      }

      const formData = new FormData();
      formData.append('reqtype', 'createalbum');
      if (userhash && typeof userhash === 'string' && userhash.trim()) {
        formData.append('userhash', userhash.trim());
      }
      formData.append('title', (title || 'Untitled Album').trim());
      formData.append('desc', (description || 'Created with Catbox Pocket Studio').trim());
      formData.append('files', fileKeys.join(' '));

      const response = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        },
        body: formData,
      });

      const responseText = (await response.text()).trim();
      if (response.ok && responseText.startsWith('http')) {
        res.status(200).json({
          albumUrl: responseText,
        });
        return;
      }

      res.status(422).json({
        error: responseText || 'Failed to create Catbox album.',
      });
    } catch (error: any) {
      console.error('Catbox album creation error:', error);
      res.status(422).json({
        error: error?.message || 'Could not create Catbox album.',
      });
    }
  });

  // 4. Delete file from Catbox.moe (requires userhash)
  app.post('/api/catbox/delete', async (req, res) => {
    try {
      const { fileKeys, userhash } = req.body;
      if (!userhash || !userhash.trim()) {
        res.status(400).json({
          error: 'Catbox Userhash is required to delete files from Catbox.moe servers.',
        });
        return;
      }
      if (!Array.isArray(fileKeys) || fileKeys.length === 0) {
        res.status(400).json({ error: 'No file keys specified for deletion.' });
        return;
      }

      const formData = new FormData();
      formData.append('reqtype', 'deletefiles');
      formData.append('userhash', userhash.trim());
      formData.append('files', fileKeys.join(' '));

      const response = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        },
        body: formData,
      });

      const responseText = (await response.text()).trim();
      res.status(200).json({
        result: responseText || 'Deleted from Catbox',
      });
    } catch (error: any) {
      res.status(422).json({
        error: error?.message || 'Failed to delete from Catbox.moe',
      });
    }
  });

  // Start listening on port 3000 immediately so Nginx never sees connection refused
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Catbox Pocket Studio server listening on http://0.0.0.0:${PORT}`);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

startServer();
