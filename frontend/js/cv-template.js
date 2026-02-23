/**
 * CV-mall för markdown-export
 * Redigera den här filen för att ändra struktur och ordning på CV-utkastet.
 *
 * Tillgängliga platshållare:
 *   {{pitch}}        – AI-genererad profiltext (2-5 meningar om matchningen)
 *   {{experiences}}  – Komplett tidslinje med erfarenheter och prestationer
 *   {{skills}}       – Relevanta kompetenser som en punktseparerad rad
 *
 * All övrig text i mallen skrivs ut exakt som den är.
 * Rubriker, separatorer och fri text kan läggas till fritt.
 */

const CV_TEMPLATE = `## Profil

{{pitch}}

---

## Erfarenheter

{{experiences}}

---

## Relevanta kompetenser

{{skills}}
`;
