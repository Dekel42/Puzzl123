const { onRequest }          = require('firebase-functions/v2/https');
const { logger }             = require('firebase-functions');
const { defineSecret }       = require('firebase-functions/params');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios                  = require('axios');
const cheerio                = require('cheerio');

const geminiKey = defineSecret('GEMINI_API_KEY');

const FINAL_NORM = { 'ן':'נ', 'ם':'מ', 'ף':'פ', 'ך':'כ', 'ץ':'צ' };
const norm = s => s.replace(/[ןםףךץ]/g, c => FINAL_NORM[c]);

// ── Gemini Vision: validate clue cell + solve ────────────────────────────────
exports.analyzeCell = onRequest(
  { cors: true, secrets: [geminiKey] },
  async (req, res) => {
    const {
      imageBase64,
      mimeType    = 'image/jpeg',
      rightLength = 0,
      downLength  = 0,
    } = req.body || {};

    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

    const hints = [];
    if (rightLength > 0) hints.push(`Horizontal answer must be exactly ${rightLength} letters.`);
    if (downLength  > 0) hints.push(`Down answer must be exactly ${downLength} letters.`);

    const prompt = `You are analyzing a cropped cell from a crossword puzzle photo.

A CLUE cell contains printed text (a definition, typically 2+ words) and a small arrow pointing
toward the empty answer cells. Hebrew puzzles use left arrows and down arrows. English use right and down.
An ANSWER cell is blank or has only a single handwritten letter/digit — it is NOT a clue cell.

${hints.join('\n')}

If this IS a clue cell:
1. Read the printed text exactly (ignore the arrow symbol itself).
2. Identify ALL arrow directions present: any of "left", "right", "down",
   "down-left", "left-down", "down-right", "right-down".
3. Solve the clue for each direction with the given letter count (if provided).

Respond with ONLY valid JSON, no markdown:
{
  "isClue": true | false,
  "clueText": "clue text or null",
  "arrowDirection": "left" | "right" | "down" | "down-left" | "left-down" | "down-right" | "right-down" | null,
  "horizAnswer": "answer for horizontal direction or null",
  "downAnswer":  "answer for down direction or null"
}`;

    try {
      const genAI = new GoogleGenerativeAI(geminiKey.value());
      const model = genAI.getGenerativeModel(
        { model: 'gemini-1.5-flash', generationConfig: { temperature: 0.1, maxOutputTokens: 300 } },
        { apiVersion: 'v1' },
      );

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: prompt },
        ]}],
      });

      const raw    = result.response.text();
      const json   = raw.replace(/```(?:json)?\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(json);

      if (parsed.horizAnswer) parsed.horizAnswer = norm(parsed.horizAnswer);
      if (parsed.downAnswer)  parsed.downAnswer  = norm(parsed.downAnswer);

      return res.json(parsed);
    } catch (err) {
      logger.error('analyzeCell error', err.message);
      return res.status(500).json({ error: err.message, isClue: false });
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
