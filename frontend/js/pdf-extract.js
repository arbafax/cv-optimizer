/**
 * pdf-extract.js — Textextrahering för CV-filer (PDF, DOCX, TXT, MD)
 * Lazy-laddar format-specifika bibliotek vid behov.
 */

const PDFJS_VERSION = '4.4.168';
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}`;
const MAMMOTH_CDN = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';

let _pdfjsLib = null;
let _mammothLib = null;

async function _getPdfjsLib() {
  if (_pdfjsLib) return _pdfjsLib;
  const mod = await import(`${PDFJS_CDN}/build/pdf.min.mjs`);
  _pdfjsLib = mod;
  _pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/build/pdf.worker.min.mjs`;
  return _pdfjsLib;
}

async function _getMammoth() {
  if (_mammothLib) return _mammothLib;
  if (window.mammoth) { _mammothLib = window.mammoth; return _mammothLib; }
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MAMMOTH_CDN;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Kunde inte ladda mammoth.js'));
    document.head.appendChild(script);
  });
  _mammothLib = window.mammoth;
  return _mammothLib;
}

async function _extractPdf(file) {
  const pdfjsLib = await _getPdfjsLib();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim();
    pageTexts.push(text);
  }
  return pageTexts.join('\n\n');
}

async function _extractDocx(file) {
  const mammoth = await _getMammoth();
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || '';
}

async function _extractPlainText(file) {
  return file.text();
}

/**
 * Extrahera text från en CV-fil (PDF, DOCX, TXT, MD).
 * @param {File} file
 * @returns {string}
 */
async function extractText(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf':  return _extractPdf(file);
    case 'docx': return _extractDocx(file);
    case 'txt':
    case 'md':   return _extractPlainText(file);
    default: throw new Error(`Filformatet .${ext} stöds inte. Använd PDF, DOCX, TXT eller MD.`);
  }
}

/**
 * Extrahera text per sida (PDF only — returnerar array med en sträng per sida).
 * @param {File} file
 * @returns {string[]}
 */
async function extractPages(file) {
  const pdfjsLib = await _getPdfjsLib();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim();
    pages.push(text);
  }
  return pages;
}

window.cvPdf = { extractText, extractPages };
