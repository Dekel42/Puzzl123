const { onRequest } = require('firebase-functions/v2/https');
const { logger }    = require('firebase-functions');
const axios         = require('axios');
const cheerio       = require('cheerio');

const BASE = 'https://pitaronfree.blogspot.com';

// Hebrew final-letter normalisation (crossword convention)
const FINAL_NORM = { 'ן':'נ', 'ם':'מ', 'ף':'פ', 'ך':'כ', 'ץ':'צ' };
const norm = s => s.replace(/[ןםףךץ]/g, c => FINAL_NORM[c]);

exports.solvePitaron = onRequest({ cors: true }, async (req, res) => {
  const { clue, length } = req.body || {};
  if (!clue || !length) {
    return res.status(400).json({ error: 'clue (string) and length (number) are required' });
  }

  try {
    // 1. Search the blog for the clue
    const searchRes = await axios.get(`${BASE}/search`, {
      params: { q: clue },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    const $s = cheerio.load(searchRes.data);

    // Blogger search result post-title selector
    const firstHref = $s('h3.post-title a, h2.post-title a, .post-title a').first().attr('href');
    if (!firstHref) return res.json({ answers: [], source: null });

    // 2. Fetch the matched post
    const postRes = await axios.get(firstHref, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    const $p = cheerio.load(postRes.data);

    // 3. Extract the answer line for the requested word length
    const bodyText = $p('.post-body, .entry-content').text();

    // Pattern: "פתרון 4 אותיות: answer1, answer2"
    const re = new RegExp(`פתרון\\s+${length}\\s+אותיות[^:]*:\\s*([^\n]+)`, 'i');
    const m  = bodyText.match(re);
    if (!m) return res.json({ answers: [], source: firstHref });

    const answers = m[1]
      .split(',')
      .map(a => norm(a.trim()))
      .filter(a => a.length === Number(length));

    return res.json({ answers, source: firstHref });
  } catch (err) {
    logger.error('solvePitaron error', err.message);
    return res.status(500).json({ error: 'scrape failed', detail: err.message });
  }
});
