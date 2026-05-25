/**
 * ai.js — AI-abstraktionslager för CV Optimizer (browser-only)
 * Stöder: OpenAI, Anthropic (Claude), Gemini, Ollama
 * Konfigureras via db.settings (ai_provider, *_key, ollama_url, ollama_model)
 */

// ─── Provider-routing ─────────────────────────────────────────────────────────

async function _getConfig() {
  const s = await cvDb.settings.getAll();
  return {
    provider: s.ai_provider || 'openai',
    openaiKey: s.openai_key || '',
    anthropicKey: s.anthropic_key || '',
    geminiKey: s.gemini_key || '',
    ollamaUrl: s.ollama_url || 'http://localhost:11434',
    ollamaModel: s.ollama_model || 'llama3',
  };
}

/**
 * Skicka ett chat-anrop till konfigurerad provider.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} opts - { temperature, jsonMode }
 * @returns {string} - svarstext från modellen
 */
async function _chat(systemPrompt, userPrompt, { temperature = 0.3, jsonMode = false } = {}) {
  const cfg = await _getConfig();

  switch (cfg.provider) {
    case 'openai':     return _chatOpenAI(cfg.openaiKey, systemPrompt, userPrompt, temperature, jsonMode);
    case 'anthropic':  return _chatAnthropic(cfg.anthropicKey, systemPrompt, userPrompt, temperature);
    case 'gemini':     return _chatGemini(cfg.geminiKey, systemPrompt, userPrompt, temperature);
    case 'ollama':     return _chatOllama(cfg.ollamaUrl, cfg.ollamaModel, systemPrompt, userPrompt, temperature);
    default:           throw new Error(`Okänd AI-provider: ${cfg.provider}`);
  }
}

async function _chatOpenAI(apiKey, systemPrompt, userPrompt, temperature, jsonMode) {
  if (!apiKey) throw new Error('OpenAI API-nyckel saknas. Ange den under Inställningar.');

  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI-fel ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function _chatAnthropic(apiKey, systemPrompt, userPrompt, temperature) {
  if (!apiKey) throw new Error('Anthropic API-nyckel saknas. Ange den under Inställningar.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic-fel ${res.status}: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

async function _chatGemini(apiKey, systemPrompt, userPrompt, temperature) {
  if (!apiKey) throw new Error('Gemini API-nyckel saknas. Ange den under Inställningar.');

  const model = 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini-fel ${res.status}: ${JSON.stringify(err?.error || res.statusText)}`);
  }

  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function _chatOllama(baseUrl, model, systemPrompt, userPrompt, temperature) {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: { temperature },
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama-fel ${res.status}: ${res.statusText}. Kör Ollama lokalt?`);
  }

  const data = await res.json();
  return data.message.content;
}

/** Kör _chat och parsa svaret som JSON. */
async function _chatJSON(systemPrompt, userPrompt, opts = {}) {
  const text = await _chat(systemPrompt, userPrompt, { ...opts, jsonMode: true });
  try {
    // Ollama/Gemini/Anthropic kan returnera markdown-kodblock — strip
    const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`AI returnerade ogiltig JSON: ${text.slice(0, 200)}`);
  }
}

// ─── Publika AI-funktioner ────────────────────────────────────────────────────

/**
 * Strukturera CV-text till JSON.
 */
async function structureCV(cvText) {
  const system = `Du är en expert på att extrahera strukturerad information från CV:n.
Analysera CV-texten och extrahera all relevant information i följande JSON-format:

{
  "personal_info": {
    "full_name": "string",
    "email": "string or null",
    "phone": "string or null",
    "location": "string or null",
    "linkedin": "string or null"
  },
  "summary": "string or null",
  "work_experience": [
    {
      "company": "string",
      "position": "string",
      "start_date": "string or null",
      "end_date": "string or null",
      "current": false,
      "description": "string or null",
      "achievements": [],
      "technologies": []
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string or null",
      "field_of_study": "string or null",
      "start_date": "string or null",
      "end_date": "string or null"
    }
  ],
  "skills": [],
  "certifications": [
    {
      "name": "string",
      "issuing_organization": "string or null",
      "issue_date": "string or null"
    }
  ]
}

Viktigt:
- Extrahera ALL information som finns i CV:t
- Behåll all information på originalspråket i CV:t — översätt ingenting
- Svara ENDAST med JSON, ingen extra text`;

  return _chatJSON(system, `Här är CV-texten att strukturera:\n\n${cvText}`, { temperature: 0.1 });
}

