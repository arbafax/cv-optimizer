// ── HITTA JOBB ────────────────────────────────────────────────────────────────
// Hämtar annonser från Platsbanken JobTech API, filtrerar sedda, rankar med AI.
// Depends on: db.js (cvDb), app-state.js (apiFetch, API_BASE_URL), ai.js (cvAI),
//             translations.js (t), app-match.js (showView, jobDescription)

const PLATSBANKEN_URL    = 'https://jobsearch.api.jobtechdev.se/search';
const PLATSBANKEN_AD_URL = 'https://jobsearch.api.jobtechdev.se/ad';
const JOBS_FETCH_LIMIT   = 100;  // How many to request from API (before filtering)
const JOBS_DISPLAY_LIMIT = 30;   // How many to show in the list after filtering

// SCB municipality codes (kommunkoder) for all 290 Swedish municipalities.
// Used to pass municipality= parameter to Platsbanken instead of baking city into q.
const MUNICIPALITY_CODES = {
    // Stockholms län (01)
    'upplands väsby':0114,'vallentuna':0115,'österåker':0117,'värmdö':0120,
    'järfälla':0123,'ekerö':0125,'huddinge':0126,'botkyrka':0127,'salem':0128,
    'haninge':0136,'tyresö':0138,'upplands-bro':0139,'upplandsbro':0139,
    'nykvarn':0140,'täby':0160,'danderyd':0162,'sollentuna':0163,
    'stockholm':0180,'södertälje':0181,'nacka':0182,'sundbyberg':0183,
    'solna':0184,'lidingö':0186,'vaxholm':0187,'norrtälje':0188,
    'sigtuna':0191,'nynäshamn':0192,
    // Uppsala län (03)
    'håbo':0305,'älvkarleby':0319,'knivsta':0330,'heby':0331,'tierp':0360,
    'uppsala':0380,'enköping':0381,'östhammar':0382,
    // Södermanlands län (04)
    'vingåker':0428,'gnesta':0461,'nyköping':0480,'oxelösund':0481,
    'flen':0482,'katrineholm':0483,'eskilstuna':0484,'strängnäs':0486,'trosa':0488,
    // Östergötlands län (05)
    'ödeshög':0509,'ydre':0512,'kinda':0513,'boxholm':0560,'åtvidaberg':0561,
    'finspång':0562,'valdemarsvik':0563,'linköping':0580,'norrköping':0581,
    'söderköping':0582,'motala':0583,'vadstena':0584,'mjölby':0586,
    // Jönköpings län (06)
    'aneby':0604,'gnosjö':0617,'mullsjö':0642,'habo':0643,'gislaved':0662,
    'vaggeryd':0665,'jönköping':0680,'nässjö':0682,'värnamo':0683,
    'sävsjö':0684,'vetlanda':0685,'eksjö':0686,'tranås':0687,
    // Kronobergs län (07)
    'uppvidinge':0760,'lessebo':0761,'tingsryd':0763,'alvesta':0764,
    'älmhult':0765,'markaryd':0767,'växjö':0780,'ljungby':0781,
    // Kalmar län (08)
    'högsby':0821,'torsås':0834,'mörbylånga':0840,'hultsfred':0860,
    'mönsterås':0861,'emmaboda':0862,'kalmar':0880,'nybro':0881,
    'oskarshamn':0882,'västervik':0883,'vimmerby':0884,'borgholm':0885,
    // Gotlands län (09)
    'gotland':0980,
    // Blekinge län (10)
    'olofström':1060,'karlskrona':1080,'ronneby':1081,'karlshamn':1082,'sölvesborg':1083,
    // Skåne län (12)
    'svalöv':1214,'staffanstorp':1230,'burlöv':1231,'vellinge':1233,
    'östra göinge':1256,'örkelljunga':1257,'bjuv':1260,'kävlinge':1261,
    'lomma':1262,'svedala':1263,'skurup':1264,'sjöbo':1265,'hörby':1266,
    'höör':1267,'tomelilla':1270,'bromölla':1272,'osby':1273,'perstorp':1275,
    'klippan':1276,'åstorp':1277,'båstad':1278,'malmö':1280,'lund':1281,
    'landskrona':1282,'helsingborg':1283,'höganäs':1284,'eslöv':1285,
    'ystad':1286,'trelleborg':1287,'kristianstad':1290,'simrishamn':1291,
    'ängelholm':1292,'hässleholm':1293,
    // Hallands län (13)
    'hylte':1315,'halmstad':1380,'laholm':1381,'falkenberg':1382,
    'varberg':1383,'kungsbacka':1384,
    // Västra Götalands län (14)
    'härryda':1401,'partille':1402,'öckerö':1407,'stenungsund':1415,
    'tjörn':1419,'orust':1421,'sotenäs':1427,'munkedal':1430,'tanum':1435,
    'dals-ed':1438,'dalseد':1438,'färgelanda':1439,'ale':1440,'lerum':1441,
    'vårgårda':1442,'bollebygd':1443,'grästorp':1444,'essunga':1445,
    'karlsborg':1446,'gullspång':1447,'tranemo':1452,'bengtsfors':1460,
    'mellerud':1461,'lilla edet':1462,'mark':1463,'svenljunga':1465,
    'herrljunga':1466,'vara':1470,'götene':1471,'tibro':1472,'töreboda':1473,
    'göteborg':1480,'mölndal':1481,'kungälv':1482,'lysekil':1484,
    'uddevalla':1485,'strömstad':1486,'vänersborg':1487,'trollhättan':1488,
    'alingsås':1489,'borås':1490,'ulricehamn':1491,'åmål':1492,
    'mariestad':1493,'lidköping':1494,'skara':1495,'skövde':1496,
    'hjo':1497,'tidaholm':1498,'falköping':1499,
    // Värmlands län (17)
    'kil':1715,'eda':1730,'torsby':1737,'storfors':1760,'hammarö':1761,
    'munkfors':1762,'forshaga':1763,'grums':1764,'årjäng':1765,'sunne':1766,
    'karlstad':1780,'kristinehamn':1781,'filipstad':1782,'hagfors':1783,
    'arvika':1784,'säffle':1785,
    // Örebro län (18)
    'lekeberg':1814,'laxå':1860,'hallsberg':1861,'degerfors':1862,
    'hällefors':1863,'ljusnarsberg':1864,'örebro':1880,'kumla':1881,
    'askersund':1882,'karlskoga':1883,'nora':1884,'lindesberg':1885,
    // Västmanlands län (19)
    'skinnskatteberg':1904,'surahammar':1907,'kungsör':1960,'hallstahammar':1961,
    'norberg':1962,'västerås':1980,'sala':1981,'fagersta':1982,
    'köping':1983,'arboga':1984,
    // Dalarnas län (20)
    'vansbro':2021,'malung-sälen':2023,'malungsälen':2023,'gagnef':2026,
    'leksand':2029,'rättvik':2031,'orsa':2034,'älvdalen':2039,
    'smedjebacken':2061,'mora':2062,'falun':2080,'borlänge':2081,
    'säter':2082,'hedemora':2083,'avesta':2084,'ludvika':2085,
    // Gävleborgs län (21)
    'ockelbo':2101,'hofors':2104,'ovanåker':2121,'nordanstig':2132,
    'ljusdal':2161,'gävle':2180,'sandviken':2181,'söderhamn':2182,
    'bollnäs':2183,'hudiksvall':2184,
    // Västernorrlands län (22)
    'ånge':2260,'timrå':2262,'härnösand':2280,'sundsvall':2281,
    'kramfors':2282,'sollefteå':2283,'örnsköldsvik':2284,
    // Jämtlands län (23)
    'ragunda':2303,'bräcke':2305,'krokom':2309,'strömsund':2313,
    'åre':2321,'berg':2326,'härjedalen':2361,'östersund':2380,
    // Västerbottens län (24)
    'nordmaling':2401,'bjurholm':2403,'vindeln':2404,'robertsfors':2409,
    'norsjö':2417,'malå':2418,'storuman':2421,'sorsele':2422,
    'dorotea':2425,'vännäs':2460,'vilhelmina':2462,'åsele':2463,
    'umeå':2480,'lycksele':2481,'skellefteå':2482,
    // Norrbottens län (25)
    'arvidsjaur':2505,'arjeplog':2506,'jokkmokk':2510,'överkalix':2513,
    'kalix':2514,'övertorneå':2518,'pajala':2521,'gällivare':2523,
    'älvsbyn':2560,'luleå':2580,'piteå':2581,'boden':2582,
    'haparanda':2583,'kiruna':2584,
};

