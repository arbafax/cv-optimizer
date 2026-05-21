# Teknisk spec: CV Optimizer – Browser-only

> Underlag för implementering av BROWSER_ONLY_PLAN.md.
> Täcker: IndexedDB-schema, db.js API-kontrakt, endpoint-mappning.

---

## 1. IndexedDB-schema

Databasen heter `cv-optimizer`, version `1`.

### Stores

```
cv-optimizer (IDBDatabase)
├── profile          keyPath: "id"          (en enda post, id = "singleton")
├── skills           keyPath: "id"          autoIncrement
├── experiences      keyPath: "id"          autoIncrement
├── cvs              keyPath: "id"          autoIncrement
├── education        keyPath: "id"          autoIncrement
├── certifications   keyPath: "id"          autoIncrement
├── pq               keyPath: "id"          (personality questions, id = heltal som backend)
├── pa               keyPath: "id"          autoIncrement
├── search_profiles  keyPath: "id"          autoIncrement
└── settings         keyPath: "key"         (nyckel-värde-store)
```

### Store-definitioner

#### `profile`
```javascript
{
  id: "singleton",             // fast nyckel, alltid samma post
  email: string,
  public_name: string | null,
  public_phone: string | null,
  roles: string | null,
  desired_city: string | null,
  desired_employment: string[],
  desired_workplace: string[],
  desired_domains: string[],
  unwanted_domains: string[],
  willing_to_commute: boolean,
  searchable: boolean,
  available_from: string | null,
  description: string | null
}
```

#### `skills`
```javascript
{
  id: number,                  // autoIncrement
  skill_name: string,          // INDEX: unik per profil (enforced i JS)
  category: string | null,
  skill_type: string | null,
  source_cv_ids: number[],
  embedding: number[] | null   // Float32Array serialiseras som vanlig array
}
```
Index: `skill_name` (unik).

#### `experiences`
```javascript
{
  id: number,                  // autoIncrement
  title: string,
  organization: string | null,
  experience_type: "work" | "education" | "certification" | "project",
  start_date: string | null,   // "YYYY-MM"
  end_date: string | null,
  is_current: boolean,
  description: string | null,
  achievements: string[],
  related_skills: string[],
  source_cv_ids: number[],
  embedding: number[] | null
}
```
Index: `experience_type`.

#### `cvs`
```javascript
{
  id: number,                  // autoIncrement
  filename: string,
  title: string,
  upload_date: string,         // ISO-datum
  original_text: string,
  structured_data: object      // GPT-4o-strukturerat JSON
}
```

#### `education`
```javascript
{
  id: number,
  degree: string,
  institution: string | null,
  field_of_study: string | null,
  start_date: string | null,
  end_date: string | null,
  description: string | null,
  source_cv_id: number | null
}
```

#### `certifications`
```javascript
{
  id: number,
  name: string,
  issuer: string | null,
  date_issued: string | null,
  expiry_date: string | null,
  credential_id: string | null,
  credential_url: string | null,
  source_cv_id: number | null
}
```

#### `pq` (personality questions)
```javascript
{
  id: number,                  // samma id som i backend-databasen (seed-data)
  question_text: string,
  context: string | null,
  category: string | null,
  big_five_trait: "O"|"C"|"E"|"A"|"N" | null,
  big_five_dir: 1 | -1 | null,
  is_active: boolean,
  embedding: number[] | null
}
```
Index: `category`, `is_active`.

#### `pa` (personality answers)
```javascript
{
  id: number,                  // autoIncrement
  question_id: number,         // INDEX
  answer_text: string,
  likert_score: number | null,
  embedding: number[] | null,
  updated_at: string           // ISO-datum
}
```
Index: `question_id` (unik — en svar per fråga).

#### `search_profiles`
```javascript
{
  id: number,
  name: string,
  roles: string | null,
  desired_city: string | null,
  desired_employment: string[],
  desired_workplace: string[],
  willing_to_commute: boolean,
  notes: string | null,
  job_description: string | null,
  saved_job_ads: object[],
  saved_match_results: object[],
  created_at: string
}
```