/**
 * Matcha kompetensbank mot jobbannons.
 */
async function matchJob(skills, experiences, jobTitle, jobDescription, seekerProfile = null) {
  const skillsList = skills.map(s => `- ${s.skill_name} (${s.category || 'Okategoriserad'})`).join('\n') || '(inga skills)';

  const expList = experiences.map(e =>
    `[ID:${e.id}] ${e.title}`
    + (e.organization ? ` på ${e.organization}` : '')
    + (e.start_date ? ` (${e.start_date}–${e.end_date || 'nu'})` : '')
    + (e.description ? `\nBeskrivning: ${e.description}` : '')
    + (e.achievements?.length ? '\nPrestationer:\n' + e.achievements.map(a => `- ${a}`).join('\n') : '')
  ).join('\n\n') || '(inga erfarenheter)';

  const system = `Du är en expert på rekrytering och kompetensanalys.
Du får en lista med skills och erfarenheter från en persons kompetensbank, samt en jobbannons.
Din uppgift är att analysera hur väl kompetenserna matchar jobbet OCH hur väl jobbets villkor matchar personens preferenser.

Svara ENDAST med JSON i exakt detta format:
{
  "overall_score": <0-100>,
  "summary": "<2-3 meningar om matchningen totalt sett, inkl. hur villkor stämmer med preferenser>",
  "job_info": {
    "city": "<ort där jobbet är, eller null om okänt>",
    "employment_type": "<Heltid|Deltid|null>",
    "duration": "<Tillsvidare|Tidsbegränsat|null>",
    "workplace": "<På plats|Hybrid|Distans|null>",
    "domain": "<jobbets bransch/domän, t.ex. 'IT & Data', 'Vård & omsorg', 'Finans & bank' — välj det som passar bäst, eller null>"
  },
  "profile_fit": [
    {
      "aspect": "<t.ex. Ort, Anställningsform, Varaktighet, Arbetsplats>",
      "job_value": "<vad jobbet erbjuder, eller 'Ej angiven'>",
      "preference": "<personens önskemål, eller 'Ej angiven'>",
      "match": true/false/null,
      "note": "<kort notering vid avvikelse, annars tom sträng>"
    }
  ],
  "skills": [
    {"skill_name": "<namn>", "score": <1-100>, "reason": "<kort förklaring>"}
  ],
  "experiences": [
    {"id": <id>, "score": <1-100>, "reason": "<kort förklaring varför erfarenheten är relevant>"}
  ],
  "missing_skills": ["<skill som nämns i annonsen men saknas i kompetensbanken>"]
}

Regler:
- Extrahera alltid job_info från annonsen. Sätt null om informationen saknas.
- Bygg profile_fit ENDAST om personens preferenser skickas med.
- overall_score ska påverkas av hur väl jobbvillkoren stämmer med preferenserna.
- Om jobbets domän finns i icke-önskade domäner: sätt match=false och sänk overall_score med minst 20 poäng.
- Inkludera ENDAST skills och erfarenheter som är relevanta för jobbet (score >= 25).
- Sortera skills och experiences med högst poäng först.`;

  let seekerSection = '';
  if (seekerProfile) {
    const parts = [];
    if (seekerProfile.roles) parts.push(`Önskade roller: ${seekerProfile.roles}`);
    if (seekerProfile.desired_city) parts.push(`Önskad ort: ${seekerProfile.desired_city}`);
    if (seekerProfile.desired_employment?.length) parts.push(`Önskad anställningsform: ${seekerProfile.desired_employment.join(', ')}`);
    if (seekerProfile.desired_workplace?.length) parts.push(`Önskad arbetsplats: ${seekerProfile.desired_workplace.join(', ')}`);
    if (seekerProfile.desired_domains?.length) parts.push(`Önskade domäner: ${seekerProfile.desired_domains.join(', ')}`);
    if (seekerProfile.unwanted_domains?.length) parts.push(`Icke-önskade domäner: ${seekerProfile.unwanted_domains.join(', ')}`);
    if (seekerProfile.willing_to_commute) parts.push('Resbar: Ja');
    if (parts.length) seekerSection = '\n---\nPersonens preferenser:\n' + parts.join('\n');
  }

  const user = `Jobbannons:\nTitel: ${jobTitle}\n\n${jobDescription}\n\n---\nPersonens skills:\n${skillsList}\n\nPersonens erfarenheter:\n${expList}${seekerSection}`;

  return _chatJSON(system, user, { temperature: 0.2 });
}

