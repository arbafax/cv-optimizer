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
  if (!apiKey) throw new Error('API-nyckel och AI-leverantör saknas. Ange den under <a href="#" class="text-link" onclick="goToAccount();return false">Inställningar</a>.');

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
  if (!apiKey) throw new Error('API-nyckel och AI-leverantör saknas. Ange den under <a href="#" class="text-link" onclick="goToAccount();return false">Inställningar</a>.');

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
  if (!apiKey) throw new Error('API-nyckel och AI-leverantör saknas. Ange den under <a href="#" class="text-link" onclick="goToAccount();return false">Inställningar</a>.');

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
 * Analysera en jobbannons och returnera strukturerad JSON.
 */
async function analyzeJob(title, description) {
  const system = `Du är en expert på rekrytering och jobbanalys.
Analysera jobbannonsen och extrahera strukturerad information i exakt detta JSON-format:
{
  "title": "<befattning/rolltitel>",
  "required_skills": ["<obligatorisk teknisk/domänkompetens>"],
  "nice_to_have_skills": ["<meriterande teknisk/domänkompetens>"],
  "personal_qualities": ["<personlig egenskap, t.ex. 'Analytisk', 'Självgående', 'Driven'>"],
  "min_experience_years": <antal år eller null>,
  "seniority_level": "<Junior|Mid|Senior|Lead|null>",
  "required_education": "<utbildningskrav som sträng, eller null>",
  "city": "<ort eller null>",
  "employment_type": "<Heltid|Deltid|null>",
  "duration": "<Tillsvidare|Tidsbegränsat|null>",
  "workplace": "<På plats|Hybrid|Distans|null>",
  "domain": "<bransch/domän, t.ex. 'IT & Data', 'Vård & omsorg', eller null>",
  "summary": "<2-3 meningar som beskriver rollen>",
  "salary_range": "<lönespann om nämnt i annonsen, t.ex. '45 000–55 000 kr/mån', annars null>"
}

Regler:
- Skilja tydligt på tekniska/domänrelaterade kompetenser (required_skills, nice_to_have_skills) och personliga egenskaper (personal_qualities).
- personal_qualities: mjuka egenskaper och personlighetsdrag — INTE tekniska färdigheter. Tom array om inga nämns.
- Om information saknas i annonsen, sätt null eller tom array.
- required_skills och nice_to_have_skills ska vara korta kompetensnamn (ej meningar).`;

  const user = `Jobbtitel: ${title || '(ej angiven)'}\n\nJobbannons:\n${description}`;
  return _chatJSON(system, user, { temperature: 0.1 });
}

/**
 * Förklara hur en specifik obligatorisk kompetens beskrivs i jobbannonsen.
 */
async function explainRequiredSkill(skillName, jobDescription) {
  const system = `Du är en rekryteringsexpert. Din uppgift är att hitta och lyfta fram hur en specifik kompetens beskrivs i en jobbannons.
Svara i exakt detta JSON-format:
{
  "excerpt": "<Direkt citat eller nära parafras av de meningar i annonsen som nämner kompetensen. Ta med tillräckligt kontext (1-4 meningar). Om kompetensen inte nämns explicit, skriv: 'Kompetensen nämns inte explicit i annonsen.'>",
  "summary": "<1-2 meningar som sammanfattar varför/hur kompetensen krävs enligt annonsen>"
}`;
  const user = `Kompetens: ${skillName}\n\nJobbannons:\n${jobDescription}`;
  return _chatJSON(system, user, { temperature: 0.1 });
}

/**
 * Matcha kompetensbank mot strukturerad jobbannons.
 */