#### `settings`
```javascript
{ key: "ai_provider",   value: "openai" | "ollama" | "anthropic" | "gemini" }
{ key: "openai_key",    value: string }
{ key: "anthropic_key", value: string }
{ key: "gemini_key",    value: string }
{ key: "ollama_url",    value: "http://localhost:11434" }
{ key: "ollama_model",  value: "llama3" }
```

---

## 2. db.js – API-kontrakt

`db.js` är en asynkron wrapper runt IndexedDB.
Alla funktioner returnerar Promise. Fel kastas som vanliga Error.

### Initiering

```javascript
// Anropas en gång vid app-start
await db.init();
```

### profile

```javascript
db.profile.get()                    → ProfileObject
db.profile.save(data)               → ProfileObject
```

### skills

```javascript
db.skills.list()                    → Skill[]
db.skills.add({ skill_name, category, skill_type })  → Skill
db.skills.update(id, data)          → Skill
db.skills.delete(id)                → void
db.skills.stats()                   → { total: n, by_category: {...} }
```

### experiences

```javascript
db.experiences.list()               → Experience[]
db.experiences.get(id)              → Experience
db.experiences.add(data)            → Experience
db.experiences.update(id, data)     → Experience
db.experiences.delete(id)           → void

db.experiences.addAchievement(id, text)            → Experience
db.experiences.updateAchievement(id, index, text)  → Experience
db.experiences.deleteAchievement(id, index)        → Experience
db.experiences.replaceAchievements(id, list)       → Experience

db.experiences.updateDescription(id, text)         → Experience
db.experiences.updatePeriod(id, { start_date, end_date, is_current }) → Experience

db.experiences.addSkill(id, skillName)             → Experience
db.experiences.removeSkill(id, index)              → Experience
```

### cvs

```javascript
db.cvs.list()                       → CV[]
db.cvs.get(id)                      → CV
db.cvs.add(data)                    → CV
db.cvs.delete(id)                   → void
db.cvs.updateTitle(id, title)       → CV
```

### education

```javascript
db.education.list()                 → Education[]
db.education.add(data)              → Education
db.education.update(id, data)       → Education
db.education.delete(id)             → void
```

### certifications

```javascript
db.certifications.list()            → Certification[]
db.certifications.add(data)         → Certification
db.certifications.update(id, data)  → Certification
db.certifications.delete(id)        → void
```

### pq (personality questions)

```javascript
db.pq.list({ active_only: true })   → Question[]
db.pq.get(id)                       → Question
db.pq.add(data)                     → Question
db.pq.update(id, data)              → Question
db.pq.delete(id)                    → void
db.pq.seed(questions[])             → void     // engångsimport från JSON
```

### pa (personality answers)

```javascript
db.pa.list()                        → Answer[]
db.pa.getByQuestion(questionId)     → Answer | null
db.pa.upsert(questionId, { answer_text, likert_score }) → Answer
db.pa.nextUnanswered(skipIds[])     → Question | null
db.pa.bigFiveScores()               → { O, C, E, A, N }   // 0-100 per dimension
```

### search_profiles

```javascript
db.searchProfiles.list()            → SearchProfile[]
db.searchProfiles.get(id)           → SearchProfile
db.searchProfiles.add(data)         → SearchProfile
db.searchProfiles.update(id, data)  → SearchProfile
db.searchProfiles.delete(id)        → void
db.searchProfiles.saveJob(id, jobAd)        → SearchProfile
db.searchProfiles.saveResult(id, result)    → SearchProfile
```

### settings

```javascript
db.settings.get(key)                → value | null
db.settings.set(key, value)         → void
db.settings.getAll()                → { [key]: value }
```

### Intern hjälpfunktion (används av db.js internt)

```javascript
db._tx(stores, mode, fn)            // skapar transaktion, kör fn, returnerar Promise
```

---

## 3. Endpoint-mappning

Backend-endpoint → vad den ersätts med i browser-only versionen.