/**
 * Generera anpassat CV-utkast.
 */
async function generateCV(jobDescription, experiences, skills) {
  const expText = experiences.map(e =>
    `[ID:${e.id}] ${e.title}`
    + (e.organization ? ` på ${e.organization}` : '')
    + (e.start_date ? ` (${e.start_date}–${e.end_date || 'nu'})` : '')
    + (e.description ? `\nBeskrivning: ${e.description}` : '')
    + (e.achievements?.length ? '\nPrestationer:\n' + e.achievements.map(a => `- ${a}`).join('\n') : '')
  ).join('\n\n') || '(inga erfarenheter)';

  const skillsText = skills.join(', ') || '(inga)';

  const system = `Du är en expert på CV-skrivning och rekrytering.
Skapa ett anpassat CV-utkast för en specifik jobbannons baserat på personens erfarenheter.

Svara ENDAST med JSON i exakt detta format:
{
  "pitch": "<3-5 meningar som profil/sammanfattning. Förklara varför kandidaten passar jobbet. Skriv utan personliga pronomen, som en CV-profil.>",
  "experiences": [
    {
      "id": <id>,
      "highlighted_achievements": ["<prestation 1>", "<prestation 2>"]
    }
  ]
}

Regler:
- Inkludera bara erfarenheter som är relevanta för jobbet
- Max 4 prestationer per erfarenhet – välj de mest relevanta och jobbspecifika
- Du får omformulera prestationer för att bättre matcha jobbannonsens nyckelord, men ljug aldrig
- Sortera erfarenheterna med mest relevanta först`;

  const user = `Jobbannons:\n${jobDescription}\n\n---\nPersonens erfarenheter:\n${expText}\n\nPersonens skills: ${skillsText}`;

  return _chatJSON(system, user, { temperature: 0.3 });
}

/**
 * Generera Log House-formaterat CV.
 */
