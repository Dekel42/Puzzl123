const { onRequest }          = require('firebase-functions/v2/https');
const { logger }             = require('firebase-functions');
const { defineSecret }       = require('firebase-functions/params');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios                  = require('axios');
const cheerio                = require('cheerio');

const geminiKey = defineSecret('GEMINI_API_KEY'); // v0.24

const FINAL_NORM = { 'ן':'נ', 'ם':'מ', 'ף':'פ', 'ך':'כ', 'ץ':'צ' };
const norm = s => String(s).replace(/[ןםףךץ]/g, c => FINAL_NORM[c]);

// ── Gemini Vision: extract clues + solve ─────────────────────────────────────
exports.analyzeCell = onRequest(
  { cors: true, secrets: [geminiKey] },
  async (req, res) => {
    const {
      imageBase64,
      mimeType = 'image/jpeg',
      language = 'heb',
    } = req.body || {};

    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

    const LANG_NAMES = {
      heb: 'Hebrew', eng: 'English', ara: 'Arabic', spa: 'Spanish',
      fra: 'French', deu: 'German',  rus: 'Russian', tur: 'Turkish',
    };
    const langName = LANG_NAMES[language] || 'Hebrew';

    const prompt = `Analyze the image. You will see two types of markings:

Printed Text: These are the crossword clues. FOCUS ONLY ON THESE.
Handwritten Marks: These are user attempts. IGNORE THEM for clue extraction.

This is a ${langName} crossword puzzle.
The clue cell is roughly in the centre of the image. Adjacent cells extend in the arrow direction.

For EACH clue visible:
1. Read the printed clue text exactly.
2. Identify the arrow direction: "left", "right", "down", "down-left", "left-down", "down-right", "right-down".
3. Count the empty answer cells the arrow points to. Stop counting when you reach a thick grid line, the puzzle edge, or another cell that contains printed text and an arrow. That count is the answer length.
4. Suggest ALL plausible single-word ${langName} answers of EXACTLY that length. More options is better.

Return ONLY a valid JSON array, no markdown:
[
  {
    "clue": "exact printed clue text",
    "direction": "left" | "right" | "down" | "down-left" | "left-down" | "down-right" | "right-down",
    "answerLength": <integer>,
    "answers": ["word1", "word2", "word3"]
  }
]
If no printed clue with an arrow is visible, return: []`;

    try {
      const genAI = new GoogleGenerativeAI(geminiKey.value());
      const model = genAI.getGenerativeModel({
        model            : 'gemini-2.5-flash',
        generationConfig : { temperature: 0.2, maxOutputTokens: 800 },
      });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: prompt },
        ]}],
      });

      const raw   = result.response.text();
      logger.info('raw response', raw.slice(0, 600));

      const first = raw.indexOf('[');
      const last  = raw.lastIndexOf(']');
      if (first === -1 || last <= first) {
        logger.warn('no JSON array in response', raw.slice(0, 200));
        return res.json([]);
      }

      const parsed = JSON.parse(raw.slice(first, last + 1));

      for (const item of parsed) {
        if (Array.isArray(item.answers)) {
          item.answers = item.answers.map(norm).filter(a => a.length > 0);
        } else {
          item.answers = [];
        }
      }

      return res.json(parsed);
    } catch (err) {
      logger.error('analyzeCell error', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// ── Pitaronfree scraper (backup) ─────────────────────────────────────────────
const BASE = 'https://pitaronfree.blogspot.com';

exports.solvePitaron = onRequest({ cors: true }, async (req, res) => {
  const { clue, length } = req.body || {};
  if (!clue || !length) return res.status(400).json({ error: 'clue and length required' });
  try {
    const searchRes = await axios.get(`${BASE}/search`, {
      params: { q: clue }, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000,
    });
    const $s = cheerio.load(searchRes.data);
    const firstHref = $s('h3.post-title a, h2.post-title a, .post-title a').first().attr('href');
    if (!firstHref) return res.json({ answers: [], source: null });

    const postRes = await axios.get(firstHref, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000,
    });
    const $p = cheerio.load(postRes.data);
    const bodyText = $p('.post-body, .entry-content').text();
    const re = new RegExp(`פתרון\\s+${length}\\s+אותיות[^:]*:\\s*([^\n]+)`, 'i');
    const m  = bodyText.match(re);
    if (!m) return res.json({ answers: [], source: firstHref });

    const answers = m[1].split(',').map(a => norm(a.trim())).filter(a => a.length === Number(length));
    return res.json({ answers, source: firstHref });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