> Teckenförklaring:
> `db.*` = direkt IndexedDB-anrop
> `ai.*` = anrop till ai.js (OpenAI/Ollama/Gemini)
> `embed.*` = anrop till embeddings.js (Transformers.js eller API)
> `pdf.*` = anrop till pdf-extract.js (pdf.js)
> `svc.*` = lokal service-funktion (logik som flyttas till JS)
> ❌ = tas bort, finns inte i browser-versionen

### Auth (`/api/v1/auth/*`)

| Endpoint                  | Metod | Ersätts med                                      |
|---------------------------|-------|--------------------------------------------------|
| `/auth/register`          | POST  | ❌ Ingen registrering (single-user)              |
| `/auth/login`             | POST  | ❌ Ingen inloggning (eller lokal PIN i settings) |
| `/auth/logout`            | POST  | ❌                                               |
| `/auth/me`                | GET   | `db.profile.get()`                               |

### Sökprofil (`/api/v1/sokprofil/`)

| Endpoint        | Metod | Ersätts med              |
|-----------------|-------|--------------------------|
| `/sokprofil/`   | GET   | `db.profile.get()`       |
| `/sokprofil/`   | PUT   | `db.profile.save(data)`  |

### Kompetens (`/api/v1/competence/*`)

| Endpoint                                         | Metod  | Ersätts med                                              |
|--------------------------------------------------|--------|----------------------------------------------------------|
| `/competence/stats`                              | GET    | `db.skills.stats()` + `db.experiences.list().length` etc.|
| `/competence/skills`                             | GET    | `db.skills.list()`                                       |
| `/competence/skills`                             | POST   | `db.skills.add(data)`                                    |
| `/competence/skills/{id}`                        | PUT    | `db.skills.update(id, data)`                             |
| `/competence/skills/{id}`                        | DELETE | `db.skills.delete(id)`                                   |
| `/competence/experiences`                        | GET    | `db.experiences.list()`                                  |
| `/competence/experiences`                        | POST   | `db.experiences.add(data)`                               |
| `/competence/experiences/{id}`                   | PUT    | `db.experiences.update(id, data)`                        |
| `/competence/experiences/{id}`                   | DELETE | `db.experiences.delete(id)`                              |
| `/competence/experiences/{id}/achievements`      | POST   | `db.experiences.addAchievement(id, text)`                |
| `/competence/experiences/{id}/achievements/{i}`  | PUT    | `db.experiences.updateAchievement(id, i, text)`          |
| `/competence/experiences/{id}/achievements/{i}`  | DELETE | `db.experiences.deleteAchievement(id, i)`                |
| `/competence/experiences/{id}/achievements`      | PUT    | `db.experiences.replaceAchievements(id, list)`           |
| `/competence/experiences/{id}/improve-achievements` | POST | `ai.improveAchievements(exp)` + `db.experiences.replaceAchievements()` |
| `/competence/experiences/{id}/description`       | PUT    | `db.experiences.updateDescription(id, text)`             |
| `/competence/experiences/{id}/period`            | PUT    | `db.experiences.updatePeriod(id, data)`                  |
| `/competence/experiences/{id}/skills`            | POST   | `db.experiences.addSkill(id, name)`                      |
| `/competence/experiences/{id}/skills/{i}`        | DELETE | `db.experiences.removeSkill(id, i)`                      |
| `/competence/experiences/merge`                  | POST   | `ai.mergeExperiences(ids, exps)` + `db.experiences.*`    |
| `/competence/match-job`                          | POST   | `ai.matchJob(jobDesc, skills, exps, profile)`            |
| `/competence/generate-cv`                        | POST   | `ai.generateCV(jobDesc, exps, skills)`                   |
| `/competence/generate-loghouse-cv`               | POST   | `ai.generateLogHouseCV(jobDesc, exps, skills, profile, answers, edu, cvTexts)` |
| `/competence/improvement-tips`                   | POST   | `ai.improvementTips(jobDesc, score, skills, missing, exps)` |
| `/competence/fetch-job-url`                      | POST   | `fetch(url)` direkt från browser + BS4-liknande JS-parser |
| `/competence/merge/{cv_id}`                      | POST   | `svc.mergeCVIntoBank(cv, db)`                            |
| `/competence/merge-all`                          | POST   | `svc.mergeAllCVs(db)`                                    |
| `/competence/reset`                              | DELETE | `db.skills.deleteAll()` + `db.experiences.deleteAll()`   |
| `/competence/education`                          | GET    | `db.education.list()`                                    |
| `/competence/education`                          | POST   | `db.education.add(data)`                                 |
| `/competence/education/{id}`                     | PUT    | `db.education.update(id, data)`                          |
| `/competence/education/{id}`                     | DELETE | `db.education.delete(id)`                                |
| `/competence/certifications`                     | GET    | `db.certifications.list()`                               |
| `/competence/certifications`                     | POST   | `db.certifications.add(data)`                            |
| `/competence/certifications/{id}`                | PUT    | `db.certifications.update(id, data)`                     |
| `/competence/certifications/{id}`                | DELETE | `db.certifications.delete(id)`                           |

