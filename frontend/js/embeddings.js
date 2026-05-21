/**
 * embeddings.js — Lokala embeddings via Transformers.js + cosine similarity
 * Modell: Xenova/all-MiniLM-L6-v2 (384 dimensioner, ~22 MB, cachas i browser)
 */

let _pipeline = null;
let _loading = false;
let _loadPromise = null;

const MODEL = 'Xenova/all-MiniLM-L6-v2';

/**
 * Ladda Transformers.js-modellen (lazy, en gång per session).
 * Modellen cachas i browser-cache — andra anropet är omedelbart.
 */
async function _getEmbedder() {
  if (_pipeline) return _pipeline;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
    _pipeline = await pipeline('feature-extraction', MODEL, {
      quantized: true,
      progress_callback: (p) => {
        if (p.status === 'downloading') {
          const pct = p.total ? Math.round((p.loaded / p.total) * 100) : '?';
          console.log(`[embeddings] Laddar modell: ${pct}%`);
        }
      },
    });
    return _pipeline;
  })();

  return _loadPromise;
}

/**
 * Generera embedding för en sträng.
 * @returns {number[]} - Float32Array som vanlig array
 */
async function generate(text) {
  const embedder = await _getEmbedder();
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Cosine similarity mellan två vektorer.
 * @returns {number} - 0.0–1.0
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Hitta likartade poster i en samling baserat på semantisk likhet.
 * @param {number[]} queryVec - embeddingvektor för sökfrasen
 * @param {Array}   items     - poster med .embedding[]
 * @param {number}  threshold - minsta similarity (0–1), default 0.85
 * @returns {Array} - matchande poster med .similarity tillagt
 */
function similaritySearch(queryVec, items, threshold = 0.85) {
  return items
    .filter(item => item.embedding?.length === queryVec.length)
    .map(item => ({
      ...item,
      similarity: cosineSimilarity(queryVec, item.embedding),
    }))
    .filter(item => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * Kontrollera om en text är semantiskt lik något i listan.
 * @param {string} text      - texten att kontrollera
 * @param {Array}  items     - poster med .embedding[] (och valfritt .question_text)
 * @param {number} threshold - similarity-gräns, default 0.85
 * @returns {{ isDuplicate: boolean, match: object|null, similarity: number }}
 */
async function checkSimilar(text, items, threshold = 0.85) {
  const queryVec = await generate(text);
  const matches = similaritySearch(queryVec, items, threshold);
  if (matches.length === 0) return { isDuplicate: false, match: null, similarity: 0 };
  return { isDuplicate: true, match: matches[0], similarity: matches[0].similarity };
}

/**
 * Backfill: generera embeddings för alla poster som saknar dem.
 * @param {Array}    items    - poster med .id och .question_text (eller .text)
 * @param {Function} getText  - (item) => string att embedda
 * @param {Function} onUpdate - async (id, embedding) => void — anropas per uppdaterad post
 * @returns {number} - antal uppdaterade poster
 */
async function backfill(items, getText, onUpdate) {
  let count = 0;
  for (const item of items) {
    if (item.embedding?.length) continue;
    const text = getText(item);
    if (!text) continue;
    const embedding = await generate(text);
    await onUpdate(item.id, embedding);
    count++;
  }
  return count;
}

window.cvEmbed = {
  generate,
  cosineSimilarity,
  similaritySearch,
  checkSimilar,
  backfill,
};