// ── Init ──────────────────────────────────────────────────────────────────────

async function loadJobbView() {
    _renderJobCriteria();
    // Rendera tidigare resultat om de finns i sessionStorage
    const cached = sessionStorage.getItem('jobb_last_results');
    if (cached) {
        try { _renderJobList(JSON.parse(cached)); } catch { /* ignorera */ }
    }
}

// ── Kriterievisning ───────────────────────────────────────────────────────────

async function _renderJobCriteria() {
    const el = document.getElementById('jobb-criteria');
    if (!el) return;
    try {
        const own = await cvDb.kandidater.getOwn();
        if (!own) { el.innerHTML = ''; return; }
        const chips = [];
        if (own.roles) own.roles.split(',').map(s => s.trim()).filter(Boolean).forEach(r => chips.push(`<span class="jobb-chip">${r}</span>`));
        for (const d of (own.desired_domains || [])) {
            chips.push(`<span class="jobb-chip">${d}</span>`);
        }
        (own.desired_city || '').split(',').map(s => s.trim()).filter(Boolean)
            .forEach(c => chips.push(`<span class="jobb-chip jobb-chip--loc"><span class="material-icons" style="font-size:.9rem;vertical-align:middle">place</span> ${c}</span>`));
        el.innerHTML = chips.length
            ? `<span class="jobb-criteria-label">${t('jobs.criteria_label')}</span> ${chips.join('')}`
            : '';
    } catch { el.innerHTML = ''; }
}