async function generateLogHouseCV(jobDescription, experiences, skills, profile, personalityAnswers, educationList, cvTexts) {
  const expText = experiences.map(e =>
    `[${e.title}]`
    + (e.organization ? ` på ${e.organization}` : '')
    + (e.start_date ? ` (${e.start_date}–${e.end_date || 'nu'})` : '')
    + (e.description ? `\nBeskrivning: ${e.description}` : '')
    + (e.achievements?.length ? '\nPrestationer:\n' + e.achievements.map(a => `- ${a}`).join('\n') : '')
  ).join('\n\n') || '(inga erfarenheter)';

  const skillsText = skills.map(s => typeof s === 'string' ? s : s.skill_name).join(', ') || '(inga)';

  const answersText = personalityAnswers
    .filter(a => a.answer)
    .map(a => `- [${a.category || ''}] ${a.question}: ${a.answer}`)
    .join('\n') || '(inga svar)';

  const eduText = educationList.map(e =>
    `- ${e.start_date || ''}–${e.end_date || ''} ${e.degree || ''} ${e.institution || ''}`
  ).join('\n') || '(ingen utbildning)';

  const name = profile?.public_name || profile?.full_name || '';
  const cvExcerpt = cvTexts?.[0]?.slice(0, 2000) || '';

  const system = `Du är en expert på CV-skrivning för konsultbranschen, specialiserad på Log House-mallen.
Du skapar ett professionellt CV-utkast anpassat till en specifik jobbannons.

Svara ENBART med JSON i exakt detta format:
{
  "page_1": {
    "ingress": [
      "<stycke 1: positionering och kärnvärde, 3-4 meningar, tredje person>",
      "<stycke 2: arbetssätt och drivkraft, 3-4 meningar>",
      "<stycke 3: tydlig avgränsning/USP, 2-3 meningar>"
    ],
    "kompetenser": [
      {"rubrik": "<1-3 ord>", "beskrivning": "<40-70 ord, löptext, konkret>"},
      {"rubrik": "<1-3 ord>", "beskrivning": "<40-70 ord>"},
      {"rubrik": "<1-3 ord>", "beskrivning": "<40-70 ord>"}
    ]
  },
  "page_2": {
    "branscher": "<kommaseparerade branscher kandidaten har erfarenhet av>",
    "sammanfattning": [
      {"rubrik": "<kompetensrubrik från sida 1>", "text": "<40-80 ord, narrativt, tredje person>"},
      {"rubrik": "<kompetensrubrik>", "text": "<40-80 ord>"},
      {"rubrik": "<kompetensrubrik>", "text": "<40-80 ord>"}
    ],
    "verktyg": [
      {"kategori": "Samarbete", "items": ["<verktyg>"]},
      {"kategori": "Dokumentation", "items": ["<verktyg>"]},
      {"kategori": "Processer och standarder", "items": ["<ramverk>"]}
    ],
    "uppdrag": [
      {
        "rubrik": "<BOLAGSNAMN – ROLLTITEL – PERIOD (versaler)>",
        "punkter": ["<aktivitet med verb>", "<aktivitet>", "<aktivitet>"]
      }
    ],
    "utbildning": [
      {"period": "<årtalet eller period>", "utbildning": "<namn>", "anordnare": "<institution>"}
    ]
  }
}

Regler:
- Skriv alltid i tredje person (undvik "jag/du" — använd förnamnet eller "kandidaten")
- Anpassa innehållet till jobbannonsens krav utan att hitta på fakta
- Max 3 kompetenser, välj de mest relevanta för jobbet
- Uppdragslistan: nyaste uppdrag först, max 5 uppdrag, 3-5 bullet points per uppdrag
- Alla texter på svenska`;

  const user = `Kandidat: ${name}\n\nJobbannons:\n${jobDescription.slice(0, 3000)}\n\n---\nErfarenheter:\n${expText}\n\nSkills: ${skillsText}\n\nUtbildning:\n${eduText}\n\nPersonlighetssvar (urval):\n${answersText.slice(0, 1500)}${cvExcerpt ? `\n\nCV-text (utdrag):\n${cvExcerpt}` : ''}`;

  return _chatJSON(system, user, { temperature: 0.4 });
}

/**
 * Generera CV-utkast enligt personligt CV-format med alla sektioner.
 */