async function matchJobStructured(skills, experiences, structuredJob, seekerProfile = null) {
  const skillsList = skills.map(s => {
    const level = s.skill_level || 'Känner till';
    return `- ${s.skill_name} (${s.category || 'Okategoriserad'}, nivå: ${level})`;
  }).join('\n') || '(inga skills)';

  const expList = experiences.map(e =>
    `[ID:${e.id}] ${e.title}`
    + (e.organization ? ` på ${e.organization}` : '')
    + (e.start_date ? ` (${e.start_date}–${e.end_date || 'nu'})` : '')
    + (e.description ? `\nBeskrivning: ${e.description}` : '')
    + (e.achievements?.length ? '\nPrestationer:\n' + e.achievements.map(a => `- ${a}`).join('\n') : '')
  ).join('\n\n') || '(inga erfarenheter)';

  const jobSection = [
    `Titel: ${structuredJob.title || '(ej angiven)'}`,
    structuredJob.required_skills?.length   ? `Obligatoriska kompetenser: ${structuredJob.required_skills.join(', ')}` : null,
    structuredJob.nice_to_have_skills?.length  ? `Meriterande kompetenser: ${structuredJob.nice_to_have_skills.join(', ')}` : null,
    structuredJob.personal_qualities?.length   ? `Önskade personliga egenskaper: ${structuredJob.personal_qualities.join(', ')}` : null,
    structuredJob.min_experience_years != null ? `Minsta erfarenhet: ${structuredJob.min_experience_years} år` : null,
    structuredJob.seniority_level     ? `Nivå: ${structuredJob.seniority_level}` : null,
    structuredJob.required_education  ? `Utbildningskrav: ${structuredJob.required_education}` : null,
    structuredJob.city                ? `Ort: ${structuredJob.city}` : null,
    structuredJob.employment_type     ? `Anställningsform: ${structuredJob.employment_type}` : null,
    structuredJob.duration            ? `Varaktighet: ${structuredJob.duration}` : null,
    structuredJob.workplace           ? `Arbetsplats: ${structuredJob.workplace}` : null,
    structuredJob.domain              ? `Domän: ${structuredJob.domain}` : null,
    structuredJob.summary             ? `Sammanfattning: ${structuredJob.summary}` : null,
  ].filter(Boolean).join('\n');

  const system = `Du är en expert på rekrytering och kompetensanalys.
Du får en strukturerad jobbkravsprofil och en persons kompetensbank.
Din uppgift är att analysera hur väl personen matchar jobbet.

Svara ENDAST med JSON i exakt detta format:
{
  "overall_score": <0-100>,
  "summary": "<2-3 meningar om matchningen totalt sett>",
  "job_info": {
    "city": "<ort eller null>",
    "employment_type": "<Heltid|Deltid|null>",
    "duration": "<Tillsvidare|Tidsbegränsat|null>",
    "workplace": "<På plats|Hybrid|Distans|null>",
    "domain": "<domän eller null>"
  },
  "profile_fit": [
    {
      "aspect": "<t.ex. Ort, Anställningsform, Varaktighet, Arbetsplats>",
      "job_value": "<vad jobbet erbjuder>",
      "preference": "<personens önskemål, eller 'Ej angiven'>",
      "match": true/false/null,
      "note": "<kort notering vid avvikelse, annars tom sträng>"
    }
  ],
  "skills": [
    {"skill_name": "<namn>", "score": <1-100>, "reason": "<förklaring>", "is_required": true/false}
  ],
  "experiences": [
    {"id": <id>, "score": <1-100>, "reason": "<förklaring>"}
  ],
  "missing_required_skills": ["<obligatorisk skill som saknas>"],
  "missing_nice_to_have_skills": ["<meriterande skill som saknas>"],
  "matching_personal_qualities": ["<egenskap som annonsen önskar och personen uppger>"],
  "missing_personal_qualities": ["<egenskap som annonsen önskar men personen inte uppger>"]
}

Regler:
- Bygg profile_fit ENDAST om personens preferenser skickas med.
- overall_score ska påverkas av saknade obligatoriska kompetenser och preferensavvikelser.
- Om jobbets domän finns i icke-önskade domäner: sätt match=false och sänk overall_score med minst 20.
- Inkludera ENDAST skills och erfarenheter med score >= 25.
- Sortera skills och experiences med högst poäng först.
- Skilja tydligt missing_required_skills från missing_nice_to_have_skills.
- personal_qualities: jämför jobbets önskade egenskaper mot personens egenskaper. Om personen inte har några egenskaper i sin profil, lägg allt i missing_personal_qualities.`;

  let seekerSection = '';
  if (seekerProfile) {
    const parts = [];
    if (seekerProfile.roles)                    parts.push(`Önskade roller: ${seekerProfile.roles}`);
    if (seekerProfile.desired_city)             parts.push(`Önskad ort: ${seekerProfile.desired_city}`);
    if (seekerProfile.desired_employment?.length) parts.push(`Önskad anställningsform: ${seekerProfile.desired_employment.join(', ')}`);
    if (seekerProfile.desired_workplace?.length)  parts.push(`Önskad arbetsplats: ${seekerProfile.desired_workplace.join(', ')}`);
    if (seekerProfile.desired_domains?.length)    parts.push(`Önskade domäner: ${seekerProfile.desired_domains.join(', ')}`);
    if (seekerProfile.unwanted_domains?.length)   parts.push(`Icke-önskade domäner: ${seekerProfile.unwanted_domains.join(', ')}`);
    if (seekerProfile.willing_to_commute)              parts.push('Resbar: Ja');
    if (seekerProfile.personal_qualities?.length)      parts.push(`Personliga egenskaper: ${seekerProfile.personal_qualities.join(', ')}`);
    if (parts.length) seekerSection = '\n---\nPersonens preferenser:\n' + parts.join('\n');
  }

  const user = `Jobbkrav (strukturerat):\n${jobSection}\n\n---\nPersonens skills:\n${skillsList}\n\nPersonens erfarenheter:\n${expList}${seekerSection}`;
  return _chatJSON(system, user, { temperature: 0.2 });
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
  "pitch": "<3-5 meningar som profil/sammanfattning. Förklara varför XXXXX passar jobbet. Använd XXXXX konsekvent som platshållare istället för namn, pronomen eller 'kandidaten'/'personen'/'hen'.>",
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
  const STRONG = 40;
  const expText = experiences.map(e => {
    const score = e.match_score ?? -1;
    const strong = score < 0 || score >= STRONG;
    const scoreLabel = score >= 0 ? ` [MATCHPOÄNG: ${score}%]` : '';
    return `[${e.title}]${scoreLabel}`
      + (e.organization ? ` på ${e.organization}` : '')
      + (e.start_date ? ` (${e.start_date}–${e.end_date || 'nu'})` : '')
      + (strong && e.description ? `\nBeskrivning: ${e.description}` : '')
      + (strong && e.achievements?.length ? '\nPrestationer:\n' + e.achievements.map(a => `- ${a}`).join('\n') : '');
  }).join('\n\n') || '(inga erfarenheter)';

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
        "intro": "<1-2 meningar som förklarar varför just detta uppdrag är relevant för den aktuella jobbannonsen>",
        "punkter": ["<aktivitet med verb>", "<aktivitet>"]
      }
    ],
    "utbildning": [
      {"period": "<årtalet eller period>", "utbildning": "<namn>", "anordnare": "<institution>"}
    ]
  }
}