### CV (`/api/v1/cv/*`)

| Endpoint          | Metod  | Ersätts med                                                       |
|-------------------|--------|-------------------------------------------------------------------|
| `/cv/upload`      | POST   | `pdf.extractText(file)` → `ai.structureCV(text)` → `db.cvs.add()` → `svc.mergeCVIntoBank()` |
| `/cv/`            | GET    | `db.cvs.list()`                                                   |
| `/cv/{id}`        | DELETE | `db.cvs.delete(id)`                                               |
| `/cv/{id}/title`  | PUT    | `db.cvs.updateTitle(id, title)`                                   |

### Personlighet (`/api/v1/personality/*`)

| Endpoint                              | Metod  | Ersätts med                                                    |
|---------------------------------------|--------|----------------------------------------------------------------|
| `/personality/questions`              | GET    | `db.pq.list()`                                                 |
| `/personality/questions`              | POST   | `db.pq.add(data)` + `embed.generate(text)` → spara embedding  |
| `/personality/questions/{id}`         | PUT    | `db.pq.update(id, data)` + ny embedding                       |
| `/personality/questions/{id}`         | DELETE | `db.pq.delete(id)`                                             |
| `/personality/questions/extract`      | POST   | `ai.extractPersonalityQuestions(mdText)`                       |
| `/personality/questions/check-similar`| POST   | `embed.checkSimilar(text, db.pq.list(), threshold)`            |
| `/personality/questions/backfill-embeddings` | POST | `embed.backfill(db.pq.list())` → uppdatera varje post         |
| `/personality/questions/import`       | POST   | `ai.extractPersonalityQuestions()` + loop av `db.pq.add()`    |
| `/personality/answers`                | GET    | `db.pa.list()`                                                 |
| `/personality/answers`                | POST   | `db.pa.upsert(questionId, data)` + embedding                  |
| `/personality/answers/{id}`           | PUT    | `db.pa.upsert(questionId, data)` (upsert hanterar båda)        |
| `/personality/answers/next`           | GET    | `db.pa.nextUnanswered(skipIds)`                                |
| `/personality/answers/big-five`       | GET    | `db.pa.bigFiveScores()`                                        |
| `/personality/description`            | POST   | `ai.generatePersonalityDescription(answers, profile, skills, exps, cvTexts)` |

### Sökprofiler (`/api/v1/profiles/*`)

| Endpoint                      | Metod  | Ersätts med                            |
|-------------------------------|--------|----------------------------------------|
| `/profiles/`                  | GET    | `db.searchProfiles.list()`             |
| `/profiles/`                  | POST   | `db.searchProfiles.add(data)`          |
| `/profiles/{id}`              | GET    | `db.searchProfiles.get(id)`            |
| `/profiles/{id}`              | PUT    | `db.searchProfiles.update(id, data)`   |
| `/profiles/{id}/job`          | PUT    | `db.searchProfiles.saveJob(id, jobAd)` |
| `/profiles/{id}/results`      | PUT    | `db.searchProfiles.saveResult(id, r)`  |
| `/profiles/{id}`              | DELETE | `db.searchProfiles.delete(id)`         |

### Kandidater (`/api/v1/kandidater/*`)

