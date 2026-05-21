# Skiss: CV Optimizer – Helt webbläsarbaserad version

> Status: Spaning/planering — inget implementerat ännu.
> Syfte: Undersöka om hela appen kan köras utan backend-server.

---

## Kärnfrågan

Kan CV Optimizer köras **enbart i webbläsaren**, utan FastAPI/PostgreSQL?

**Svar: Ja, i princip — med tre viktiga avvägningar:**
1. API-nycklar måste hanteras av användaren själv (eller Ollama lokalt)
2. Multi-user auth försvinner → en lokal profil per webbläsarinstallation
3. Vektorlikhet beräknas i JS istället för pgvector

---

## Vad IndexedDB klarar

IndexedDB är en fullständig NoSQL-databas inbyggd i webbläsaren:
- Persistent lagring (GBs möjligt, begränsas av disk)
- Transaktioner, index, komplexa queries
- Kan lagra binärdata (Float32Array → embeddings)
- Fungerar offline
- Tillgänglig i alla moderna webbläsare

### Tabeller → IndexedDB Object Stores

| PostgreSQL-tabell         | IndexedDB store            | Notering                        |
|---------------------------|----------------------------|---------------------------------|
| `candidate_profiles`      | `profile`                  | En post (single-user)           |
| `candidate_skills`        | `skills`                   | Direkt mappning                 |
| `candidate_experiences`   | `experiences`              | Inkl. embeddings som Float32Array |
| `cvs`                     | `cvs`                      | Text + strukturerad JSON        |
| `candidate_education`     | `education`                | Direkt mappning                 |
| `candidate_certifications`| `certifications`           | Direkt mappning                 |
| `personality_questions`   | `pq`                       | Kan ship:as som seed-data       |
| `personality_answers`     | `pa`                       | Direkt mappning                 |
| `search_profiles`         | `search_profiles`          | Direkt mappning                 |
| `users`                   | *(tas bort)*               | Ersätts av lokal profil + PIN   |

---

## Vad som försvinner / ersätts

### Försvinner helt
- **FastAPI backend** — all logik flyttas till JS
- **PostgreSQL + pgvector** — ersätts av IndexedDB + JS-vektorer
- **JWT-auth / httpOnly cookies** — inte relevant utan server
- **Multi-user** — en profil per webbläsare (eller flera via IndexedDB-databaser)
- **Docker** — inte längre nödvändigt

### Ersätts med browser-alternativ

| Backend-funktion              | Browser-alternativ                          |
|-------------------------------|---------------------------------------------|
| PDF-parsing (pdfminer)        | **pdf.js** (Mozilla, mogen och stabil)      |
| Vektor-embeddings (OpenAI)    | **Transformers.js** (lokalt) *eller* API-nyckel |
| Cosine similarity (pgvector)  | 10 rader JS (`dot / (magA * magB)`)         |
| AI-matchning (GPT-4o)         | OpenAI/Claude/Gemini via användarens nyckel |
| AI CV-generering              | Samma                                       |

---

## API-nycklar — det enda verkliga hindret

Nuvarande backend gömmer API-nycklar på servern.  
I en ren browser-app finns tre vägar:

### Alternativ A: Användaren anger sin egen nyckel
- Inställningspanel: "Klistra in din OpenAI-nyckel"
- Lagras i IndexedDB (aldrig skickas någonstans)
- Används direkt i `fetch()` mot `api.openai.com`
- **Pro:** Enklast. Användaren betalar sin egen förbrukning.
- **Con:** Kräver att användaren har ett API-konto.

### Alternativ B: Ollama (lokal LLM-server)
- Användaren kör `ollama serve` lokalt (en liten app)
- Appen anropar `http://localhost:11434/api/chat`
- Modeller: `llama3`, `mistral`, `phi3` m.fl.
- **Pro:** 100% offline, inga API-kostnader.
- **Con:** Kräver installation av Ollama + modell (~4–8 GB).
- **Matchningskvalitet:** Lägre än GPT-4o men acceptabelt för enklare uppgifter.

### Alternativ C: Hybridlösning
- Enkla operationer (sparning, CRUD) → helt lokalt
- Tunga AI-operationer (matchning, CV-generering) → valfri backend/API
- Användaren väljer provider i inställningar

**Rekommendation för en "kör lokalt"-version: Alternativ B (Ollama) med fallback till A.**

---

## Transformers.js — lokala embeddings

