// Vercel Serverless Function: generates a structured lesson script (title +
// slides, each with a heading, bullet points, and narration text) using the
// owner's server-side OpenAI key. No user API key required.
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
    let body = req.body;
    if (!body || typeof body === 'string') {
      body = JSON.parse(body || '{}');
    }
    const { topic, durationMinutes, lang, level } = body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' });
      return;
    }
    if (!topic || String(topic).trim().length < 2) {
      res.status(400).json({ error: 'Missing topic' });
      return;
    }

    const mins = Math.max(3, Math.min(45, Number(durationMinutes) || 10));
    const langCode = lang || 'ar';
    const isAr = langCode === 'ar';

    const LANG_NAMES = {
      ar: 'Arabic (Modern Standard Arabic, فصحى)',
      en: 'English',
      fr: 'French',
      hi: 'Hindi',
      ur: 'Urdu',
      bn: 'Bengali',
      ne: 'Nepali',
    };
    const langName = LANG_NAMES[langCode] || LANG_NAMES.ar;

    const LEVEL_LABELS = {
      ar: { school: 'مدرسي', university: 'جامعي' },
      en: { school: 'school', university: 'university' },
      fr: { school: 'scolaire', university: 'universitaire' },
      hi: { school: 'स्कूल', university: 'विश्वविद्यालय' },
      ur: { school: 'اسکول', university: 'یونیورسٹی' },
      bn: { school: 'স্কুল', university: 'বিশ্ববিদ্যালয়' },
      ne: { school: 'विद्यालय', university: 'विश्वविद्यालय' },
    };
    const levelLabel = (LEVEL_LABELS[langCode] || LEVEL_LABELS.ar)[level === 'university' ? 'university' : 'school'];

    // ~140 words per minute of natural narration pace, ~1.5 min per slide
    const targetSlides = Math.max(3, Math.round(mins / 1.5));
    const totalWords = Math.round(mins * 140);

    const sys = `You are an expert curriculum designer. Generate a complete lesson script as JSON only (no text outside JSON). The lesson is at ${levelLabel} level. ALL text values in the JSON (title, heading, bullets, narration) MUST be written entirely in ${langName} — do not mix in other languages. Content must be accurate, well organized, and sized for a video of about ${mins} minutes (~${totalWords} total narration words spread across slides).`;

    const userMsg = `Topic: "${topic}"\n\nGenerate about ${targetSlides} slides (a bit more or fewer if truly needed). Write every field in ${langName}. Return ONLY JSON in exactly this shape:\n{\n  "title": "Lesson title (in ${langName})",\n  "slides": [\n    { "heading": "Slide heading (in ${langName})", "bullets": ["point 1", "point 2", "point 3"] (in ${langName}), "narration": "Full narration text a natural voice will read for this slide, in ${langName}, clear and easy to understand" }\n  ]\n}\nFirst slide is always an intro, last slide is a summary/conclusion.`;

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(upstream.status).json({ error: 'OpenAI error: ' + errText.slice(0, 500) });
      return;
    }

    const data = await upstream.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) {
      res.status(500).json({ error: 'Empty response from model' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      res.status(500).json({ error: 'Model returned invalid JSON' });
      return;
    }

    if (!parsed.slides || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      res.status(500).json({ error: 'Model returned no slides' });
      return;
    }

    res.status(200).json({ title: parsed.title || topic, slides: parsed.slides });
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + (e && e.message ? e.message : String(e)) });
  }
};