Regler:
- Använd ALLTID "XXXXX" som platshållare för namn och pronomen — aldrig "Personen", "Kandidaten", "Hen", "Han", "Hon" eller förnamnet. Användaren ersätter XXXXX själv.
- Anpassa innehållet till jobbannonsens krav utan att hitta på fakta
- Max 3 kompetenser, välj de mest relevanta för jobbet
- Inkludera ALLA uppdrag i listan, sorterade med nyaste/mest relevanta först
- För uppdrag med MATCHPOÄNG >= 40 (eller utan angiven poäng): inkludera intro (1-2 meningar som kopplar uppdraget till jobbannonsen) och 2-6 punkter som lyfter fram relevanta aktiviteter och prestationer
- För uppdrag med MATCHPOÄNG < 40: sätt intro till null och punkter till [] — bara rubrik med titel, arbetsgivare och period visas
- Alla texter på svenska`;

  const user = `Kandidat: ${name}\n\nJobbannons:\n${jobDescription.slice(0, 3000)}\n\n---\nErfarenheter:\n${expText}\n\nSkills: ${skillsText}\n\nUtbildning:\n${eduText}\n\nPersonlighetssvar (urval):\n${answersText.slice(0, 1500)}${cvExcerpt ? `\n\nCV-text (utdrag):\n${cvExcerpt}` : ''}`;

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
  "pitch": "<2-4 meningar som säljer XXXXX till arbetsgivaren. Lyft fram XXXXX:s starkaste kompetenser, erfarenheter och prestationer som är relevanta för just detta jobb. Formulera det som om du presenterar XXXXX för en rekryterare — engagerande och konkret. Använd XXXXX konsekvent, aldrig 'kandidaten'/'personen'/'hen'.>",
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
  chat: (system, user, opts) => _chat(system, user, opts),
  structureCV,
  analyzeJob,
  explainRequiredSkill,
  matchJob,
  matchJobStructured,
  generateCV,
  generateLogHouseCV,
  improvementTips,
  extractPersonalityQuestions,
  generatePersonalityDescription,
  mergeExperiences,
  improveAchievements,
  fetchJobUrl,
};