[Transformers.js](https://huggingface.co/docs/transformers.js) kör ML-modeller direkt i webbläsaren via WebAssembly/WebGPU:

```javascript
import { pipeline } from '@xenova/transformers';

const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const output = await embedder('Vad tror du att du gör om 5 år?', { pooling: 'mean', normalize: true });
// output.data = Float32Array med 384 dimensioner
```

- Modellen (~22 MB) laddas ner första gången, cachas sedan i browser
- Dimensioner: 384 (vs. OpenAIs 1536) — lite sämre men fungerar
- **Duplikatkontroll av personlighetsfrågor** → fungerar utan API-nyckel
- **Jobbannonsmatchning** → embeddings för semantisk förfiltrering

---

## Arkitektur för browser-only versionen

```
index.html  (exakt som idag)
│
├── js/
│   ├── db.js              NY — IndexedDB wrapper (öppna, läsa, skriva, söka)
│   ├── ai.js              NY — AI-abstraktionslager (OpenAI / Ollama / Gemini)
│   ├── embeddings.js      NY — Transformers.js + cosine similarity
│   ├── pdf-extract.js     NY — pdf.js wrapper
│   ├── app-state.js       MODIFIERAD — apiFetch ersätts med db.js-anrop
│   ├── app-cv.js          MODIFIERAD — PDF-extract via pdf.js
│   ├── app-bank.js        LITEN ÄNDRING — anropar db.js
│   ├── app-match.js       MODIFIERAD — AI-anrop via ai.js
│   └── ...övriga          MINIMALA ÄNDRINGAR
│
└── css/style.css          OFÖRÄNDRAD
```

### db.js — exempel på API

```javascript
const db = await openDB('cv-optimizer', 1);

// Spara erfarenhet
await db.put('experiences', { id: crypto.randomUUID(), title: '...', ... });

// Hämta alla skills
const skills = await db.getAll('skills');

// Semantisk sökning (manuellt)
const all = await db.getAll('pq');
const matches = cosineSimilaritySearch(queryVec, all, 0.70);
```

---

## Vad som behåller hög kvalitet vs. försämras

| Funktion                    | Nuläge (backend) | Browser-only          |
|-----------------------------|------------------|-----------------------|
| Datapersistens              | ★★★★★           | ★★★★☆ (IndexedDB)    |
| PDF-parsing                 | ★★★★☆           | ★★★★☆ (pdf.js)       |
| AI-matchning                | ★★★★★           | ★★★★★ (samma API)    |
| Embeddings/duplikat         | ★★★★★           | ★★★☆☆ (Transformers.js) |
| Multi-user                  | ★★★★★           | ★☆☆☆☆ (single-user)  |
| Offline-stöd                | ★☆☆☆☆           | ★★★★★               |
| Installation                | Komplex (Docker) | ★★★★★ (bara öppna fil) |
| Säkerhet (API-nycklar)      | ★★★★★           | ★★★☆☆ (i browsern)   |

---

## Möjlig migreringsplan (om vi väljer att gå vidare)

### Fas 1 — Datalager (1–2 dagar)
- [ ] Skriv `db.js` med IndexedDB-wrapper för alla stores
- [ ] Migrera `app-bank.js` att läsa/skriva mot IndexedDB
- [ ] Seed-script: exportera befintlig data från PostgreSQL → JSON → importera till IndexedDB

### Fas 2 — PDF och embeddings (1 dag)
- [ ] Integrera `pdf.js` för PDF-extrahering
- [ ] Integrera `Transformers.js` för lokala embeddings
- [ ] Implementera `cosineSimilarity()` i JS

### Fas 3 — AI-abstraktionslager (1 dag)
- [ ] Skriv `ai.js` med stöd för OpenAI / Ollama / Gemini
- [ ] Inställningspanel: välj provider + klistra in API-nyckel
- [ ] Migrera `app-match.js` och `app-cv.js` att använda `ai.js`

### Fas 4 — Auth ersätts (0.5 dag)
- [ ] Ta bort JWT/login
- [ ] Lägg till enkel lokal PIN (valfritt, bcrypt.js i browser)
- [ ] Eller: öppna direkt utan inloggning (single-user assumption)

### Fas 5 — Finjustering (1 dag)
- [ ] Service Worker för offline-stöd
- [ ] Export/import av all data som JSON (backup)
- [ ] Valfritt: paketera som Electron-app för desktop-installation

---

## Intressant sidospår: Electron-app

Om man går hela vägen → paketera som **Electron** (eller **Tauri** för lättare app):
- Körs som en "riktig" skrivbordsapp (Mac/Windows/Linux)
- Kan använda Node.js för tyngre operationer
- Ollama-integrering blir smidigare
- Kan installeras och distribueras som `.dmg` / `.exe`

---

## Slutsats

**Fullt genomförbart.** Huvudsakliga kompromisser:

1. **API-nycklar** löses elegantast med "användarens egna nyckel" (vanligt mönster för AI-verktyg)
2. **Multi-user** försvinner — rimligt för ett personligt verktyg
3. **Embedding-kvalitet** sjunker lite med Transformers.js men är tillräcklig

Störst vinst: **noll installation** (bara öppna HTML-filen), **offline-stöd**, **ingen drift**.

> Nästa steg om vi vill gå vidare: börja med Fas 1 (db.js) och verifiera
> att all data kan lagras/hämtas korrekt innan vi rör AI-lagret.