| Endpoint                | Ersätts med                                                     |
|-------------------------|-----------------------------------------------------------------|
| Alla kandidat-endpoints | ❌ Multi-user feature — tas bort eller ersätts med enkel lokal kandidathantering i en senare fas. |

---

## 4. Filer som skapas / ändras

### Nya filer

```
frontend/js/db.js              IndexedDB-wrapper (se kontrakt ovan)
frontend/js/ai.js              AI-abstraktionslager (OpenAI/Ollama/Gemini/Anthropic)
frontend/js/embeddings.js      Transformers.js + cosineSimilarity()
frontend/js/pdf-extract.js     pdf.js-wrapper
frontend/js/competence-svc.js  Portat från backend: mergeCVIntoBank, mergeAllCVs
frontend/js/db-seed.sql        Engångsskript: exportera PostgreSQL → JSON för import
```

### Modifierade filer (i prioritetsordning)

```
frontend/js/app-state.js       apiFetch() ersätts med db.* / ai.* dispatcher
frontend/js/app-bank.js        alla apiFetch → db.experiences.*, db.skills.*
frontend/js/app-cv.js          upload: pdf.extract + ai.structureCV + db.cvs.add
frontend/js/app-match.js       ai.matchJob, ai.generateCV, ai.generateLogHouseCV
frontend/js/app-sokprofil.js   db.profile.*, db.education.*, db.certifications.*
frontend/js/app-personality.js db.pq.*, db.pa.*, ai.extractQuestions, embed.*
frontend/js/app-account.js     db.settings.* (API-nyckel-inställningar)
frontend/index.html            Ta bort login-vy, lägg till settings-panel för API-nycklar
```

---

## 5. Knepiga punkter att lösa tidigt

### fetch-job-url (jobbannons från URL)
Backend använder BeautifulSoup för att rensa HTML. I browser:
```javascript
// Enklast: använd en CORS-proxy eller DOMParser
const res = await fetch(url);
const html = await res.text();
const doc = new DOMParser().parseFromString(html, 'text/html');
['script','style','nav','header','footer'].forEach(t => doc.querySelectorAll(t).forEach(e => e.remove()));
return doc.body.innerText.trim();
```
OBS: Många jobbsidor blockerar CORS. Lösning: användaren klistrar in texten manuellt (nuvarande UX) eller proxy.

### Competence merge-logik (svc.mergeCVIntoBank)
Backend har komplex dedup-logik. Portning till JS är rak men tidskrävande.
Prioritera: enkel version först (lägg till allt, visa duplikater i UI).

### Embeddings — dimensionsskillnad
- Backend: OpenAI `text-embedding-3-small` → 1536 dimensioner
- Transformers.js `all-MiniLM-L6-v2` → 384 dimensioner
- Befintliga embeddings i exporterad data är **inkompatibla** med lokala
- Lösning: backfill körs automatiskt vid första start om embedding saknas

### Ingen auth alls vs. lokal PIN
Enklast: öppna direkt utan login.
Om man vill ha lite skydd: `settings.get('pin_hash')` + bcrypt.js (15 KB).

---

## 6. Migreringsordning (rekommenderad)

```
1. db.js + db.init() + alla stores     ← grunden allt vilar på
2. db.profile + db.settings            ← minsta möjliga, verifiera att data sparas
3. db.skills + db.experiences          ← kompetensbanken fungerar utan AI
4. db.cvs + pdf-extract.js             ← CV-uppladdning fungerar
5. ai.js (OpenAI-provider)             ← matchning + generering fungerar
6. embeddings.js (Transformers.js)     ← duplikatkontroll utan API-nyckel
7. db.pq + db.pa                       ← personlighetsdelen fungerar
8. db.education + db.certifications    ← komplett profil
9. db.searchProfiles                   ← sökprofiler
10. competence-svc.js (merge-logik)    ← auto-merge vid CV-uppladdning
11. db-seed + migrationsverktyg        ← flytta befintlig data från PostgreSQL
```

---

*Skapad: 2026-05-21. Uppdatera när beslut ändras.*