async function generateHenrikCV(jobDescription, experiences, skills, profile, educationList, certificationList) {
  const expText = experiences.map(e =>
    `[ID:${e.id}] ${e.title}`
    + (e.organization ? ` på ${e.organization}` : '')
    + (e.city ? `, ${e.city}` : '')
    + (e.start_date ? ` (${e.start_date}–${e.is_current ? 'nu' : (e.end_date || '')})` : '')
    + (e.description ? `\nBeskrivning: ${e.description}` : '')
    + (e.achievements?.length ? '\nPrestationer:\n' + e.achievements.map(a => `- ${a}`).join('\n') : '')
  ).join('\n\n') || '(inga erfarenheter)';

  const skillsText = skills.map(s => typeof s === 'string' ? s : s.skill_name).join(', ') || '(inga)';

  const eduText = educationList.map(e =>
    `- ${e.institution || ''}${e.city ? ', ' + e.city : ''}, ${e.degree || ''}${e.field_of_study ? ' i ' + e.field_of_study : ''}${e.start_date ? ' (' + e.start_date + (e.end_date ? '–' + e.end_date : '') + ')' : ''}`
  ).join('\n') || '(ingen utbildning)';

  const certText = certificationList.map(c =>
    `- ${c.name || c.certification_name || ''}${c.issuer ? ', ' + c.issuer : ''}${c.date ? ' (' + c.date.slice(0,4) + ')' : ''}`
  ).join('\n') || '(inga certifieringar)';

  const name = profile?.public_name || profile?.full_name || 'Kandidaten';
  const email = profile?.email || '';
  const phone = profile?.phone || '';
  const city  = profile?.city || profile?.address || '';

  const system = `Du är en expert på CV-skrivning och skapar ett professionellt CV-utkast anpassat till en specifik jobbannons.

Svara ENBART med JSON i exakt detta format:
{
  "profile_heading": "<varierat per ansökan, t.ex. 'Min profil', 'Varför jag?', 'Om mig'>",
  "profile_text": "<3 stycken, 105–120 ord totalt. Stycke 1–2 i tredjeperson med 'Kandidaten' som subjekt, sista stycket kan glida mot förstaperson. Ärlig, jordnära ton utan floskler. Anpassad till rollen.>",
  "expertise": [
    {
      "subheading": "<logisk kompetensgrupp, 1–4 ord>",
      "bullets": ["<konkret punkt, max 2 rader>", "<punkt>"]
    }
  ],
  "experience": [
    {
      "heading_line": "<Roll, Företag, Ort, Period>",
      "description": "<3–8 meningar löptext, konkret, faktabaserat, lyfter det som matchar jobbet>"
    }
  ],
  "education": ["<Institution, Ort, Examen/Program (år)>"],
  "training": ["<Kurs/Certifiering (år)>"],
  "technical_skills": [
    {"category": "<kategori>", "items": ["<item>", "<item>"]}
  ],
  "personality": ["<egenskap med konkret förklaring, max 2 meningar>"],
  "languages": ["<språk, nivå>"],
  "personal_keywords": ["<ledord>"]
}

Regler:
- expertise: 2–4 undergrupper, 2–4 bullets var – hämta ENBART från erfarenhets- och kompetensdatabasen, hitta inget på
- experience: nyaste först, max 6 poster, lyfta det som matchar jobbannonsen
- technical_skills: 3–5 kategorier, välj de som är relevanta för rollen
- personality: 3–6 bullets
- personal_keywords: 4–8 ledord som sammanfattar kandidatens värderingar och sätt att arbeta
- languages: basera på vad som framgår av databasen och CV-texten, lägg alltid till svenska om det inte explicit saknas
- profile_text EXAKT 105–120 ord – räkna noga
- Allt på svenska`;

  const user = `Kandidat: ${name}${email ? ' | ' + email : ''}${phone ? ' | ' + phone : ''}${city ? ' | ' + city : ''}

Jobbannons:
${jobDescription.slice(0, 3000)}

---
Erfarenheter:
${expText}

Skills: ${skillsText}

Utbildning:
${eduText}

Certifieringar/kurser:
${certText}`;

  return _chatJSON(system, user, { temperature: 0.4 });
}

/**
 * Generera förbättringstips.
 */
async function improvementTips(jobDescription, overallScore, currentSkills, missingSkills, experiences) {
  const skillsText = currentSkills.join(', ') || '(inga)';
  const missingText = missingSkills.join(', ') || '(inga)';

  const expText = experiences.map(e =>
    `- ${e.title}`
    + (e.organization ? ` på ${e.organization}` : '')
    + (e.description ? `\n  Beskrivning: ${e.description}` : '')
    + (e.achievements?.length ? '\n  Prestationer:\n' + e.achievements.map(a => `  • ${a}`).join('\n') : '')
  ).join('\n\n') || '(inga erfarenheter)';

  const system = `Du är en expert på rekrytering och CV-optimering.
En person har sökt ett jobb och fått matchningspoängen ${overallScore}/100.
Din uppgift är att ge konkreta förslag på hur de kan höja sin matchningspoäng.

Svara EXAKT med JSON i detta format:
{
  "pitch": "<2-4 meningar som säljer kandidaten till arbetsgivaren. Lyft fram kandidatens starkaste kompetenser, erfarenheter och prestationer som är relevanta för just detta jobb. Formulera det som om du presenterar kandidaten för en rekryterare — engagerande och konkret.>",
  "suggested_skills": [
    {"skill_name": "<namn>", "category": "<kategori>", "reason": "<varför detta ökar matchningen>"}
  ],
  "tips": [
    {"tip": "<konkret, handlingsorienterat förbättringstips>", "impact": "high|medium|low"}
  ]
}

Regler:
- suggested_skills: max 6 skills som direkt ökar matchningen. Föreslå INTE skills som redan finns.
- tips: max 6 konkreta tips. Sortera med högst impact först.
- Svara på svenska.`;

  const user = `Jobbannons:\n${jobDescription}\n\n---\nPersonens nuvarande skills: ${skillsText}\nSkills som saknas: ${missingText}\n\nPersonens matchande erfarenheter:\n${expText}`;

  return _chatJSON(system, user, { temperature: 0.4 });
}

