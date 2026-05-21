/**
 * pdf-extract.js — PDF-textextrahering via pdf.js (Mozilla)
 * CDN: https://cdn.jsdelivr.net/npm/pdfjs-dist@4.x/
 */

const PDFJS_VERSION = '4.4.168';
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}`;

let _pdfjsLib = null;

async function _getPdfjsLib() {
  if (_pdfjsLib) return _pdfjsLib;

  const mod = await import(`${PDFJS_CDN}/build/pdf.min.mjs`);
  _pdfjsLib = mod;
  // Worker måste pekas ut explicit
  _pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/build/pdf.worker.min.mjs`;
  return _pdfjsLib;
}

/**
 * Extrahera all text från en PDF-fil.
 * @param {File} file - File-objekt från <input type="file">
 * @returns {string} - extraherad text
 */
async function extractText(file) {
  const pdfjsLib = await _getPdfjsLib();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pageTexts.push(pageText);
  }

  return pageTexts.join('\n\n');
}

/**
 * Extrahera text som en array av sidor (en sträng per sida).
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
    const text = content.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages.push(text);
  }

  return pages;
}

window.cvPdf = { extractText, extractPages };
