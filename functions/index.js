const { onRequest }   = require('firebase-functions/v2/https');
const { logger }      = require('firebase-functions');
const { VertexAI }    = require('@google-cloud/vertexai');
const axios           = require('axios');
const cheerio         = require('cheerio');

// Vertex AI uses the Cloud Function's service account — no API key needed.
// Charges go directly to the puzzl123 Firebase (Blaze) project.
const vertexAI = new VertexAI({ project: 'puzzl123', location: 'us-central1' });

const FINAL_NORM = { 'ן':'נ', 'ם':'מ', 'ף':'פ', 'ך':'כ', 'ץ':'צ' };
const norm = s => s.replace(/[ןםףךץ]/g, c => FINAL_NORM[c]);

// ── Gemini Vision via Vertex AI: validate clue cell + solve ─────────────────
exports.analyzeCell = onRequest({ cors: true }, async (req, res) => {
  const {
    imageBase64,
    mimeType    = 'image/jpeg',
    rightLength = 0,
    downLength  = 0,
  } = req.body || {};

  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

  const hints = [];
  if (rightLength > 0) hints.push(`Right-direction (→) answer must be exactly ${rightLength} Hebrew letters.`);
  if (downLength  > 0) hints.push(`Down-direction  (↓) answer must be exactly ${downLength}  Hebrew letters.`);

  const prompt = `You are analyzing a cropped cell from a Hebrew crossword puzzle photo.

A CLUE cell contains printed Hebrew text (a definition, typically 2+ words) and a small arrow
(→ or ↓ or both) pointing toward the empty answer cells.
An ANSWER cell is blank or has only a single handwritten letter/digit — it is NOT a clue cell.

${hints.join('\n')}

If this IS a clue cell:
1. Read the Hebrew printed text exactly (ignore the arrow symbol itself).
2. Note arrow direction: "right", "down", or "both".
3. Solve the Hebrew crossword clue for each relevant direction with the given letter count.

Respond with ONLY valid JSON, no markdown:
{
  "isClue": true | false,
  "clueText": "Hebrew clue text or null",
  "arrowDirection": "right" | "down" | "both" | null,
  "rightAnswer": "answer for → direction or null",
  "downAnswer":  "answer for ↓ direction or null"
}`;

  try {
    const model  = vertexAI.preview.getGenerativeModel({
      model            : 'gemini-2.0-flash-001',
      generationConfig : { temperature: 0.1, maxOutputTokens: 300 },
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType, data: imageBase64 } },
        { text: prompt },
      ]}],
    });

    const raw  = result.response.candidates[0].content.parts[0].text;
    const json = raw.replace(/```(?:json)?\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(json);

    if (parsed.rightAnswer) parsed.rightAnswer = norm(parsed.rightAnswer);
    if (parsed.downAnswer)  parsed.downAnswer  = norm(parsed.downAnswer);

    return res.json(parsed);
  } catch (err) {
    logger.error('analyzeCell error', err.message);
    return res.status(500).json({ error: err.message, isClue: false });
  }
});

// ── Pitaronfree scraper (backup, kept for reference) ────────────────────────
const BASE = 'https://pitaronfree.blogspot.com';

exports.solvePitaron = onRequest({ cors: true }, async (req, res) => {
  const { clue, length } = req.body || {};
  if (!clue || !length) {
    return res.status(400).json({ error: 'clue and length required' });
  }
  try {
    const searchRes = await axios.get(`${BASE}/search`, {
      params: { q: clue },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    const $s = cheerio.load(searchRes.data);
    const firstHref = $s('h3.post-title a, h2.post-title a, .post-title a').first().attr('href');
    if (!firstHref) return res.json({ answers: [], source: null });

    const postRes = await axios.get(firstHref, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
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