/**
 * Extrahera personlighetsfrågor från Markdown-text.
 */
async function extractPersonalityQuestions(mdContent) {
  const system = `Du är en psykologiexpert med djup kunskap om Big Five-modellen (OCEAN).
Du får ett Markdown-dokument med personlighetsfrågor i fri form.

Din uppgift är att extrahera VARJE fråga ur dokumentet och returnera dem som strukturerad JSON.

För varje fråga, identifiera:
- question_text: Själva frågan (obligatorisk)
- context: Bakgrund eller förtydligande till frågan, om det finns (annars null)
- category: Övergripande tema/kategori för frågan (annars null)
- big_five_trait: Vilken Big Five-dimension frågan primärt mäter: O/C/E/A/N. Null om oklart.
- big_five_dir: +1 om ett högt svar (5 på Likert) indikerar HÖG trait-nivå, -1 om låg. Null om trait är null.

Svara ENBART med JSON:
{
  "questions": [
    {
      "question_text": "...",
      "context": "..." eller null,
      "category": "..." eller null,
      "big_five_trait": "O"/"C"/"E"/"A"/"N"/null,
      "big_five_dir": 1/-1/null
    }
  ]
}

Extrahera ALLA frågor — missa ingen. Bevara originalspråket.`;

  const result = await _chatJSON(system, `Här är dokumentet:\n\n${mdContent}`, { temperature: 0.1 });
  return result.questions || [];
}

/**
 * Generera personlighetsbeskrivning i Markdown.
 */
async function generatePersonalityDescription(answers, profile, skills, experiences, cvTexts, name = 'Kandidat') {
  const byCategory = {};
  for (const a of answers) {
    const cat = a.category || 'Övrigt';
    (byCategory[cat] = byCategory[cat] || []).push(a);
  }

  let answersText = '';
  for (const [cat, items] of Object.entries(byCategory)) {
    answersText += `\n**${cat}**\n`;
    for (const a of items) {
      let line = `- F: ${a.question || ''}`;
      if (a.context) line += `  [${a.context}]`;
      line += `\n  S: ${a.answer || ''}`;
      if (a.likert) line += ` (Likert ${a.likert}/5)`;
      if (a.big_five) line += ` [Big Five: ${a.big_five}]`;
      answersText += line + '\n';
    }
  }

  const profParts = [];
  if (profile?.roles) profParts.push(`Roller/titlar: ${profile.roles}`);
  if (profile?.description) profParts.push(`Profilbeskrivning: ${profile.description}`);
  if (profile?.desired_city) profParts.push(`Önskad ort: ${profile.desired_city}`);
  if (skills?.length) profParts.push(`Skills: ${skills.slice(0, 25).map(s => s.skill_name || s).join(', ')}`);
  if (experiences?.length) {
    const expLines = experiences.slice(0, 6).map(e => `- ${e.title}${e.organization ? ` på ${e.organization}` : ''}`).join('\n');
    profParts.push(`Erfarenheter:\n${expLines}`);
  }

  const profText = profParts.join('\n') || '(ingen profil tillgänglig)';
  const cvSection = cvTexts?.[0] ? `\n\nCV-text (utdrag ur senaste CV):\n${cvTexts[0].slice(0, 2500)}` : '';

  const system = `Du är en erfaren HR-konsult och organisationspsykolog.
Din uppgift är att skriva en professionell, välgrundad personlighetsbeskrivning i Markdown-format.

Riktlinjer:
- Skriv i tredje person: "Personen visar…", "Kandidaten tenderar att…"
- Basera dig STRIKT på de faktiska svaren — inga spekulationer
- Om Big Five-data finns, inkludera en kort Big Five-sektion
- Skriv på svenska

Markdown-struktur:
# Personlighetsbeskrivning
## Personlighetsprofil
## Arbetslivsstil och arbetssätt
## Interpersonella egenskaper
## Motivation och drivkrafter
## Sammanfattning

Svara ENBART med Markdown-texten — ingen förklaring, ingen inledning.`;

  const user = `Kandidat: ${name}\n\nPersonlighetssvar:\n${answersText}\n---\nProfessionell bakgrund:\n${profText}${cvSection}`;

  return _chat(system, user, { temperature: 0.5 });
}