// ── Huvudflöde: hämta + filtrera + ranka ──────────────────────────────────────

async function fetchAndRankJobs() {
    const btn = document.getElementById('jobb-fetch-btn');
    const statusEl = document.getElementById('jobb-status');
    const listEl = document.getElementById('jobb-list');
    const emptyEl = document.getElementById('jobb-empty');
    const noProfileEl = document.getElementById('jobb-no-profile');

    const _show = (el) => { el.classList.remove('hidden'); };
    const _hide = (el) => { el.classList.add('hidden'); };
    const _status = (msg) => { statusEl.textContent = msg; _show(statusEl); };

    _hide(emptyEl); _hide(noProfileEl); _hide(statusEl);
    listEl.innerHTML = '';
    if (btn) btn.disabled = true;

    try {
        // 1. Hämta profil
        const own = await cvDb.kandidater.getOwn();
        const baseQuery = _buildBaseQuery(own);
        if (!baseQuery) { _show(noProfileEl); return; }

        _renderJobCriteria();

        // 2. Hämta sedda annonser (används i cascade-loopen)
        const seen = await cvDb.jobSeen.getAll();
        const seenIds = new Set(seen.map(s => s.job_id));

        // 3. Hämta från Platsbanken — kaskad per ort
        const filtered = await _fetchCascade(own, baseQuery, seenIds, _status);

        if (filtered.length === 0) { _hide(statusEl); _show(emptyEl); return; }

        // 4. Batch-ranka med AI
        _status(t('jobs.ranking'));
        let ranked = filtered;
        try {
            ranked = await _batchRankJobs(filtered, own);
        } catch (rankErr) {
            console.warn('AI-rankning misslyckades, visar orankat:', rankErr);
        }

        _hide(statusEl);
        sessionStorage.setItem('jobb_last_results', JSON.stringify(ranked));
        _renderJobList(ranked);

    } catch (err) {
        _status(t('jobs.fetch_error').replace('{err}', err.message));
        console.error(err);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ── Filtrera oönskade roller ──────────────────────────────────────────────────

function _filterUnwantedRoles(hits, unwantedRolesStr) {
    if (!unwantedRolesStr) return hits;
    const terms = unwantedRolesStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!terms.length) return hits;
    return hits.filter(h => {
        const text = `${h.headline} ${h.occupation?.label ?? ''}`.toLowerCase();
        return !terms.some(term => text.includes(term));
    });
}

// ── Bygg basquery (utan ort) ──────────────────────────────────────────────────

function _buildBaseQuery(own) {
    if (!own) return null;
    // Only roles go into q — domains are used only for AI ranking, not for filtering in Platsbanken
    const parts = own.roles ? own.roles.split(',').map(s => s.trim()).filter(Boolean) : [];
    return parts.length ? parts.join(' ') : null;
}

// ── Kommunkodsuppslagning ─────────────────────────────────────────────────────

function _municipalityCodes(cityString) {
    if (!cityString) return [];
    const codes = [];
    for (const raw of cityString.split(',')) {
        const key  = raw.trim().toLowerCase()
            .replace(/[åä]/g, 'a').replace(/ö/g, 'o') // normalize for loose matching
            .normalize('NFD').replace(/[̀-ͯ]/g, '');
        // First try exact key, then try original normalized
        const orig = raw.trim().toLowerCase();
        const code = MUNICIPALITY_CODES[orig] ?? _fuzzyMunicipalityCode(key);
        if (code) codes.push(String(code).padStart(4, '0'));
    }
    return codes;
}

function _fuzzyMunicipalityCode(normalized) {
    for (const [name, code] of Object.entries(MUNICIPALITY_CODES)) {
        const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[åä]/g, 'a').replace(/ö/g, 'o');
        if (n === normalized) return code;
    }
    return null;
}

// ── Sökning mot Platsbanken ───────────────────────────────────────────────────

async function _fetchCascade(own, baseQuery, seenIds, statusFn) {
    const municipalityCodes = _municipalityCodes(own.desired_city);
    statusFn(t('jobs.fetching'));

    const hits     = await _fetchFromPlatsbanken(baseQuery, municipalityCodes);
    const fresh    = hits.filter(h => !seenIds.has(h.id));
    const filtered = _filterUnwantedRoles(fresh, own.unwanted_roles);

    return filtered.slice(0, JOBS_DISPLAY_LIMIT);
}

// ── Platsbanken API ───────────────────────────────────────────────────────────

