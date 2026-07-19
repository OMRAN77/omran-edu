// Vercel Serverless Function: speech-to-text via OpenAI's Whisper model, using
// the site owner's own server-side API key (OPENAI_API_KEY env var). This lets
// mic buttons work reliably on ALL devices (Android + iPhone + desktop), since
// it just records audio (getUserMedia, supported everywhere) instead of relying
// on the inconsistent/unsupported browser SpeechRecognition API.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' });
      return;
    }

    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { audioBase64, mimeType } = body;
    if (!audioBase64) {
      res.status(400).json({ error: 'Missing audioBase64' });
      return;
    }

    const buf = Buffer.from(audioBase64, 'base64');
    const ext = (mimeType && mimeType.includes('mp4')) ? 'mp4'
      : (mimeType && mimeType.includes('ogg')) ? 'ogg'
      : (mimeType && mimeType.includes('wav')) ? 'wav'
      : 'webm';

    const form = new FormData();
    form.append('file', new Blob([buf], { type: mimeType || 'audio/webm' }), 'audio.' + ext);
    form.append('model', 'whisper-1');

    const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      body: form,
    });

    const rawText = await upstream.text();
    if (!upstream.ok) {
      res.status(upstream.status).setHeader('Content-Type', 'application/json').send(rawText);
      return;
    }

    let parsed;
    try { parsed = JSON.parse(rawText); } catch (e) { parsed = null; }
    if (!parsed) {
      res.status(upstream.status).setHeader('Content-Type', 'application/json').send(rawText);
      return;
    }

    res.status(200).json({ text: parsed.text || '' });
  } catch (e) {
    res.status(500).json({ error: 'Proxy error: ' + (e && e.message ? e.message : String(e)) });
  }
};