/**
 * Slå ihop erfarenheter med AI.
 */
async function mergeExperiences(expList) {
  const expText = expList.map(e =>
    `Titel: ${e.title}`
    + (e.organization ? `\nArbetsgivare: ${e.organization}` : '')
    + `\nPeriod: ${e.start_date || ''}–${e.end_date || (e.is_current ? 'nu' : '')}`
    + (e.description ? `\nBeskrivning: ${e.description}` : '')
    + (e.achievements?.length ? '\nPrestationer:\n' + e.achievements.map(a => `- ${a}`).join('\n') : '')
  ).join('\n\n---\n');

  const system = `Du är en expert på CV-skrivning.
Du får flera versioner av samma tjänst från olika CV:n (olika vinklingar mot olika jobb).
Din uppgift är att slå ihop dem till en sammanhållen, informationsrik erfarenhetspost.

Svara ENBART med JSON:
{
  "title": "<sammanslagna titlar om de skiljer sig, annars den gemensamma titeln>",
  "organization": "<arbetsgivaren – välj den mest fullständiga varianten>",
  "start_date": "<ÅÅÅÅ-MM, välj det tidigaste om de skiljer sig>",
  "end_date": "<ÅÅÅÅ-MM, välj det senaste om de skiljer sig, null om pågående>",
  "is_current": true/false,
  "description": "<sammanslagen beskrivning, 3-6 meningar, fånga alla perspektiv>",
  "achievements": ["<prestation 1>", "<prestation 2>"]
}

Regler:
- Om titlarna är olika, konkatenera med " / " (t.ex. "Projektledare / Agil Coach")
- Beskrivningen ska fånga de olika vinklingarna utan att upprepa sig
- Prestationer: kombinera alla unika prestationer, ta bort exakta duplikat
- Sortera prestationer med de mest konkreta och mätbara först
- Bevara originalspråket (svenska)`;

  return _chatJSON(system, `Slå ihop dessa erfarenheter:\n\n${expText}`, { temperature: 0.2 });
}

/**
 * Förbättra prestationer i en erfarenhet.
 */
async function improveAchievements(achievements, title = '', organization = '') {
  let context = title ? ` för rollen ${title}` : '';
  if (organization) context += ` på ${organization}`;

  const items = achievements.map(a => `- ${a}`).join('\n');

  const system = `Du är en expert på CV-skrivning.
Du får en lista med prestationer från en erfarenhet i ett CV.
Din uppgift är att:
1. Ta bort exakta och nära duplikat (behåll den bästa versionen)
2. Förbättra formuleringarna så att de är tydliga, konkreta och slagkraftiga
3. Behålla alla unika prestationer – lägg inte till nya

Svara EXAKT med JSON:
{"achievements": ["<prestation 1>", "<prestation 2>"]}

Svara på samma språk som prestationerna är skrivna på.`;

  const result = await _chatJSON(system, `Erfarenhet${context}:\n\n${items}`, { temperature: 0.2 });
  return result.achievements || achievements;
}

/**
 * Hämta jobbannontext från URL (med enkel HTML-rensning).
 * OBS: Många jobbsidor blockerar CORS – klistra in texten manuellt är fallback.
 */
async function fetchJobUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kunde inte hämta URL (${res.status})`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  ['script', 'style', 'nav', 'header', 'footer', 'aside'].forEach(
    tag => doc.querySelectorAll(tag).forEach(el => el.remove())
  );
  return doc.body?.innerText?.trim() || '';
}

window.cvAI = {
  structureCV,
  matchJob,
  generateCV,
  generateLogHouseCV,
  generateHenrikCV,
  improvementTips,
  extractPersonalityQuestions,
  generatePersonalityDescription,
  mergeExperiences,
  improveAchievements,
  fetchJobUrl,
};