async function _fetchFromPlatsbanken(query, municipalityCodes = []) {
    const params = new URLSearchParams({
        q:      query,
        limit:  String(JOBS_FETCH_LIMIT),
        offset: '0',
    });
    // municipality is a multi-value param (OR between codes)
    for (const code of municipalityCodes) params.append('municipality', code);

    const res = await fetch(`${PLATSBANKEN_URL}?${params}`, {
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Platsbanken svarade ${res.status}`);
    const data = await res.json();
    return data.hits ?? [];
}

// ── AI batch-rankning ─────────────────────────────────────────────────────────

async function _batchRankJobs(hits, own) {
    const portrait      = own?.portrait || '';
    const unwantedRoles = own?.unwanted_roles ?? '';

    const jobLines = hits.map((h, i) => {
        const ingress = (h.description?.text || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .slice(0, 200);
        return `${i + 1}. [${h.id}] ${h.headline} @ ${h.employer?.name ?? '–'} (${h.workplace_address?.municipality ?? '–'})\n   ${ingress}`;
    }).join('\n\n');

    const systemPrompt = `Du är en karriärrådgivare som hjälper en kandidat att hitta relevanta jobbannonser.
Svara ENBART med ett JSON-objekt. Inget annat — ingen inledning, inga förklaringar.`;

    const userPrompt = `Kandidatprofil:
${portrait ? `Porträtt: ${portrait}\n` : ''}${own?.roles ? `Önskade roller: ${own.roles}\n` : ''}${unwantedRoles ? `Oönskade roller: ${unwantedRoles}\n` : ''}${own?.title ? `Nuvarande/önskad roll: ${own.title}\n` : ''}

Jobbannonser att bedöma:
${jobLines}

Ranka varje annons mot profilen. Returnera ett JSON-objekt med nyckeln "rankings" som är en array:
[{"id": "<annons-id>", "score": <1-10>, "motivation": "<max 20 ord på svenska>"}]

Poängskala: 9-10=utmärkt match, 7-8=bra, 5-6=okej, 3-4=svag, 1-2=irrelevant.
Sätt score=0 om annonsen tydligt matchar oönskade roller.`;

    const response = await cvAI.chat(systemPrompt, userPrompt, { temperature: 0.2 });

    const text = response.trim();
    const jsonStr = text.startsWith('{') ? text : text.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) throw new Error('Ogiltigt AI-svar');

    const parsed = JSON.parse(jsonStr);
    const rankMap = {};
    for (const r of (parsed.rankings ?? [])) {
        rankMap[r.id] = { score: r.score ?? 5, motivation: r.motivation ?? '' };
    }

    // Slå ihop rankning med hits, sortera fallande på score
    return hits
        .map(h => ({ ...h, _score: rankMap[h.id]?.score ?? 5, _motivation: rankMap[h.id]?.motivation ?? '' }))
        .sort((a, b) => b._score - a._score);
}

// ── Rendera lista ─────────────────────────────────────────────────────────────

async function _renderJobList(jobs) {
    const listEl = document.getElementById('jobb-list');
    const emptyEl = document.getElementById('jobb-empty');
    if (!listEl) return;

    if (!jobs || jobs.length === 0) {
        listEl.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        return;
    }
    emptyEl?.classList.add('hidden');

    // Check which jobs are already saved so the button can reflect that
    const savedJobs = await cvDb.jobSeen.getByStatus('saved');
    const savedIds  = new Set(savedJobs.map(j => j.job_id));

    listEl.innerHTML = jobs.map(job => {
        const score = (job._score !== undefined && job._score !== null) ? job._score : null;
        const scoreClass = score === null ? 'jobb-score--none'
            : score >= 8 ? 'jobb-score--high'
            : score >= 5 ? 'jobb-score--mid'
            : 'jobb-score--low';
        const scoreLabel = score !== null ? `${score}/10` : '';

        const deadline = job.application_deadline
            ? `<span class="jobb-deadline">${t('jobs.deadline')} ${job.application_deadline.slice(0, 10)}</span>`
            : '';
        const location = job.workplace_address?.municipality ?? '';
        const employer = job.employer?.name ?? '';
        const motivation = job._motivation
            ? `<p class="jobb-motivation">${job._motivation}</p>`
            : '';

        const alreadySaved = savedIds.has(job.id);
        const saveBtn = alreadySaved
            ? `<button class="btn btn-sm btn-secondary" disabled>
                <span class="material-icons" style="font-size:1rem">bookmark</span>
                ${t('jobs.already_saved')}
               </button>`
            : `<button class="btn btn-sm btn-secondary" onclick="saveJob('${job.id}')">
                <span class="material-icons" style="font-size:1rem">bookmark_add</span>
                ${t('jobs.save')}
               </button>`;

        return `<div class="jobb-card" id="jobb-card-${job.id}">
            <div class="jobb-score-badge ${scoreClass}">${scoreLabel}</div>
            <div class="jobb-info">
                <h3 class="jobb-headline"><a href="${job.webpage_url ?? '#'}" target="_blank" rel="noopener">${job.headline}</a></h3>
                <p class="jobb-meta">${[employer, location].filter(Boolean).join(' · ')} ${deadline}</p>
                ${motivation}
            </div>
            <div class="jobb-actions">
                <button class="btn btn-sm btn-ghost" onclick="dismissJob('${job.id}', '${_esc(job.headline)}', '${_esc(employer)}', '${_esc(job.webpage_url ?? '')}')">
                    <span class="material-icons" style="font-size:1rem">thumb_down</span>
                    ${t('jobs.dismiss')}
                </button>
                ${saveBtn}
                <button class="btn btn-sm btn-primary" onclick="openJobInMatch('${job.id}')">
                    <span class="material-icons" style="font-size:1rem">arrow_forward</span>
                    ${t('jobs.open_match')}
                </button>
            </div>
        </div>`;
    }).join('');

    // Spara jobb-data i sessionStorage för openJobInMatch
    const jobMap = {};
    for (const j of jobs) jobMap[j.id] = j;
    sessionStorage.setItem('jobb_map', JSON.stringify(jobMap));
}

function _esc(str) {
    return (str ?? '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

// ── Åtgärder ──────────────────────────────────────────────────────────────────

async function dismissJob(jobId, headline, employer, url) {
    await cvDb.jobSeen.add(jobId, 'dismissed', { headline, employer, url });
    document.getElementById(`jobb-card-${jobId}`)?.remove();

    // Uppdatera sessionStorage
    const cached = sessionStorage.getItem('jobb_last_results');
    if (cached) {
        const jobs = JSON.parse(cached).filter(j => j.id !== jobId);
        sessionStorage.setItem('jobb_last_results', JSON.stringify(jobs));
        if (jobs.length === 0) document.getElementById('jobb-empty')?.classList.remove('hidden');
    }
}

async function saveJob(jobId) {
    const card    = document.getElementById(`jobb-card-${jobId}`);
    const saveBtn = card?.querySelector('.btn-secondary');

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="spinner-small"></span> ${t('jobs.analysing')}`;
    }

    try {
        // 1. Cached data from sessionStorage
        const jobMap    = JSON.parse(sessionStorage.getItem('jobb_map') || '{}');
        const cachedJob = jobMap[jobId] ?? {};

        // 2. Fetch full ad from Platsbanken for complete structured data
        let job = cachedJob;
        try {
            const res = await fetch(`${PLATSBANKEN_AD_URL}/${jobId}`, {
                headers: { Accept: 'application/json' },
            });
            if (res.ok) job = await res.json();
        } catch { /* use cached data */ }

        // 3. Build clean description text
        const description = (job?.description?.text || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // 4. Extract structured skill lists from API (taxonomy)
        const apiRequiredSkills = [
            ...(job?.must_have?.skills           || []).map(s => s.label),
            ...(job?.must_have?.work_experiences  || []).map(s => s.label),
        ].filter(Boolean);
        const apiMeritSkills = [
            ...(job?.nice_to_have?.skills         || []).map(s => s.label),
        ].filter(Boolean);

        // 5. AI analysis — same function as the match flow uses (cvAI.analyzeJob)
        let analysis = null;
        if (description) {
            try {
                analysis = await cvAI.analyzeJob(job?.headline ?? '', description.slice(0, 5000));
            } catch { /* degrade gracefully — analysis fields will be empty */ }
        }

        // 6. Persist to IndexedDB
        await cvDb.jobSeen.add(jobId, 'saved', {
            headline:              job?.headline                          ?? '',
            employer:              job?.employer?.name                    ?? '',
            location:              job?.workplace_address?.municipality   ?? '',
            deadline:              job?.application_deadline?.slice(0,10) ?? '',
            url:                   job?.webpage_url                       ?? '',
            description:           description.slice(0, 8000),
            score:                 cachedJob?._score                      ?? null,
            // From Platsbanken API taxonomy
            employment_type:       job?.employment_type?.label            ?? '',
            working_hours_type:    job?.working_hours_type?.label         ?? '',
            salary_type:           job?.salary_type?.label                ?? '',
            // From AI analysis (cvAI.analyzeJob) — field name mapping
            required_competencies: analysis?.required_skills              ?? apiRequiredSkills,
            merit_competencies:    analysis?.nice_to_have_skills          ?? apiMeritSkills,
            personal_qualities:    analysis?.personal_qualities           ?? [],
            salary_range:          analysis?.salary_range                 ?? null,
            work_tasks_summary:    analysis?.summary                      ?? '',
            seniority_level:       analysis?.seniority_level              ?? null,
            min_experience_years:  analysis?.min_experience_years         ?? null,
            required_education:    analysis?.required_education           ?? null,
            workplace:             analysis?.workplace                    ?? null,
            domain:                analysis?.domain                       ?? null,
            duration_type:         analysis?.duration                     ?? null,
        });

        if (saveBtn) {
            saveBtn.innerHTML = `<span class="material-icons" style="font-size:1rem">bookmark</span> ${t('jobs.already_saved')}`;
        }
    } catch (err) {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<span class="material-icons" style="font-size:1rem">bookmark_add</span> ${t('jobs.save')}`;
        }
        console.error('saveJob failed:', err);
    }
}

// ── Sparade jobb ──────────────────────────────────────────────────────────────

let _currentSavedJob = null;

async function loadSparadeJobbView() {
    const saved = await cvDb.jobSeen.getByStatus('saved');
    _renderSparadeTable(saved);
}

function _renderSparadeTable(jobs) {
    const container = document.getElementById('sparade-jobb-list');
    if (!container) return;

    if (!jobs || jobs.length === 0) {
        container.innerHTML = `<div class="empty-state"><span class="material-icons" style="font-size:3rem;color:var(--border)">bookmark_border</span><p data-i18n="jobs.saved_empty">${t('jobs.saved_empty')}</p></div>`;
        return;
    }

    // Sort by deadline ascending — nearest deadline first, no deadline last
    const sorted = [...jobs].sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline);
    });

    container.innerHTML = `<div class="jobb-list">${sorted.map(j => {
        const score = j.score;
        const scoreClass = score === null || score === undefined ? 'jobb-score--none'
            : score >= 8 ? 'jobb-score--high'
            : score >= 5 ? 'jobb-score--mid'
            : 'jobb-score--low';
        const scoreLabel = score !== null && score !== undefined ? `${score}/10` : '';

        const deadline = j.deadline
            ? `<span class="jobb-deadline"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">event</span> ${j.deadline}</span>`
            : '';

        const matchHtml = j.match_score !== null && j.match_score !== undefined
            ? `<p class="jobb-motivation"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">analytics</span> ${t('jobs.col_match')}: ${j.match_score}%</p>`
            : '';

        return `<div class="jobb-card" style="cursor:pointer" onclick="showJobbDetaljer('${j.job_id}')">
            <div class="jobb-score-badge ${scoreClass}">${scoreLabel}</div>
            <div class="jobb-info">
                <h3 class="jobb-headline">${_esc(j.headline)}</h3>
                <p class="jobb-meta">${[_esc(j.employer), _esc(j.location)].filter(Boolean).join(' · ')} ${deadline}</p>
                ${matchHtml}
            </div>
            <div class="jobb-actions" onclick="event.stopPropagation()">
                <button class="btn btn-sm btn-ghost" style="padding:6px" title="${t('common.delete')}" onclick="deleteFromSaved('${j.job_id}')">
                    <span class="material-icons" style="font-size:1.1rem">delete</span>
                </button>
            </div>
        </div>`;
    }).join('')}</div>`;
}

async function deleteFromSaved(jobId) {
    // Downgrade to 'dismissed' instead of deleting — keeps the job out of future searches
    const existing = await cvDb.jobSeen.get(jobId);
    if (existing) {
        await cvDb.jobSeen.add(jobId, 'dismissed', {
            headline: existing.headline,
            employer: existing.employer,
            url:      existing.url,
        });
    }
    const saved = await cvDb.jobSeen.getByStatus('saved');
    _renderSparadeTable(saved);
}

async function showJobbDetaljer(jobId) {
    const job = await cvDb.jobSeen.get(jobId);
    if (!job) return;
    _currentSavedJob = job;

    document.getElementById('jobbdet-title').textContent    = job.headline;
    document.getElementById('jobbdet-company').textContent  = job.employer  || '–';
    document.getElementById('jobbdet-location').textContent = job.location  || '–';
    document.getElementById('jobbdet-deadline').textContent = job.deadline  || '–';

    const linkEl = document.getElementById('jobbdet-link');
    if (job.url) { linkEl.href = job.url; linkEl.classList.remove('hidden'); }
    else           linkEl.classList.add('hidden');

    const scoreEl = document.getElementById('jobbdet-score');
    if (job.score !== null && job.score !== undefined) {
        const cls = job.score >= 8 ? 'score-high' : job.score >= 5 ? 'score-mid' : 'score-low';
        scoreEl.innerHTML = `<span class="score-pill ${cls}">${t('jobs.col_score')}: ${job.score}/10</span>`;
    } else { scoreEl.innerHTML = ''; }

    const matchEl = document.getElementById('jobbdet-match');
    if (job.match_score !== null && job.match_score !== undefined) {
        const cls = job.match_score >= 70 ? 'score-high' : job.match_score >= 40 ? 'score-mid' : 'score-low';
        matchEl.innerHTML = `<span class="score-pill ${cls}">${t('jobs.col_match')}: ${job.match_score}%</span>`;
    } else { matchEl.innerHTML = ''; }

    // Make the job description available to showSkillContextModal / explainRequiredSkill
    lastJobDesc = job.description || '';

    // Build match sets for highlighting owned competencies
    const own = await cvDb.kandidater.getOwn();
    const ownId = own?.id;
    const ownSkillNames = new Set(
        ownId ? (await cvDb.kandSkills.listFor(ownId)).map(s => s.skill_name.trim().toLowerCase()) : []
    );
    const ownQualities = new Set(
        (own?.personal_qualities || []).map(q => q.trim().toLowerCase())
    );

    _renderJobAnalysis(job, ownSkillNames, ownQualities);

    document.getElementById('jobbdet-description').textContent = job.description || t('jobs.no_description');

    showView('jobbdetaljer', null);
}

function _renderJobAnalysis(job, ownSkillNames = new Set(), ownQualities = new Set()) {
    const el = document.getElementById('jobbdet-analysis');
    if (!el) return;

    const _hasSkill = name => ownSkillNames.has(name.trim().toLowerCase());
    const _hasQuality = name => ownQualities.has(name.trim().toLowerCase());
    const _checkIcon = `<span class="material-icons jobdet-chip-check">check_circle</span>`;

    const sections = [];

    // Info chips (from API + AI) — shown in a card header row
    const extras = [];
    if (job.working_hours_type) extras.push(`<span class="jobdet-chip jobdet-chip--info"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">schedule</span> ${_esc(job.working_hours_type)}</span>`);
    if (job.employment_type)    extras.push(`<span class="jobdet-chip jobdet-chip--info"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">badge</span> ${_esc(job.employment_type)}</span>`);
    if (job.duration_type)      extras.push(`<span class="jobdet-chip jobdet-chip--info"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">event_repeat</span> ${_esc(job.duration_type)}</span>`);
    if (job.workplace)          extras.push(`<span class="jobdet-chip jobdet-chip--info"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">home_work</span> ${_esc(job.workplace)}</span>`);
    if (job.seniority_level)    extras.push(`<span class="jobdet-chip jobdet-chip--info"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">trending_up</span> ${_esc(job.seniority_level)}</span>`);
    if (job.required_education) extras.push(`<span class="jobdet-chip jobdet-chip--info"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">school</span> ${_esc(job.required_education)}</span>`);
    if (job.salary_type)        extras.push(`<span class="jobdet-chip jobdet-chip--info"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">currency_exchange</span> ${_esc(job.salary_type)}</span>`);
    if (job.salary_range)       extras.push(`<span class="jobdet-chip jobdet-chip--info"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">payments</span> ${_esc(job.salary_range)}</span>`);

    if (job.work_tasks_summary) {
        sections.push(`
        <div class="card">
            <h3 class="jobdet-section-title"><span class="material-icons">work_outline</span> ${t('jobs.work_tasks')}</h3>
            ${extras.length ? `<div class="jobdet-chip-list" style="margin-bottom:1rem">${extras.join('')}</div>` : ''}
            <p class="jobdet-analysis-text">${_esc(job.work_tasks_summary)}</p>
        </div>`);
    } else if (extras.length) {
        sections.push(`<div class="card"><div class="jobdet-chip-list">${extras.join('')}</div></div>`);
    }

    const _infoBtn = (name, fn) => {
        const escaped = name.replace(/'/g, "\\'");
        return `<button class="skill-info-btn" onclick="${fn}('${escaped}')" title="${t('modal.fetching_context')}"><span class="material-icons">info</span></button>`;
    };

    if (job.required_competencies?.length) {
        sections.push(`
        <div class="card">
            <h3 class="jobdet-section-title"><span class="material-icons">task_alt</span> ${t('jobs.required_comp')}</h3>
            <div class="jobdet-chip-list">${job.required_competencies.map(c =>
                `<span class="bank-skill-chip chip-technical${_hasSkill(c) ? ' chip-owned' : ''}">${_hasSkill(c) ? _checkIcon : ''}${_esc(c)}${_infoBtn(c, 'showSkillContextModal')}</span>`
            ).join('')}</div>
        </div>`);
    }

    if (job.merit_competencies?.length) {
        sections.push(`
        <div class="card">
            <h3 class="jobdet-section-title"><span class="material-icons">star_outline</span> ${t('jobs.merit_comp')}</h3>
            <div class="jobdet-chip-list">${job.merit_competencies.map(c =>
                `<span class="bank-skill-chip chip-level-1${_hasSkill(c) ? ' chip-owned' : ''}">${_hasSkill(c) ? _checkIcon : ''}${_esc(c)}${_infoBtn(c, 'showSkillContextModal')}</span>`
            ).join('')}</div>
        </div>`);
    }

    if (job.personal_qualities?.length) {
        sections.push(`
        <div class="card">
            <h3 class="jobdet-section-title"><span class="material-icons">psychology</span> ${t('jobs.personal_qual')}</h3>
            <div class="jobdet-chip-list">${job.personal_qualities.map(c =>
                `<span class="bank-skill-chip chip-personal${_hasQuality(c) ? ' chip-owned' : ''}">${_hasQuality(c) ? _checkIcon : ''}${_esc(c)}${_infoBtn(c, 'showQualityContextModal')}</span>`
            ).join('')}</div>
        </div>`);
    }

    if (sections.length) {
        el.innerHTML = `<div class="jobdet-analysis">${sections.join('')}</div>`;
        el.classList.remove('hidden');
    } else {
        el.innerHTML = '';
        el.classList.add('hidden');
    }
}

function openSavedJobInMatch() {
    if (!_currentSavedJob) return;
    const textarea = document.getElementById('job-description');
    if (textarea) {
        const job = _currentSavedJob;
        textarea.value = [job.headline, job.employer, job.url, job.description]
            .filter(Boolean).join('\n').trim();

        // Pre-warm the match flow's analysis cache with the stored AI analysis.
        // This lets _getStructuredJob() return immediately (cache hit) instead of
        // making another analyzeJob AI call when the user clicks "Matcha med AI".
        if (job.required_competencies?.length || job.work_tasks_summary) {
            const structuredJob = {
                title:               job.headline              ?? '',
                required_skills:     job.required_competencies ?? [],
                nice_to_have_skills: job.merit_competencies    ?? [],
                personal_qualities:  job.personal_qualities    ?? [],
                min_experience_years: job.min_experience_years ?? null,
                seniority_level:     job.seniority_level       ?? null,
                required_education:  job.required_education    ?? null,
                city:                job.location              ?? null,
                employment_type:     null,
                duration:            job.duration_type         ?? null,
                workplace:           job.workplace             ?? null,
                domain:              job.domain                ?? null,
                summary:             job.work_tasks_summary    ?? '',
                salary_range:        job.salary_range          ?? null,
            };
            _jobAnalysisCache.set(_jobCacheKey(textarea.value), structuredJob);
        }
    }
    if (typeof clearMatchResult === 'function') clearMatchResult();
    // Set AFTER clearMatchResult (which resets these vars)
    lastMatchJobId   = _currentSavedJob.job_id;
    lastMatchJobMeta = {
        headline: _currentSavedJob.headline ?? '',
        employer: _currentSavedJob.employer ?? '',
        url:      _currentSavedJob.url      ?? '',
        status:   'saved',
    };
    const navEl = document.querySelector('[onclick*="showView(\'optimize\'"]');
    showView('optimize', navEl);
    if (typeof updateMatchWarning === 'function') updateMatchWarning();
    if (typeof updateCharCount === 'function') updateCharCount();
}

async function openJobInMatch(jobId) {
    try {
        const jobMap = JSON.parse(sessionStorage.getItem('jobb_map') || '{}');
        const job = jobMap[jobId];
        if (!job) return;

        const employer = job.employer?.name ?? '';
        const url      = job.webpage_url ?? '';
        const body     = (job.description?.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

        const textarea = document.getElementById('job-description');
        if (textarea) {
            textarea.value = [job.headline, employer, url, body].filter(Boolean).join('\n').trim();
        }

        const navEl    = document.querySelector('[onclick*="showView(\'optimize\'"]');
        const existing = await cvDb.jobSeen.get(jobId);
        const status   = existing?.status === 'saved' ? 'saved' : null;
        if (typeof clearMatchResult === 'function') clearMatchResult();
        // Set AFTER clearMatchResult (which resets these vars)
        lastMatchJobId   = jobId;
        lastMatchJobMeta = { headline: job.headline ?? '', employer, url, status };
        showView('optimize', navEl);
        if (typeof updateMatchWarning === 'function') updateMatchWarning();
        if (typeof updateCharCount === 'function') updateCharCount();
    } catch (err) {
        console.error('openJobInMatch:', err);
    }
}

// ── Spara/dissa från match-resultatet ─────────────────────────────────────────

async function saveJobFromMatch() {
    if (!lastMatchJobId) return;
    const btn = document.getElementById('match-save-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-small"></span> ${t('jobs.analysing')}`;
    }
    await saveJob(lastMatchJobId);
    if (btn) btn.innerHTML = `<span class="material-icons" style="font-size:1rem;vertical-align:middle">bookmark</span> ${t('jobs.saved_ok')}`;
    if (lastMatchJobMeta) lastMatchJobMeta.status = 'saved';
}

async function dismissJobFromMatch() {
    if (!lastMatchJobId || !lastMatchJobMeta) return;
    const btn = document.getElementById('match-dismiss-btn');
    if (btn) btn.disabled = true;
    const { headline, employer, url } = lastMatchJobMeta;
    await dismissJob(lastMatchJobId, headline, employer, url);
    document.getElementById('match-job-actions')?.remove();
}
