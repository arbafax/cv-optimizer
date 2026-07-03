// ── Constants ─────────────────────────────────────────────────────────────────
// Browser-only version: API_BASE_URL stripped in apiFetch dispatcher
const API_BASE_URL  = '';

async function _generateKandidatPortrait(kandidatId) {
    const [kand, skills, exps, edu, certs] = await Promise.all([
        cvDb.kandidater.get(kandidatId),
        cvDb.kandSkills.listFor(kandidatId),
        cvDb.kandExperiences.listFor(kandidatId),
        cvDb.kandEducation.listFor(kandidatId),
        cvDb.kandCertifications.listFor(kandidatId),
    ]);
    if (!kand) throw new Error('Kandidat hittades inte');

    const skillsByCategory = {};
    for (const s of skills) {
        const cat = s.category || 'Övrigt';
        if (!skillsByCategory[cat]) skillsByCategory[cat] = [];
        skillsByCategory[cat].push(s.skill_level ? `${s.skill_name} (${s.skill_level})` : s.skill_name);
    }
    const skillsText = Object.entries(skillsByCategory)
        .map(([cat, list]) => `${cat}: ${list.join(', ')}`)
        .join('\n') || '(inga kompetenser registrerade)';

    const expsText = exps.length ? exps.map(e => {
        const period = [e.start_date, e.is_current ? 'idag' : e.end_date].filter(Boolean).join('–');
        const lines = [`${e.title}${e.organization ? ' på ' + e.organization : ''}${period ? ' (' + period + ')' : ''}`];
        if (e.description) lines.push(e.description);
        if (e.achievements?.length) lines.push('Prestationer: ' + e.achievements.join('; '));
        return lines.join('\n');
    }).join('\n\n') : '(ingen erfarenhet registrerad)';

    const eduText = edu.length ? edu.map(e =>
        `${e.degree}${e.field_of_study ? ', ' + e.field_of_study : ''}${e.institution ? ' – ' + e.institution : ''}${e.end_date ? ' (' + e.end_date + ')' : ''}`
    ).join('\n') : '(ingen utbildning registrerad)';

    const certsText = certs.length ? certs.map(c =>
        `${c.name}${c.issuer ? ', ' + c.issuer : ''}${c.date ? ' (' + c.date + ')' : ''}`
    ).join('\n') : '';

    const userPrompt = `Skriv ett professionellt kandidatporträtt på svenska, 300–400 ord.

Regler:
- Skriv i tredje person — använd konsekvent "kandidaten" som substantiv och "hen"/"hens" som pronomen
- Avslöja aldrig kön, ålder eller annan personlig information som kan identifiera personen
- Nämn inga specifika årtal som avslöjar ålder — beskriv erfarenhetslängd i relativa termer ("över tio år", "mångårig erfarenhet")
- Inled med en mening som sammanfattar vad kandidaten arbetar med och vad hen söker
- Väv in kompetenser och erfarenheter naturligt i löptext — inga punktlistor
- Lyft fram konkreta prestationer om sådana finns
- Avsluta med vad kandidaten söker: roll, ort, anställningsform och tillgänglighet
- Texten ska vara optimerad för semantisk matchning mot jobbannonser

--- KANDIDATDATA ---
Namn: ${kand.public_name || '(ej angivet)'}
Sökt roll/titel: ${kand.roles || '(ej angivet)'}
Önskad ort: ${kand.desired_city || '(ej angivet)'}
Anställningsform: ${(kand.desired_employment || []).join(', ') || '(ej angivet)'}
Arbetsplats: ${(kand.desired_workplace || []).join(', ') || '(ej angivet)'}
Kan pendla: ${kand.willing_to_commute ? 'Ja' : 'Nej'}
Tillgänglig från: ${kand.available_from || 'Omgående'}
Personlig beskrivning: ${kand.description || '(ingen beskrivning)'}
Personliga egenskaper: ${(kand.personal_qualities || []).join(', ') || '(ej angivet)'}

KOMPETENSER:
${skillsText}

ARBETSLIVSERFARENHET:
${expsText}

UTBILDNING:
${eduText}
${certsText ? '\nCERTIFIERINGAR:\n' + certsText : ''}`;

    const portrait = await cvAI.chat(
        'Du är en erfaren rekryteringskonsult som skriver professionella kandidatporträtt.',
        userPrompt,
        { temperature: 0.6 }
    );
    await cvDb.kandidater.update(kandidatId, { portrait });
    return portrait;
}

// DOM Elements (referenced across modules)
const optimizeBtn    = document.getElementById('optimize-btn');
const jobDescription = document.getElementById('job-description');
const charCount      = document.getElementById('char-count');
const optimizeResult = document.getElementById('optimize-result');

// ── State ─────────────────────────────────────────────────────────────────────
let selectedCV          = null;
let allCVs              = [];
let lastMatchResult     = null;
let lastJobDesc         = '';
let lastMatchKandidatId = null;
let lastMatchJobId      = null;   // Platsbanken job ID, if match was opened from job board
let lastMatchJobMeta    = null;   // { headline, employer, url, status: null|'saved'|'dismissed' }

let currentUser = null;
let authMode    = 'login';

let currentLang = localStorage.getItem('lang') || 'sv';

let spEditingSkillId  = null, spEditingExpId   = null,
    spEditingEduId    = null, spEditingCertId  = null;
let kandEditingSkillId = null, kandEditingExpId = null,
    kandEditingEduId  = null, kandEditingCertId = null;

let cachedSpSkills   = [], cachedSpExps   = [], cachedSpEdu   = [], cachedSpCerts   = [];
let cachedKandSkills = [], cachedKandExps = [], cachedKandEdu = [], cachedKandCerts = [];

// ── i18n ──────────────────────────────────────────────────────────────────────
function t(key) {
    const lang = TRANSLATIONS[currentLang] || TRANSLATIONS['sv'];
    const fallback = TRANSLATIONS['sv'];
    return lang[key] ?? fallback[key] ?? key;
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPh);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.querySelectorAll('#sidebar-language, #auth-language, #account-language').forEach(sel => {
        sel.value = currentLang;
    });
    if (typeof updateMatchWarning === 'function') updateMatchWarning();
}

async function setLanguage(lang, persist = true) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    applyTranslations();
    if (document.getElementById('view-welcomepage')?.classList.contains('active')) {
        loadWelcomePage();
    }
    if (persist) {
        try { await cvDb.settings.set('language', lang); } catch { /* ignore */ }
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
const esc = v => (v == null ? '' : String(v)).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── LocalResponse — mimics fetch Response ────────────────────────────────────
class LocalResponse {
    constructor(data, status = 200) {
        this.status = status;
        this.ok     = status >= 200 && status < 300;
        this._data  = data;
    }
    async json() { return this._data; }
    async text() { return JSON.stringify(this._data); }
}

// ── Upload zone component ─────────────────────────────────────────────────────
// ── In-memory job analysis cache (session-scoped) ─────────────────────────────
const _jobAnalysisCache = new Map();
function _jobCacheKey(text) { return text.slice(0, 120); }
async function _getStructuredJob(title, description) {
    const key = _jobCacheKey(description);
    if (_jobAnalysisCache.has(key)) return _jobAnalysisCache.get(key);
    const structured = await cvAI.analyzeJob(title || '', description);
    _jobAnalysisCache.set(key, structured);
    return structured;
}

const _skillContextCache = new Map();
function _skillContextKey(skillName, jobDesc) { return `${skillName}__${jobDesc.slice(0, 80)}`; }

async function _showContextModal({ name, addLabel, addFnName, showLevel = false }) {
    const existing = document.getElementById('skill-context-modal');
    if (existing) existing.remove();

    const escapedName = name.replace(/'/g, "\\'");
    const levelSelect = showLevel ? `
        <select id="skill-add-level" class="form-input" style="max-width:160px;font-size:13px">
            <option value="Känner till">${t('skill.level_1')}</option>
            <option value="Grundläggande">${t('skill.level_2')}</option>
            <option value="Erfaren">${t('skill.level_3')}</option>
            <option value="Mycket erfaren">${t('skill.level_4')}</option>
        </select>` : '';

    const modal = document.createElement('div');
    modal.id = 'skill-context-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeSkillContextModal()"></div>
        <div class="modal-content" style="max-width:540px">
            <div class="modal-header">
                <h2>${esc(name)}</h2>
                <button class="modal-close" onclick="closeSkillContextModal()"><span class="material-icons">close</span></button>
            </div>
            <div class="modal-body" id="skill-context-body">
                <div style="display:flex;align-items:center;gap:10px;color:var(--text-muted)">
                    <span class="spinner-small"></span>${t('modal.fetching_context')}
                </div>
            </div>
            <div class="modal-footer">
                <span id="skill-add-feedback" class="skill-add-feedback"></span>
                ${addLabel ? `${levelSelect}<button id="skill-add-btn" class="btn btn-primary btn-sm"
                    onclick="${addFnName}('${escapedName}')">
                    ${esc(addLabel)}
                </button>` : ''}
            </div>
        </div>`;
    modal.classList.add('modal');
    document.body.appendChild(modal);

    const cacheKey = _skillContextKey(name, lastJobDesc);
    try {
        let data = _skillContextCache.get(cacheKey);
        if (!data) {
            data = await cvAI.explainRequiredSkill(name, lastJobDesc);
            _skillContextCache.set(cacheKey, data);
        }
        document.getElementById('skill-context-body').innerHTML = `
            <div class="skill-context-excerpt">${esc(data.excerpt || '')}</div>
            ${data.summary ? `<p style="margin:12px 0 0;font-size:0.875rem;color:var(--text-secondary)">${esc(data.summary)}</p>` : ''}`;
    } catch (err) {
        document.getElementById('skill-context-body').innerHTML =
            `<p style="color:var(--danger)">${t('modal.context_error')} ${esc(err.message)}</p>`;
    }
}

function showSkillContextModal(skillName) {
    return _showContextModal({
        name: skillName,
        addLabel: t('modal.add_skill'),
        addFnName: 'addSkillFromContextModal',
        showLevel: true,
    });
}

function showQualityContextModal(qualityName, canAdd = true) {
    return _showContextModal({
        name: qualityName,
        addLabel: canAdd ? t('modal.add_quality') : null,
        addFnName: 'addQualityFromContextModal',
    });
}

async function addSkillFromContextModal(skillName) {
    const btn      = document.getElementById('skill-add-btn');
    const feedback = document.getElementById('skill-add-feedback');
    if (!btn) return;
    const level = document.getElementById('skill-add-level')?.value || 'Känner till';
    btn.disabled = true;
    btn.textContent = '…';
    try {
        const url = lastMatchKandidatId
            ? `${API_BASE_URL}/kandidater/${lastMatchKandidatId}/bank/skills`
            : `${API_BASE_URL}/competence/skills`;
        const res = await apiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skill_name: skillName, category: '', skill_level: level }),
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.detail || t('modal.cannot_add')); }
        btn.remove();
        document.getElementById('skill-add-level')?.remove();
        feedback.innerHTML = `<span class="material-icons" style="font-size:1rem;vertical-align:middle;margin-right:2px">check</span>${t('modal.added_to_profile')}`;
        feedback.style.color = 'var(--green)';
    } catch (err) {
        btn.disabled = false;
        btn.textContent = t('modal.add_skill');
        feedback.textContent = t('modal.error_prefix') + ' ' + err.message;
        feedback.style.color = 'var(--danger)';
    }
}

async function addQualityFromContextModal(qualityName) {
    const btn      = document.getElementById('skill-add-btn');
    const feedback = document.getElementById('skill-add-feedback');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = '…';
    try {
        const kandidatId = lastMatchKandidatId || (await _getOwnKandidatId());
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}`);
        if (!res.ok) throw new Error(t('modal.cannot_fetch_candidate'));
        const kand = await res.json();
        const existing = kand.personal_qualities || [];
        if (!existing.includes(qualityName)) {
            const putRes = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ personal_qualities: [...existing, qualityName] }),
            });
            if (!putRes.ok) throw new Error(t('modal.cannot_save'));
            // Synka minnescachen om egenprofil
            if (!lastMatchKandidatId) {
                _spQualities = [...existing, qualityName];
            }
        }
        btn.remove();
        feedback.innerHTML = `<span class="material-icons" style="font-size:1rem;vertical-align:middle;margin-right:2px">check</span>${t('modal.added_to_profile')}`;
        feedback.style.color = 'var(--green)';
    } catch (err) {
        btn.disabled = false;
        btn.textContent = t('modal.add_quality');
        feedback.textContent = t('modal.error_prefix') + ' ' + err.message;
        feedback.style.color = 'var(--danger)';
    }
}

function closeSkillContextModal() {
    document.getElementById('skill-context-modal')?.remove();
}

const CV_FILE_EXTS   = ['pdf', 'docx', 'txt', 'md'];
const CV_FILE_ACCEPT = '.pdf,.docx,.txt,.md';
const CV_MAX_SIZE    = 10 * 1024 * 1024; // 10 MB

const _MIME_MAP = {
    pdf:  'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt:  'text/plain',
    md:   'text/markdown',
};
function skillLevelClass(level) {
    if (level === 'Känner till')    return 'chip-level-1';
    if (level === 'Grundläggande')  return 'chip-level-2';
    if (level === 'Erfaren')        return 'chip-level-3';
    if (level === 'Mycket erfaren') return 'chip-level-4';
    return 'chip-technical';
}

function mimeTypeForFilename(filename) {
    const ext = (filename || '').toLowerCase().split('.').pop();
    return _MIME_MAP[ext] || 'application/octet-stream';
}

const _MONTH_NAMES = {
    jan:1,feb:2,mar:3,apr:4,maj:5,jun:6,jul:7,aug:8,sep:9,okt:10,nov:11,dec:12,
    may:5,oct:10,
    januari:1,februari:2,mars:3,april:4,juni:6,juli:7,augusti:8,september:9,oktober:10,november:11,december:12,
    january:1,february:2,march:3,august:8,october:10,
    januar:1,februar:2,mai:5,
};
function normDate(d) {
    if (!d) return null;
    const s = String(d).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    if (/^\d{4}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
    const mmy = s.match(/^([A-Za-zÀ-ÿ]+)[.\s]+(\d{4})$/);
    if (mmy) {
        const m = _MONTH_NAMES[mmy[1].toLowerCase()];
        return m ? `${mmy[2]}-${String(m).padStart(2,'0')}` : mmy[2];
    }
    const msy = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (msy) return `${msy[2]}-${String(msy[1]).padStart(2,'0')}`;
    return s;
}

function stripContactInfo(text) {
    return text
        .replace(/\b\d{6,8}[-+]\d{4}\b/g, '[PERSONNR]')
        .replace(/[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,}/g, '[E-POST]')
        .replace(/\+46[\s\-]?\d[\d\s\-]{6,11}/g, '[TELEFON]')
        .replace(/\b07\d(?:[\s\-]?\d){7}\b/g, '[TELEFON]')
        .replace(/\b0\d{1,3}[-\s]\d{2,4}[-\s]\d{2}[-\s]\d{2}\b/g, '[TELEFON]');
}

let _cvReviewCallback = null;

async function showCVReviewModal(text, filename, onConfirm) {
    _cvReviewCallback = onConfirm;
    const existing = document.getElementById('cv-review-modal');
    if (existing) existing.remove();
    const hasAi = await isAiConfigured();
    const modal = document.createElement('div');
    modal.id = 'cv-review-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeCVReviewModal()"></div>
        <div class="modal-content modal-content--wide" style="max-height:90vh">
            <div class="modal-header">
                <div>
                    <h2 style="margin:0 0 2px">${t('cv.review_title')}</h2>
                    <div style="font-size:0.8125rem;color:var(--text-muted)">${esc(filename)}</div>
                </div>
                <button class="modal-close" onclick="closeCVReviewModal()"><span class="material-icons">close</span></button>
            </div>
            <div class="modal-body" style="display:flex;flex-direction:column;gap:1rem">
                <div class="cv-review-info">
                    <span class="material-icons cv-review-icon">warning_amber</span>
                    <span>${t('cv.review_info')}</span>
                </div>
                <textarea id="cv-review-text" class="form-input cv-review-textarea"></textarea>
                <div style="display:flex;gap:0.75rem;justify-content:flex-end">
                    <button class="btn btn-secondary" onclick="closeCVReviewModal()">${t('common.cancel')}</button>
                    <button class="btn btn-primary" onclick="confirmCVReview()" ${hasAi ? '' : 'disabled title="' + t('match.no_llm_short') + '"'}><span class="material-icons" style="font-size:1rem;vertical-align:middle;margin-right:4px">psychology</span>${t('cv.review_confirm')}</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('cv-review-text').value = text;
}


function closeCVReviewModal() {
    const modal = document.getElementById('cv-review-modal');
    if (modal) modal.remove();
    _cvReviewCallback = null;
}

function confirmCVReview() {
    const text = document.getElementById('cv-review-text')?.value ?? '';
    const cb = _cvReviewCallback;
    closeCVReviewModal();
    if (cb) cb(text);
}

/**
 * Wire up a file drop zone: drag-and-drop + click-to-browse.
 * Validates file extension and size before calling onFile(file).
 * @param {{ areaId: string, inputId: string, onFile: (File) => void, statusFn?: (msg, type) => void }} config
 */
function setupUploadZone({ areaId, inputId, onFile, statusFn }) {
    const area  = document.getElementById(areaId);
    const input = document.getElementById(inputId);
    if (!area || !input) return;

    input.accept = CV_FILE_ACCEPT;

    function validate(file) {
        const ext = (file.name.toLowerCase().split('.').pop()) || '';
        if (!CV_FILE_EXTS.includes(ext)) {
            statusFn?.(`Filformatet .${ext} stöds inte. Tillåtna format: ${CV_FILE_ACCEPT}`, 'error');
            return false;
        }
        if (file.size > CV_MAX_SIZE) {
            statusFn?.(t('upload.file_size_error'), 'error');
            return false;
        }
        return true;
    }

    area.addEventListener('dragover',  e => { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
    area.addEventListener('drop', e => {
        e.preventDefault();
        area.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && validate(file)) onFile(file);
    });
    input.addEventListener('change', () => {
        const file = input.files[0];
        if (file && validate(file)) onFile(file);
        input.value = '';
    });

    // ── Paste-text toggle ───────────────────────────────────────────────────────
    const toggle = document.createElement('div');
    toggle.className = 'paste-toggle';
    toggle.innerHTML = `
        <button class="paste-toggle-btn" type="button">
            <span class="material-icons" style="font-size:16px;vertical-align:middle">content_paste</span>
            ${t('upload.paste_btn')}
        </button>
        <div class="paste-toggle-body">
            <textarea class="paste-textarea" placeholder="${t('upload.paste_ph')}" rows="8"></textarea>
            <div class="paste-toggle-actions">
                <button class="btn btn-primary btn-sm paste-submit-btn" type="button">${t('upload.paste_submit')}</button>
                <button class="btn btn-ghost btn-sm paste-cancel-btn" type="button">${t('common.cancel')}</button>
            </div>
        </div>`;
    area.insertAdjacentElement('afterend', toggle);

    const btn      = toggle.querySelector('.paste-toggle-btn');
    const body     = toggle.querySelector('.paste-toggle-body');
    const textarea = toggle.querySelector('.paste-textarea');
    const submit   = toggle.querySelector('.paste-submit-btn');
    const cancel   = toggle.querySelector('.paste-cancel-btn');

    btn.addEventListener('click', () => {
        const open = toggle.classList.toggle('open');
        if (open) textarea.focus();
    });
    cancel.addEventListener('click', () => {
        toggle.classList.remove('open');
        textarea.value = '';
    });
    submit.addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) return;
        const file = new File([text], 'inklistat.txt', { type: 'text/plain' });
        toggle.classList.remove('open');
        textarea.value = '';
        onFile(file);
    });
}

// ── Skill drag-and-drop (shared utility) ─────────────────────────────────────
function setupSkillDragDrop(container, onCategoryChange) {
    let dragId = null;
    let dragOrigCat = null;

    container.addEventListener('dragstart', e => {
        const chip = e.target.closest('[data-skill-id]');
        if (!chip) { e.preventDefault(); return; }
        dragId = Number(chip.dataset.skillId);
        dragOrigCat = chip.dataset.skillCat;
        chip.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    container.addEventListener('dragend', () => {
        container.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    container.addEventListener('dragover', e => {
        const zone = e.target.closest('.skill-drop-zone');
        if (!zone) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        zone.classList.add('drag-over');
    });

    container.addEventListener('dragleave', e => {
        const zone = e.target.closest('.skill-drop-zone');
        if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });

    container.addEventListener('drop', async e => {
        e.preventDefault();
        const zone = e.target.closest('.skill-drop-zone');
        if (!zone || dragId === null) return;
        const newCat = zone.dataset.catDropZone;
        zone.classList.remove('drag-over');
        if (newCat === dragOrigCat) return;
        const id = dragId;
        dragId = null; dragOrigCat = null;
        await onCategoryChange(id, newCat);
    });
}

// ── Category combo box ────────────────────────────────────────────────────────
(function () {
    const CATS = [
        'Mjukvaruutveckling', 'Frameworks & APIs', 'Databases',
        'Cloud & DevOps', 'AI & Machine Learning', 'Frontend',
        'Tools', 'Soft Skills', 'Languages', 'Övrigt',
    ];
    let activeInput = null;

    // Lazily wrap input in a positioned container so the dropdown
    // is part of normal document flow — no fixed/absolute-to-body tricks needed.
    function getWrap(input) {
        if (input.parentElement.classList.contains('cat-combo-wrap')) {
            return input.parentElement;
        }
        const wrap = document.createElement('div');
        wrap.className = 'cat-combo-wrap';
        // Preserve flex sizing from input when it sits inside a flex row
        if (input.style.flex)     wrap.style.flex     = input.style.flex;
        if (input.style.minWidth) wrap.style.minWidth = input.style.minWidth;
        input.style.flex = input.style.minWidth = '';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);
        return wrap;
    }

    function getDD(input) {
        const wrap = getWrap(input);
        let dd = wrap.querySelector('.cat-combo-dd');
        if (!dd) {
            dd = document.createElement('div');
            dd.className = 'cat-combo-dd';
            wrap.appendChild(dd);
        }
        return dd;
    }

    async function getAllCats() {
        const userCats = [];
        try {
            const own = await cvDb.kandidater.getOwn();
            if (own) {
                const ownSkills = await cvDb.kandSkills.listFor(own.id);
                ownSkills.forEach(s => s.category && userCats.push(s.category));
            }
            const all = await cvDb.kandidater.list();
            for (const k of all.filter(k => k.profile_type !== 'egenprofil')) {
                const ks = await cvDb.kandSkills.listFor(k.id);
                ks.forEach(s => s.category && userCats.push(s.category));
            }
        } catch { /* silent */ }
        return [...new Set([...CATS, ...userCats])].sort((a, b) => a.localeCompare(b, 'sv'));
    }

    async function render(input) {
        const dd   = getDD(input);
        const f    = (input.value || '').toLowerCase();
        const cats = await getAllCats();
        if (activeInput !== input) return; // blurred while loading — don't show
        const hits = cats.filter(c => !f || c.toLowerCase().includes(f));
        if (!hits.length) { dd.classList.remove('cat-combo-dd--open'); return; }
        dd.innerHTML = hits.map(c => `<div class="cat-combo-opt">${c}</div>`).join('');
        dd.classList.add('cat-combo-dd--open');
    }

    function close() {
        if (activeInput) {
            const dd = activeInput.parentElement.querySelector('.cat-combo-dd');
            if (dd) dd.classList.remove('cat-combo-dd--open');
        }
        activeInput = null;
    }

    function isCat(el) { return el && el.hasAttribute && el.hasAttribute('data-cat-combo'); }

    document.addEventListener('focus', e => {
        if (!isCat(e.target)) return;
        activeInput = e.target;
        render(e.target);
    }, true);

    document.addEventListener('input', e => {
        if (isCat(e.target) && activeInput === e.target) render(e.target);
    });

    document.addEventListener('blur', e => {
        if (isCat(e.target)) setTimeout(close, 150);
    }, true);

    document.addEventListener('click', e => {
        const opt = e.target.closest('.cat-combo-opt');
        if (opt && activeInput) {
            activeInput.value = opt.textContent;
            activeInput.dispatchEvent(new Event('input', { bubbles: true }));
            close();
            return;
        }
        if (!isCat(e.target)) close();
    });

    document.addEventListener('keydown', e => {
        if (!activeInput) return;
        const dd = activeInput.parentElement.querySelector('.cat-combo-dd');
        if (!dd || !dd.classList.contains('cat-combo-dd--open')) return;
        const opts = [...dd.querySelectorAll('.cat-combo-opt')];
        const cur  = dd.querySelector('.cat-combo-opt--active');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = cur ? (opts[opts.indexOf(cur) + 1] || opts[0]) : opts[0];
            opts.forEach(o => o.classList.remove('cat-combo-opt--active'));
            if (next) next.classList.add('cat-combo-opt--active');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = cur ? (opts[opts.indexOf(cur) - 1] || opts[opts.length - 1]) : opts[opts.length - 1];
            opts.forEach(o => o.classList.remove('cat-combo-opt--active'));
            if (prev) prev.classList.add('cat-combo-opt--active');
        } else if (e.key === 'Enter' && cur) {
            e.preventDefault();
            activeInput.value = cur.textContent;
            activeInput.dispatchEvent(new Event('input', { bubbles: true }));
            close();
        } else if (e.key === 'Escape') {
            close();
        }
    });
})();

// ── Own-profile kandidat ID (cached after first lookup) ───────────────────────
let _ownKandidatId = null;
let _ownKandidatIdPromise = null;

async function _getOwnKandidatId() {
    if (_ownKandidatId) return _ownKandidatId;
    if (!_ownKandidatIdPromise) _ownKandidatIdPromise = _resolveOwnKandidatId();
    return _ownKandidatIdPromise;
}

async function _resolveOwnKandidatId() {
    let own = await cvDb.kandidater.getOwn();
    if (own) {
        _ownKandidatId = own.id;
        return own.id;
    }

    // First run — create own-profile kandidat from existing profile data
    const profile = await cvDb.profile.get() || {};
    const newKand = await cvDb.kandidater.add({
        public_name:        profile.public_name || 'Användare',
        email:              profile.email       || null,
        public_phone:       profile.public_phone || null,
        desired_city:       profile.desired_city       || null,
        desired_employment: profile.desired_employment || [],
        desired_workplace:  profile.desired_workplace  || [],
        willing_to_commute: profile.willing_to_commute || false,
        searchable:         profile.searchable         || false,
        available_from:     profile.available_from     || null,
        description:        profile.description        || null,
        profile_type:     'egenprofil',
    });
    _ownKandidatId = newKand.id;

    // Migrate flat competence data (only if flat stores have content)
    const [flatSkills, flatExps, flatCvs] = await Promise.all([
        cvDb.skills.list(),
        cvDb.experiences.list(),
        cvDb.cvs.list(),
    ]);

    for (const s of flatSkills) {
        await cvDb.kandSkills.add(_ownKandidatId, {
            skill_name: s.skill_name,
            category:   s.category   || 'Övrigt',
            skill_level: null,
        });
    }
    for (const e of flatExps) {
        if (e.experience_type === 'work' || e.experience_type === 'project') {
            await cvDb.kandExperiences.add(_ownKandidatId, {
                title: e.title, organization: e.organization || null,
                experience_type: e.experience_type,
                start_date: normDate(e.start_date), end_date: normDate(e.end_date),
                is_current: e.is_current || false,
                description: e.description || null, achievements: e.achievements || [],
            });
        } else if (e.experience_type === 'education') {
            await cvDb.kandEducation.add(_ownKandidatId, {
                degree:         e.degree         || e.title        || '',
                institution:    e.institution    || e.organization || null,
                field_of_study: e.field_of_study || null,
                start_date:     e.start_date     || null,
                end_date:       e.end_date       || null,
                description:    null,
            });
        } else if (e.experience_type === 'certification') {
            await cvDb.kandCertifications.add(_ownKandidatId, {
                name:   e.name   || e.title        || '',
                issuer: e.issuer || e.organization || null,
                date:   e.date   || e.start_date   || null,
                description: null,
            });
        }
    }
    for (const cv of flatCvs) {
        await cvDb.kandCvs.add(_ownKandidatId, {
            filename:            cv.filename,
            title:               cv.title || cv.filename,
            is_processed:        true,
            mime_type:           mimeTypeForFilename(cv.filename),
            structured_data:     cv.structured_data  || null,
            file_data:           cv.file_data         || null,
            skill_count:         (cv.structured_data?.skills         || []).length,
            experience_count:    (cv.structured_data?.work_experience || []).length,
            education_count:     (cv.structured_data?.education       || []).length,
            certification_count: (cv.structured_data?.certifications  || []).length,
        });
    }

    return _ownKandidatId;
}

// ── Browser Router (replaces all HTTP API calls) ──────────────────────────────
async function browserRoute(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    let body = null;
    if (options.body) {
        if (typeof options.body === 'string') {
            try { body = JSON.parse(options.body); } catch { body = {}; }
        } else if (options.body instanceof FormData) {
            body = options.body; // handled per-route
        } else {
            body = options.body;
        }
    }

    const parts = path.replace(/^\/|\/$/g, '').split('/');
    // parts[0] = 'auth' | 'competence' | 'cv' | 'profiles' | 'sokprofil' | 'kandidater'

    try {
        // ── AUTH ────────────────────────────────────────────────────────────
        if (parts[0] === 'auth') {
            if (parts[1] === 'me' && method === 'GET') {
                const p    = await cvDb.profile.get();
                const lang = await cvDb.settings.get('language');
                const own  = await cvDb.kandidater.getOwn();
                return new LocalResponse({
                    id: 1,
                    name:     p?.public_name   || own?.public_name || 'Användare',
                    email:    p?.email         || own?.email       || '',
                    phone:    p?.public_phone  || '',
                    address:  p?.address       || '',
                    language: lang             || currentLang,
                    roles: [],
                });
            }
            if (parts[1] === 'me' && method === 'PUT') {
                const profile = await cvDb.profile.get() || {};
                const profileUpdates = {};
                if (body?.language) await cvDb.settings.set('language', body.language);
                if (body?.name !== undefined)    profileUpdates.public_name  = body.name;
                if (body?.email !== undefined)   profileUpdates.email        = body.email;
                if (body?.phone !== undefined)   profileUpdates.public_phone = body.phone;
                if (body?.address !== undefined) profileUpdates.address      = body.address;
                if (body?.roles) await cvDb.settings.set('user_roles', JSON.stringify(body.roles));
                if (Object.keys(profileUpdates).length) {
                    await cvDb.profile.save({ ...profile, ...profileUpdates });
                }
                const roles = body?.roles ?? currentUser?.roles ?? [];
                const user = {
                    id: 1,
                    name:     body?.name     ?? currentUser?.name    ?? 'Användare',
                    email:    body?.email    ?? currentUser?.email   ?? '',
                    phone:    body?.phone    ?? currentUser?.phone   ?? '',
                    address:  body?.address  ?? currentUser?.address ?? '',
                    language: body?.language ?? currentUser?.language ?? 'sv',
                    roles,
                };
                currentUser = user;
                return new LocalResponse(user);
            }
            if (parts[1] === 'me' && parts[2] === 'password') {
                return new LocalResponse({});  // no-op in browser-only
            }
            if (parts[1] === 'login' || parts[1] === 'register') {
                return new LocalResponse({ id: 1, name: 'Användare', email: '', roles: [] });
            }
            if (parts[1] === 'logout') return new LocalResponse({});
        }

        // ── CV ──────────────────────────────────────────────────────────────
        if (parts[0] === 'cv') {
            if (method === 'GET' && !parts[1]) {
                const list = await cvDb.cvs.list();
                return new LocalResponse(list);
            }
            if (method === 'POST' && parts[1] === 'upload') {
                const file = body.get('file');
                if (!file) return new LocalResponse({ detail: 'Ingen fil' }, 400);
                const text = await cvPdf.extractText(file);
                const structured = await cvAI.structureCV(text);
                const cv = await cvDb.cvs.add({
                    filename: file.name,
                    title: structured?.personal_info?.full_name || file.name.replace('.pdf', ''),
                    original_text: text,
                    structured_data: structured,
                });
                await cvCompSvc.mergeCVIntoBank(cv);
                return new LocalResponse({ ...cv, structured_data: structured });
            }
            if (method === 'DELETE' && parts[1]) {
                await cvDb.cvs.delete(Number(parts[1]));
                return new LocalResponse({});
            }
            if (method === 'PUT' && parts[2] === 'title') {
                await cvDb.cvs.updateTitle(Number(parts[1]), body.title);
                return new LocalResponse({});
            }
        }

        // ── COMPETENCE ── (delegerar till kand_* via ownId) ──────────────────────
        if (parts[0] === 'competence') {
            const ownId = await _getOwnKandidatId();

            // CVs
            if (parts[1] === 'cvs') {
                if (!parts[2] && method === 'GET') {
                    const list = await cvDb.kandCvs.listFor(ownId);
                    return new LocalResponse(list.map(cv => {
                        const sd = cv.structured_data || {};
                        return { ...cv,
                            is_processed: Boolean(sd && Object.keys(sd).length),
                            is_vectorized: false,
                            skill_count:         (sd.skills          || []).length,
                            experience_count:    (sd.work_experience || []).length,
                            education_count:     (sd.education       || []).length,
                            certification_count: (sd.certifications  || []).length,
                        };
                    }));
                }
                if (parts[2] === 'upload' && method === 'POST') {
                    const file = body instanceof FormData ? body.get('file') : null;
                    if (!file) return new LocalResponse({ detail: 'Ingen fil' }, 400);
                    const reviewedText = body instanceof FormData ? (body.get('reviewed_text') || '') : '';
                    const [text, fileData] = await Promise.all([
                        reviewedText ? Promise.resolve(reviewedText) : cvPdf.extractText(file),
                        file.arrayBuffer(),
                    ]);
                    const structured = await cvAI.structureCV(text);
                    const mergeResult = await cvCompSvc.mergeCVIntoBankForKandid(ownId, { structured_data: structured, filename: file.name });
                    const cv = await cvDb.kandCvs.add(ownId, {
                        filename: file.name, is_processed: true,
                        mime_type: mimeTypeForFilename(file.name),
                        structured_data: structured, file_data: fileData,
                        skill_count:         mergeResult.skills_added,
                        experience_count:    (structured?.work_experience || []).length,
                        education_count:     (structured?.education       || []).length,
                        certification_count: (structured?.certifications  || []).length,
                    });
                    return new LocalResponse({ ...cv, is_processed: true, is_vectorized: false, structured_data: structured });
                }
                if (parts[2] && parts[3] === 'vectorize' && method === 'POST') {
                    return new LocalResponse({ message: 'Vektorisering inte tillgänglig i browser-läge' });
                }
                if (parts[2] && parts[3] === 'title' && (method === 'PUT' || method === 'PATCH')) {
                    const updated = await cvDb.kandCvs.updateTitle(Number(parts[2]), body.title);
                    return new LocalResponse(updated);
                }
                if (parts[2] && !parts[3] && method === 'DELETE') {
                    await cvDb.kandCvs.delete(Number(parts[2]));
                    return new LocalResponse({});
                }
            }

            // stats
            if (parts[1] === 'stats') {
                const [skillList, expList, eduList, certList, cvList] = await Promise.all([
                    cvDb.kandSkills.listFor(ownId),
                    cvDb.kandExperiences.listFor(ownId),
                    cvDb.kandEducation.listFor(ownId),
                    cvDb.kandCertifications.listFor(ownId),
                    cvDb.kandCvs.listFor(ownId),
                ]);
                const by_category = {};
                for (const s of skillList) {
                    const cat = s.category || 'Okategoriserad';
                    by_category[cat] = (by_category[cat] || 0) + 1;
                }
                return new LocalResponse({
                    total_skills:           skillList.length,
                    total_experiences:      expList.filter(e => e.experience_type === 'work').length,
                    total_source_documents: cvList.length,
                    skills_by_category:     by_category,
                    total_education:        eduList.length,
                    total_certifications:   certList.length,
                });
            }

            // skills CRUD
            if (parts[1] === 'skills' && !parts[2]) {
                if (method === 'GET')    return new LocalResponse({ skills: await cvDb.kandSkills.listFor(ownId) });
                if (method === 'POST')   return new LocalResponse(await cvDb.kandSkills.add(ownId, body));
                if (method === 'DELETE') { await cvDb.kandSkills.deleteAll(ownId); return new LocalResponse({}); }
            }
            if (parts[1] === 'skills' && parts[2]) {
                const id = Number(parts[2]);
                if (method === 'PUT')    return new LocalResponse(await cvDb.kandSkills.update(id, body));
                if (method === 'DELETE') { await cvDb.kandSkills.delete(id); return new LocalResponse({}); }
            }

            // experiences CRUD (work + project)
            if (parts[1] === 'experiences' && !parts[2]) {
                if (method === 'GET') {
                    const all = await cvDb.kandExperiences.listFor(ownId);
                    return new LocalResponse({ experiences: all.filter(e => e.experience_type === 'work' || e.experience_type === 'project') });
                }
                if (method === 'POST') return new LocalResponse(await cvDb.kandExperiences.add(ownId, body));
                if (method === 'DELETE') {
                    const all = await cvDb.kandExperiences.listFor(ownId);
                    for (const e of all.filter(e => e.experience_type === 'work' || e.experience_type === 'project'))
                        await cvDb.kandExperiences.delete(e.id);
                    return new LocalResponse({});
                }
            }
            if (parts[1] === 'experiences' && parts[2] === 'merge' && method === 'POST') {
                const ids = body.experience_ids || [];
                const all = await cvDb.kandExperiences.listFor(ownId);
                const exps = all.filter(e => ids.includes(e.id));
                const merged = await cvAI.mergeExperiences(exps);
                const allRelatedSkills = [...new Set(exps.flatMap(e => e.related_skills || []))];
                const newExp = await cvDb.kandExperiences.add(ownId, { ...merged, related_skills: allRelatedSkills });
                for (const id of ids) await cvDb.kandExperiences.delete(Number(id));
                return new LocalResponse({ merged_count: ids.length, title: newExp.title, id: newExp.id });
            }
            if (parts[1] === 'experiences' && parts[2] && !parts[3]) {
                const id = Number(parts[2]);
                if (method === 'PUT')    return new LocalResponse(await cvDb.kandExperiences.update(id, body));
                if (method === 'DELETE') { await cvDb.kandExperiences.delete(id); return new LocalResponse({}); }
            }
            if (parts[1] === 'experiences' && parts[2] && parts[3]) {
                const id = Number(parts[2]);
                const sub = parts[3];
                if (sub === 'achievements') {
                    if (!parts[4]) {
                        if (method === 'POST') return new LocalResponse(await cvDb.kandExperiences.addAchievement(id, body.text));
                        if (method === 'PUT')  return new LocalResponse(await cvDb.kandExperiences.replaceAchievements(id, body.achievements));
                    } else {
                        const idx = Number(parts[4]);
                        if (method === 'PUT')    return new LocalResponse(await cvDb.kandExperiences.updateAchievement(id, idx, body.text));
                        if (method === 'DELETE') return new LocalResponse(await cvDb.kandExperiences.deleteAchievement(id, idx));
                    }
                }
                if (sub === 'improve-achievements' && method === 'POST') {
                    const exp = await cvDb.kandExperiences.get(id);
                    const improved = await cvAI.improveAchievements(exp.achievements || [], exp.title, exp.organization);
                    await cvDb.kandExperiences.replaceAchievements(id, improved);
                    return new LocalResponse({ achievements: improved });
                }
                if (sub === 'description' && method === 'PUT') {
                    return new LocalResponse(await cvDb.kandExperiences.updateDescription(id, body.description));
                }
                if (sub === 'period' && method === 'PUT') {
                    return new LocalResponse(await cvDb.kandExperiences.updatePeriod(id, body));
                }
                if (sub === 'skills') {
                    if (!parts[4]) {
                        if (method === 'POST') return new LocalResponse(await cvDb.kandExperiences.addSkill(id, body.skill_name));
                    } else {
                        if (method === 'DELETE') return new LocalResponse(await cvDb.kandExperiences.removeSkill(id, Number(parts[4])));
                    }
                }
            }

            // education
            if (parts[1] === 'education' && !parts[2]) {
                if (method === 'GET') {
                    const all = await cvDb.kandEducation.listFor(ownId);
                    return new LocalResponse({ education: all.map(e => ({ ...e,
                        degree:         e.degree         || '',
                        institution:    e.institution    || '',
                        field_of_study: e.field_of_study || null,
                    })) });
                }
                if (method === 'POST') {
                    const rec = {
                        degree:         body.degree         || body.title        || '',
                        institution:    body.institution    || body.organization || null,
                        field_of_study: body.field_of_study || null,
                        start_date:     body.start_date     || null,
                        end_date:       body.end_date       || null,
                        description:    body.description    || null,
                    };
                    return new LocalResponse(await cvDb.kandEducation.add(ownId, rec));
                }
                if (method === 'DELETE') { await cvDb.kandEducation.deleteAll(ownId); return new LocalResponse({}); }
            }
            if (parts[1] === 'education' && parts[2]) {
                const id = Number(parts[2]);
                if (method === 'PUT') {
                    const upd = { ...body,
                        degree:      body.degree      || body.title        || '',
                        institution: body.institution || body.organization || null };
                    return new LocalResponse(await cvDb.kandEducation.update(id, upd));
                }
                if (method === 'DELETE') { await cvDb.kandEducation.delete(id); return new LocalResponse({}); }
            }

            // certifications
            if (parts[1] === 'certifications' && !parts[2]) {
                if (method === 'GET') {
                    const all = await cvDb.kandCertifications.listFor(ownId);
                    return new LocalResponse({ certifications: all.map(e => ({ ...e,
                        name:   e.name   || '',
                        issuer: e.issuer || '',
                        date:   e.date   || null,
                    })) });
                }
                if (method === 'POST') {
                    const rec = {
                        name:        body.name   || body.title        || '',
                        issuer:      body.issuer || body.organization || null,
                        date:        body.date   || body.start_date   || null,
                        description: body.description || null,
                    };
                    return new LocalResponse(await cvDb.kandCertifications.add(ownId, rec));
                }
                if (method === 'DELETE') { await cvDb.kandCertifications.deleteAll(ownId); return new LocalResponse({}); }
            }
            if (parts[1] === 'certifications' && parts[2]) {
                const id = Number(parts[2]);
                if (method === 'PUT') {
                    const upd = { ...body,
                        name:   body.name   || body.title        || '',
                        issuer: body.issuer || body.organization || null,
                        date:   body.date   || body.start_date   || null };
                    return new LocalResponse(await cvDb.kandCertifications.update(id, upd));
                }
                if (method === 'DELETE') { await cvDb.kandCertifications.delete(id); return new LocalResponse({}); }
            }

            // reset
            if (parts[1] === 'reset' && method === 'DELETE') {
                await cvDb.kandSkills.deleteAll(ownId);
                await cvDb.kandExperiences.deleteAll(ownId);
                await cvDb.kandEducation.deleteAll(ownId);
                await cvDb.kandCertifications.deleteAll(ownId);
                return new LocalResponse({});
            }

            // merge CV into bank
            if (parts[1] === 'merge' && parts[2] && method === 'POST') {
                const cv = await cvDb.kandCvs.get(Number(parts[2]));
                if (!cv) return new LocalResponse({ detail: 'CV hittades inte' }, 404);
                const result = await cvCompSvc.mergeCVIntoBankForKandid(ownId, cv);
                return new LocalResponse(result);
            }

            // merge-all
            if (parts[1] === 'merge-all' && method === 'POST') {
                const result = await cvCompSvc.mergeAllCVsForKandid(ownId);
                return new LocalResponse(result);
            }

            // fetch-job-url
            if (parts[1] === 'fetch-job-url' && method === 'POST') {
                const content = await cvAI.fetchJobUrl(body.url);
                return new LocalResponse({ content });
            }

            // match-job
            if (parts[1] === 'match-job' && method === 'POST') {
                const [skills, exps, own, prof] = await Promise.all([
                    cvDb.kandSkills.listFor(ownId),
                    cvDb.kandExperiences.listFor(ownId),
                    cvDb.kandidater.get(ownId),
                    cvDb.profile.get(),
                ]);
                if (!skills.length && !exps.length) {
                    return new LocalResponse({ detail: 'Kompetensbanken är tom' }, 400);
                }
                const seekerProfile = (own || prof) ? {
                    roles:              prof?.roles              || own?.roles              || null,
                    desired_city:       prof?.desired_city       || own?.desired_city       || null,
                    desired_employment: prof?.desired_employment || own?.desired_employment || [],
                    desired_workplace:  prof?.desired_workplace  || own?.desired_workplace  || [],
                    desired_domains:    prof?.desired_domains    || own?.desired_domains    || [],
                    unwanted_domains:   prof?.unwanted_domains   || own?.unwanted_domains   || [],
                    willing_to_commute: prof?.willing_to_commute || own?.willing_to_commute || false,
                    personal_qualities: prof?.personal_qualities || own?.personal_qualities || [],
                } : null;
                const structuredJob = await _getStructuredJob(body.job_title || '', body.job_description || '');
                const result = await cvAI.matchJobStructured(skills, exps, structuredJob, seekerProfile);
                const expById = Object.fromEntries(exps.map(e => [e.id, e]));
                result.experiences = (result.experiences || []).map(item => {
                    const exp = expById[item.id];
                    return exp ? { ...item, title: exp.title, organization: exp.organization,
                        start_date: exp.start_date, end_date: exp.end_date,
                        is_current: exp.is_current, experience_type: exp.experience_type } : item;
                });
                return new LocalResponse(result);
            }

            // generate-cv
            if (parts[1] === 'generate-cv' && method === 'POST') {
                const { job_description, matched_experience_ids = [], skills = [] } = body;
                const expList = await cvDb.kandExperiences.listFor(ownId);
                const matched = matched_experience_ids.length
                    ? expList.filter(e => matched_experience_ids.includes(e.id)) : expList;
                const result = await cvAI.generateCV(job_description, matched, skills);
                const expById = Object.fromEntries(matched.map(e => [e.id, e]));
                result.experiences = (result.experiences || []).map(item => {
                    const exp = expById[item.id];
                    return exp ? { ...item, title: exp.title, organization: exp.organization,
                        start_date: exp.start_date, end_date: exp.end_date,
                        is_current: exp.is_current, is_matched: true } : item;
                }).filter(e => e.title);
                return new LocalResponse(result);
            }

            // generate-loghouse-cv
            if (parts[1] === 'generate-loghouse-cv' && method === 'POST') {
                const { job_description, experience_scores = {}, skills: reqSkills = [], kandidat_id } = body;
                const targetId = kandidat_id || ownId;
                const [expList, skillList, eduList, cvList, own] = await Promise.all([
                    cvDb.kandExperiences.listFor(targetId),
                    cvDb.kandSkills.listFor(targetId),
                    cvDb.kandEducation.listFor(targetId),
                    cvDb.kandCvs.listFor(targetId),
                    cvDb.kandidater.get(targetId),
                ]);
                // Annotate every experience with its match score
                const scoredExps = expList.map(e => ({
                    ...e,
                    match_score: experience_scores[e.id] ?? -1,
                }));
                // Sort: high-score first, then unscored, then low-score
                scoredExps.sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
                const cvTexts = cvList.map(c => c.original_text).filter(Boolean);
                const profile = own ? { public_name: own.public_name || '', email: own.email || '',
                    phone: own.public_phone || '', city: own.desired_city || '' } : {};
                const result = await cvAI.generateLogHouseCV(
                    job_description, scoredExps, reqSkills.length ? reqSkills : skillList,
                    profile, [], eduList, cvTexts);
                return new LocalResponse(result);
            }

            // improvement-tips
            if (parts[1] === 'improvement-tips' && method === 'POST') {
                const { job_description, overall_score, current_skills = [], missing_skills = [], matched_experience_ids = [] } = body;
                const expList = await cvDb.kandExperiences.listFor(ownId);
                const matched = matched_experience_ids.length
                    ? expList.filter(e => matched_experience_ids.includes(e.id)) : expList;
                const result = await cvAI.improvementTips(job_description, overall_score, current_skills, missing_skills, matched);
                return new LocalResponse(result);
            }
        }

        // ── SEARCH PROFILES ──────────────────────────────────────────────────
        if (parts[0] === 'profiles') {
            if (!parts[1]) {
                if (method === 'GET')  return new LocalResponse(await cvDb.searchProfiles.list());
                if (method === 'POST') return new LocalResponse(await cvDb.searchProfiles.add(body));
            }
            if (parts[1] && !parts[2]) {
                const id = Number(parts[1]);
                if (method === 'GET')    return new LocalResponse(await cvDb.searchProfiles.get(id));
                if (method === 'PUT')    return new LocalResponse(await cvDb.searchProfiles.update(id, body));
                if (method === 'DELETE') { await cvDb.searchProfiles.delete(id); return new LocalResponse({}); }
            }
            if (parts[2] === 'results' && method === 'PUT') {
                return new LocalResponse(await cvDb.searchProfiles.saveResult(Number(parts[1]), body));
            }
        }

        // ── KANDIDATER ────────────────────────────────────────────────────────
        if (parts[0] === 'kandidater') {
            const kid = parts[1] ? Number(parts[1]) : null;

            // GET /kandidater/
            if (method === 'GET' && parts.length === 1) {
                const all = await cvDb.kandidater.list();
                const enriched = await Promise.all(
                    all.filter(k => k.profile_type !== 'egenprofil').map(async k => {
                        const [skills, exps, edu, certs, cvs] = await Promise.all([
                            cvDb.kandSkills.listFor(k.id),
                            cvDb.kandExperiences.listFor(k.id),
                            cvDb.kandEducation.listFor(k.id),
                            cvDb.kandCertifications.listFor(k.id),
                            cvDb.kandCvs.listFor(k.id),
                        ]);
                        return { ...k, _counts: { skills: skills.length, experiences: exps.length, education: edu.length, certifications: certs.length, cvs: cvs.length } };
                    })
                );
                return new LocalResponse({ kandidater: enriched });
            }

            // GET /kandidater/{id}
            if (method === 'GET' && parts.length === 2) {
                const k = await cvDb.kandidater.get(kid);
                if (!k) return new LocalResponse({ detail: 'Hittades inte' }, 404);
                return new LocalResponse(k);
            }

            // POST /kandidater/
            if (method === 'POST' && parts.length === 1) {
                const saved = await cvDb.kandidater.add({ ...body });
                return new LocalResponse(saved);
            }

            // PUT /kandidater/{id}
            if (method === 'PUT' && parts.length === 2) {
                const saved = await cvDb.kandidater.update(kid, body);
                return new LocalResponse(saved);
            }

            // DELETE /kandidater/{id}
            if (method === 'DELETE' && parts.length === 2) {
                const toDelete = await cvDb.kandidater.get(kid);
                if (toDelete?.profile_type === 'egenprofil') return new LocalResponse({ detail: 'Kan inte ta bort egen profil' }, 403);
                await cvDb.kandSkills.deleteAll(kid);
                await cvDb.kandExperiences.deleteAll(kid);
                await cvDb.kandEducation.deleteAll(kid);
                await cvDb.kandCertifications.deleteAll(kid);
                const cvList = await cvDb.kandCvs.listFor(kid);
                for (const cv of cvList) await cvDb.kandCvs.delete(cv.id);
                await cvDb.kandidater.delete(kid);
                return new LocalResponse({});
            }

            if (kid && parts[2] === 'bank') {
                // GET /kandidater/{id}/bank
                if (method === 'GET' && parts.length === 3) {
                    const [skills, exps] = await Promise.all([
                        cvDb.kandSkills.listFor(kid),
                        cvDb.kandExperiences.listFor(kid),
                    ]);
                    return new LocalResponse({ skills, experiences: exps });
                }

                // Skills
                if (parts[3] === 'skills') {
                    const sid = parts[4] ? Number(parts[4]) : null;
                    if (method === 'POST' && !sid) {
                        return new LocalResponse(await cvDb.kandSkills.add(kid, body));
                    }
                    if (method === 'PUT' && sid) {
                        return new LocalResponse(await cvDb.kandSkills.update(sid, body));
                    }
                    if (method === 'DELETE' && sid) {
                        await cvDb.kandSkills.delete(sid);
                        return new LocalResponse({});
                    }
                    if (method === 'DELETE' && !sid) {
                        await cvDb.kandSkills.deleteAll(kid);
                        return new LocalResponse({});
                    }
                }

                // Experiences
                if (parts[3] === 'experiences') {
                    const eid = parts[4] ? Number(parts[4]) : null;
                    if (method === 'POST' && !eid) {
                        return new LocalResponse(await cvDb.kandExperiences.add(kid, body));
                    }
                    if (method === 'PUT' && eid) {
                        return new LocalResponse(await cvDb.kandExperiences.update(eid, body));
                    }
                    if (method === 'DELETE' && eid) {
                        await cvDb.kandExperiences.delete(eid);
                        return new LocalResponse({});
                    }
                    if (method === 'DELETE' && !eid) {
                        await cvDb.kandExperiences.deleteAll(kid);
                        return new LocalResponse({});
                    }
                }

                // Upload CV to kandidat bank
                if (parts[3] === 'upload-cv' && method === 'POST') {
                    const file = body instanceof FormData ? body.get('file') : null;
                    if (!file) return new LocalResponse({ detail: 'Ingen fil' }, 400);
                    const reviewedText = body instanceof FormData ? (body.get('reviewed_text') || '') : '';
                    const [text, fileData] = await Promise.all([
                        reviewedText ? Promise.resolve(reviewedText) : cvPdf.extractText(file),
                        file.arrayBuffer(),
                    ]);
                    const structured = await cvAI.structureCV(text);

                    // Skills — structureCV returns strings + technologies from work_experience
                    const rawSkillNames = [
                        ...(structured.skills || []),
                        ...(structured.work_experience || []).flatMap(e => e.technologies || []),
                    ];
                    const seenSkills = new Set();
                    let skillCount = 0;
                    for (const name of rawSkillNames) {
                        const norm = (name || '').trim();
                        if (!norm || seenSkills.has(norm.toLowerCase())) continue;
                        seenSkills.add(norm.toLowerCase());
                        const { category } = cvCompSvc.categoriseSkill(norm);
                        await cvDb.kandSkills.add(kid, { skill_name: norm, category });
                        skillCount++;
                    }

                    // Work experience — AI returns position/company/current
                    const workExps = structured.work_experience || [];
                    for (const e of workExps) {
                        await cvDb.kandExperiences.add(kid, {
                            title:           e.position     || 'Okänd position',
                            organization:    e.company      || null,
                            experience_type: 'work',
                            start_date:      normDate(e.start_date),
                            end_date:        normDate(e.end_date),
                            is_current:      Boolean(e.current),
                            description:     e.description  || null,
                            achievements:    e.achievements || [],
                        });
                    }

                    // Education — AI returns institution/degree/field_of_study
                    const eduList = structured.education || [];
                    for (const e of eduList) {
                        await cvDb.kandEducation.add(kid, {
                            degree:         e.degree         || 'Utbildning',
                            institution:    e.institution    || null,
                            field_of_study: e.field_of_study || null,
                            start_date:     e.start_date     || null,
                            end_date:       e.end_date       || null,
                            description:    null,
                        });
                    }

                    // Certifications — AI returns name/issuing_organization/issue_date
                    const certList = structured.certifications || [];
                    for (const c of certList) {
                        await cvDb.kandCertifications.add(kid, {
                            name:        c.name                  || 'Certifiering',
                            issuer:      c.issuing_organization  || null,
                            date:        c.issue_date            || null,
                            description: null,
                        });
                    }

                    await cvDb.kandCvs.add(kid, {
                        filename:            file.name,
                        is_processed:        true,
                        mime_type:           mimeTypeForFilename(file.name),
                        structured_data:     structured,
                        file_data:           fileData,
                        skill_count:         skillCount,
                        experience_count:    workExps.length,
                        education_count:     eduList.length,
                        certification_count: certList.length,
                    });
                    return new LocalResponse({
                        filename:         file.name,
                        skill_count:      skillCount,
                        experience_count: workExps.length,
                    });
                }
            }

            if (kid && parts[2] === 'education') {
                const eid = parts[3] ? Number(parts[3]) : null;
                if (method === 'GET' && !eid) {
                    return new LocalResponse({ education: await cvDb.kandEducation.listFor(kid) });
                }
                if (method === 'POST' && !eid) {
                    return new LocalResponse(await cvDb.kandEducation.add(kid, body));
                }
                if (method === 'PUT' && eid) {
                    return new LocalResponse(await cvDb.kandEducation.update(eid, body));
                }
                if (method === 'DELETE' && eid) {
                    await cvDb.kandEducation.delete(eid);
                    return new LocalResponse({});
                }
                if (method === 'DELETE' && !eid) {
                    await cvDb.kandEducation.deleteAll(kid);
                    return new LocalResponse({});
                }
            }

            if (kid && parts[2] === 'certifications') {
                const cid = parts[3] ? Number(parts[3]) : null;
                if (method === 'GET' && !cid) {
                    return new LocalResponse({ certifications: await cvDb.kandCertifications.listFor(kid) });
                }
                if (method === 'POST' && !cid) {
                    return new LocalResponse(await cvDb.kandCertifications.add(kid, body));
                }
                if (method === 'PUT' && cid) {
                    return new LocalResponse(await cvDb.kandCertifications.update(cid, body));
                }
                if (method === 'DELETE' && cid) {
                    await cvDb.kandCertifications.delete(cid);
                    return new LocalResponse({});
                }
                if (method === 'DELETE' && !cid) {
                    await cvDb.kandCertifications.deleteAll(kid);
                    return new LocalResponse({});
                }
            }

            if (kid && parts[2] === 'cvs') {
                const cvid = parts[3] ? Number(parts[3]) : null;
                if (method === 'GET' && !cvid) {
                    return new LocalResponse(await cvDb.kandCvs.listFor(kid));
                }
                if (method === 'DELETE' && cvid) {
                    await cvDb.kandCvs.delete(cvid);
                    return new LocalResponse({});
                }
                if (parts[4] === 'vectorize' && method === 'POST') {
                    return new LocalResponse({ detail: 'Vektorisering ej tillgänglig i webbläsarläge' }, 501);
                }
            }

            // match-job for kandidat
            if (kid && parts[2] === 'match-job' && method === 'POST') {
                const [skills, exps, profile] = await Promise.all([
                    cvDb.kandSkills.listFor(kid),
                    cvDb.kandExperiences.listFor(kid),
                    cvDb.kandidater.get(kid),
                ]);
                if (!skills.length && !exps.length) {
                    return new LocalResponse({ detail: 'Kandidatens kompetensbank är tom' }, 400);
                }
                const seekerProfile = profile ? {
                    roles:              profile.roles              || null,
                    desired_city:       profile.desired_city       || null,
                    desired_employment: profile.desired_employment || [],
                    desired_workplace:  profile.desired_workplace  || [],
                    desired_domains:    [],
                    unwanted_domains:   [],
                    willing_to_commute: profile.willing_to_commute || false,
                    personal_qualities: profile.personal_qualities || [],
                } : null;
                const structuredJob = await _getStructuredJob(body.job_title || '', body.job_description || '');
                const result = await cvAI.matchJobStructured(skills, exps, structuredJob, seekerProfile);
                const expById = Object.fromEntries(exps.map(e => [e.id, e]));
                result.experiences = (result.experiences || []).map(item => {
                    const exp = expById[item.id];
                    return exp ? { ...item, title: exp.title, organization: exp.organization,
                        start_date: exp.start_date, end_date: exp.end_date,
                        is_current: exp.is_current, experience_type: exp.experience_type } : item;
                });
                return new LocalResponse(result);
            }

            // multi-match: rank selected kandidater against a job
            if (parts[1] === 'multi-match' && method === 'POST') {
                const { kandidat_ids = [] } = body;
                const allKand = (await cvDb.kandidater.list()).filter(k =>
                    k.profile_type !== 'egenprofil' && (kandidat_ids.length === 0 || kandidat_ids.includes(k.id))
                );
                // Analyze the job once — reused for all candidates
                const structuredJob = await _getStructuredJob(body.job_title || '', body.job_description || '');
                const results = await Promise.all(allKand.map(async (k) => {
                    try {
                        const [skills, exps] = await Promise.all([
                            cvDb.kandSkills.listFor(k.id),
                            cvDb.kandExperiences.listFor(k.id),
                        ]);
                        if (!skills.length && !exps.length) {
                            return { id: k.id, name: k.public_name, roles: k.roles, score: null, match_result: null };
                        }
                        const seekerProfile = {
                            roles:              k.roles              || null,
                            desired_city:       k.desired_city       || null,
                            desired_employment: k.desired_employment || [],
                            desired_workplace:  k.desired_workplace  || [],
                            desired_domains:    [],
                            unwanted_domains:   [],
                            willing_to_commute: k.willing_to_commute || false,
                            personal_qualities: k.personal_qualities || [],
                        };
                        const result = await cvAI.matchJobStructured(skills, exps, structuredJob, seekerProfile);
                        const expById = Object.fromEntries(exps.map(e => [e.id, e]));
                        result.experiences = (result.experiences || []).map(item => {
                            const exp = expById[item.id];
                            return exp ? { ...item, title: exp.title, organization: exp.organization,
                                start_date: exp.start_date, end_date: exp.end_date,
                                is_current: exp.is_current, experience_type: exp.experience_type } : item;
                        });
                        return { id: k.id, name: k.public_name, roles: k.roles, score: result.overall_score ?? null, match_result: result };
                    } catch {
                        return { id: k.id, name: k.public_name, roles: k.roles, score: null, match_result: null };
                    }
                }));
                results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
                return new LocalResponse({ candidates: results });
            }

        }

        // Unhandled route
        console.warn('[browserRoute] Unhandled:', method, path);
        return new LocalResponse({ detail: `Not found: ${path}` }, 404);

    } catch (err) {
        console.error('[browserRoute] Error on', method, path, err);
        return new LocalResponse({ detail: err.message || 'Internt fel' }, 500);
    }
}

// ── apiFetch — nu en lokal dispatcher ────────────────────────────────────────
async function apiFetch(url, options = {}) {
    // Strip any http://localhost:*/api/v1 prefix
    const path = url.replace(/^https?:\/\/[^/]+\/api\/v1/, '') || '/';
    return browserRoute(path, options);
}

// ── Navigation ────────────────────────────────────────────────────────────────
async function isAiConfigured() {
    const s = await cvDb.settings.getAll();
    if (!s.ai_provider) return false;
    if (s.ai_provider === 'ollama') return Boolean(s.ollama_url);
    return Boolean({ openai: s.openai_key, anthropic: s.anthropic_key, gemini: s.gemini_key }[s.ai_provider]);
}

function goToSokprofil() {
    const navEl = document.querySelector('[onclick*="sokprofil"]');
    showView('sokprofil', navEl);
    if (typeof loadSokprofil === 'function') loadSokprofil();
}

function goToAccount() {
    const navEl = document.getElementById('nav-account');
    showView('account', navEl);
    if (typeof loadAccountView === 'function') loadAccountView();
}

function showView(viewId, navEl) {
    if (!currentUser) { showAuthView(); return; }
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const view = document.getElementById('view-' + viewId);
    if (view) view.classList.add('active');
    if (navEl) navEl.classList.add('active');
    closeSidebar();
    if (viewId === 'optimize') {
        if (typeof updateMatchWarning === 'function') updateMatchWarning();
        _restoreMatchResult();
        _updateMatchBackBtn();
    }
}

// ── Back-to-job button visibility ────────────────────────────────────────────
function _updateMatchBackBtn() {
    const btn = document.getElementById('match-back-header-btn');
    if (!btn) return;
    const show = !!(lastMatchJobId && lastMatchJobMeta?.source);
    btn.classList.toggle('hidden', !show);
}

// ── Restore persisted match result on view load ───────────────────────────────
async function _restoreMatchResult() {
    if (lastMatchResult) return;

    try {
        // Per-job cache takes priority when we navigated here from a job
        if (lastMatchJobId) {
            const cachedRaw = await cvDb.settings.get('job_match_' + lastMatchJobId);
            if (cachedRaw) {
                const result = JSON.parse(cachedRaw);
                lastMatchResult = result;
                displayMatchResult(result);
                _updateMatchBackBtn();
                return;
            }
        }

        // Fall back to last generic match (e.g. navigated from sidebar)
        const s = await cvDb.settings.getAll();
        const raw = s.last_match_result;
        if (!raw) return;

        const result = JSON.parse(raw);
        lastMatchResult  = result;
        lastJobDesc      = s.last_match_job_desc  ?? '';
        lastMatchJobId   = s.last_match_job_id    || null;
        lastMatchJobMeta = s.last_match_job_meta  ? JSON.parse(s.last_match_job_meta) : null;

        const ta = document.getElementById('job-description');
        if (ta && lastJobDesc) ta.value = lastJobDesc;

        displayMatchResult(result);
        _updateMatchBackBtn();
    } catch { /* corrupt data — ignore */ }
}

// ── Match result helpers ──────────────────────────────────────────────────────
function scoreColor(score) {
    if (score >= 75) return 'match-high';
    if (score >= 45) return 'match-mid';
    return 'match-low';
}

function scoreBar(score) {
    return `<div class="match-bar"><div class="match-bar-fill ${scoreColor(score)}" style="width:${score}%"></div></div>`;
}

function displayMatchResult(result, container) {
    const optimizeResult = container ?? document.getElementById('optimize-result');
    const overall = result.overall_score ?? 0;
    const skills = (result.skills ?? []).filter(s => s.score > 0);
    const experiences = (result.experiences ?? []).filter(e => e.score > 0);
    const missingRequired    = result.missing_required_skills    ?? result.missing_skills ?? [];
    const missingNiceToHave  = result.missing_nice_to_have_skills ?? [];
    const matchingQualities  = result.matching_personal_qualities ?? [];
    const missingQualities   = result.missing_personal_qualities  ?? [];
    const jobInfo = result.job_info ?? {};
    const profileFit = result.profile_fit ?? [];

    const typeLabels = { work: t('tab.erfarenheter'), education: t('tab.utbildning'), certification: t('tab.certifikat'), project: 'Projekt' };

    const skillsHtml = skills.map(s => `
        <div class="match-item">
            <div class="match-item-header">
                <span class="match-item-name">${s.skill_name}</span>
            </div>
            ${scoreBar(s.score)}
            <div class="match-item-reason">${s.reason}</div>
        </div>
    `).join('');

    const expHtml = experiences.map(e => `
        <div class="match-item">
            <div class="match-item-header">
                <div>
                    <span class="match-item-name">${e.title}</span>
                    ${e.organization ? `<span class="match-item-org"> · ${e.organization}</span>` : ''}
                    ${e.experience_type ? `<span class="match-type-badge">${typeLabels[e.experience_type] || e.experience_type}</span>` : ''}
                </div>
            </div>
            ${scoreBar(e.score)}
            <div class="match-item-reason">${e.reason}</div>
        </div>
    `).join('');

    const missingRequiredHtml   = missingRequired.map(m =>
        `<span class="match-missing-chip match-missing-required">${esc(m)}<button class="skill-info-btn" onclick="showSkillContextModal('${m.replace(/'/g, "\\'")}')" title="Visa hur annonsen beskriver denna kompetens"><span class="material-icons">info</span></button></span>`).join('');
    const missingNiceToHaveHtml = missingNiceToHave.map(m =>
        `<span class="match-missing-chip match-missing-nice">${esc(m)}<button class="skill-info-btn" onclick="showSkillContextModal('${m.replace(/'/g, "\\'")}')" title="Visa hur annonsen beskriver denna kompetens"><span class="material-icons">info</span></button></span>`).join('');

    const qualitiesHtml = (matchingQualities.length || missingQualities.length) ? `
        <div class="match-missing-section">
            <h4 class="match-section-title">Personliga egenskaper</h4>
            <div class="match-missing-chips">
                ${matchingQualities.map(q => `<span class="match-missing-chip match-quality-match"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">check</span> ${esc(q)}<button class="skill-info-btn" onclick="showQualityContextModal('${q.replace(/'/g, "\\'")}', false)" title="Visa hur annonsen beskriver denna egenskap"><span class="material-icons">info</span></button></span>`).join('')}
                ${missingQualities.map(q =>  `<span class="match-missing-chip match-quality-missing">${esc(q)}<button class="skill-info-btn" onclick="showQualityContextModal('${q.replace(/'/g, "\\'")}', true)" title="Visa hur annonsen beskriver denna egenskap"><span class="material-icons">info</span></button></span>`).join('')}
            </div>
        </div>` : '';

    const jobInfoItems = [
        { icon: 'place',       value: jobInfo.city },
        { icon: 'schedule',    value: jobInfo.employment_type },
        { icon: 'list_alt',    value: jobInfo.duration },
        { icon: 'business',    value: jobInfo.workplace },
    ].filter(i => i.value);

    const jobInfoHtml = jobInfoItems.length ? `
        <div class="job-info-bar">
            ${jobInfoItems.map(i => `<span class="job-info-chip"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">${i.icon}</span> ${i.value}</span>`).join('')}
        </div>` : '';

    const fitIcon = m => m === true
        ? '<span class="material-icons" style="font-size:1rem;color:#16a34a">check_circle</span>'
        : m === false
        ? '<span class="material-icons" style="font-size:1rem;color:#dc2626">cancel</span>'
        : '<span class="material-icons" style="font-size:1rem;color:var(--text-muted)">help_outline</span>';
    const profileFitHtml = profileFit.length ? `
        <div class="profile-fit-section">
            <h4 class="match-section-title">Passning mot profil</h4>
            <div class="profile-fit-grid">
                ${profileFit.map(f => `
                    <div class="profile-fit-row ${f.match === false ? 'fit-mismatch' : ''}">
                        <span class="fit-icon">${fitIcon(f.match)}</span>
                        <span class="fit-aspect">${f.aspect}</span>
                        <span class="fit-values">
                            <span class="fit-job">${f.job_value || 'Ej angiven'}</span>
                            <span class="fit-arrow"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">arrow_forward</span></span>
                            <span class="fit-pref">${f.preference || 'Ej angiven'}</span>
                        </span>
                        ${f.note ? `<span class="fit-note">${f.note}</span>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>` : '';

    const matchLabel = overall >= 75 ? t('match.label_high')
        : overall >= 45 ? t('match.label_mid')
        : t('match.label_low');

    const jobTitleParts = [lastMatchJobMeta?.headline, lastMatchJobMeta?.employer].filter(Boolean);
    const jobTitleSuffix = jobTitleParts.length ? ': ' + jobTitleParts.join(', ') : '';

    optimizeResult.innerHTML = `
        <div class="match-result-header ${scoreColor(overall)}">
            <div>
                <h2 class="match-result-label">${matchLabel}${esc(jobTitleSuffix)}</h2>
                ${jobInfoHtml}
                <p class="match-summary">${result.summary || ''}</p>
            </div>
        </div>

        ${profileFitHtml}

        <div class="match-sections">
            <div class="match-section">
                <h4 class="match-section-title">${t('match.section_skills')} (${skills.length})</h4>
                <div class="match-list">${skillsHtml || `<p class="match-empty">${t('match.no_skills_match')}</p>`}</div>
            </div>
            <div class="match-section">
                <h4 class="match-section-title">${t('match.section_exp')} (${experiences.length})</h4>
                <div class="match-list">${expHtml || `<p class="match-empty">${t('match.no_exp_match')}</p>`}</div>
            </div>
        </div>

        ${(missingRequired.length || missingNiceToHave.length) ? `
        <div class="match-missing-section">
            ${missingRequired.length ? `
            <h4 class="match-section-title">Saknade obligatoriska kompetenser (${missingRequired.length})</h4>
            <div class="match-missing-chips" style="margin-bottom:0.75rem">${missingRequiredHtml}</div>` : ''}
            ${missingNiceToHave.length ? `
            <h4 class="match-section-title" style="margin-top:0.5rem">Meriterande som saknas (${missingNiceToHave.length})</h4>
            <div class="match-missing-chips">${missingNiceToHaveHtml}</div>` : ''}
        </div>` : ''}

        ${qualitiesHtml}

        <div class="gen-cv-action" id="match-job-actions">
            ${lastMatchJobId ? `
            <button id="match-save-btn" class="btn btn-secondary" onclick="saveJobFromMatch()"
                ${lastMatchJobMeta?.status === 'saved' ? 'disabled' : ''}>
                <span class="material-icons" style="font-size:1rem;vertical-align:middle;margin-right:4px">${lastMatchJobMeta?.status === 'saved' ? 'bookmark' : 'bookmark_add'}</span>${lastMatchJobMeta?.status === 'saved' ? t('jobs.already_saved') : t('jobs.save_job')}
            </button>
            <button id="match-dismiss-btn" class="btn btn-secondary" onclick="dismissJobFromMatch()">
                <span class="material-icons" style="font-size:1rem;vertical-align:middle;margin-right:4px">thumb_down</span>${t('jobs.dismiss')}
            </button>` : ''}
            <button id="tips-btn" class="btn btn-secondary" onclick="handleTips()">
                <span class="material-icons" style="font-size:1rem;vertical-align:middle;margin-right:4px">lightbulb</span>${t('match.tips_btn')}
            </button>
            <button id="gen-lh-cv-btn" class="btn btn-primary" onclick="handleGenerateLHCV()">
                ${t('match.gen_lh_btn')}
            </button>
        </div>

        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
            <button class="btn btn-ghost btn-sm" onclick="newMatchSession()">
                <span class="material-icons" style="font-size:1rem;vertical-align:middle;margin-right:4px">add_circle_outline</span>${t('match.new_match')}
            </button>
        </div>
    `;

    optimizeResult.classList.remove('hidden');

    // Hide the input card — result persists across navigation
    document.getElementById('optimize-input-card')?.classList.add('hidden');

    // Persist result to IndexedDB so it survives navigation
    cvDb.settings.set('last_match_result',   JSON.stringify(result));
    cvDb.settings.set('last_match_job_desc', lastJobDesc ?? '');
    cvDb.settings.set('last_match_job_id',   lastMatchJobId ?? '');
    cvDb.settings.set('last_match_job_meta', lastMatchJobMeta ? JSON.stringify(lastMatchJobMeta) : '');

    // Safety net: verify against IndexedDB in case status wasn't set correctly
    if (lastMatchJobId) {
        const _jobId = lastMatchJobId;
        cvDb.jobSeen.get(_jobId).then(existing => {
            if (existing?.status === 'saved') {
                const btn = document.getElementById('match-save-btn');
                if (btn && !btn.disabled) {
                    btn.disabled = true;
                    btn.innerHTML = `<span class="material-icons" style="font-size:1rem;vertical-align:middle;margin-right:4px">bookmark</span>${t('jobs.already_saved')}`;
                }
            }
        }).catch(() => {});
    }
}

// ── PDF download (browser-only) ──────────────────────────────────────────────
async function downloadCVFile(cvId) {
    const id = Number(cvId);
    let cv = await cvDb.cvs.get(id);
    if (!cv) cv = await cvDb.kandCvs.get(id);
    if (!cv?.file_data) {
        alert('Filen är inte sparad. Ladda upp CV:t igen för att aktivera nedladdning.');
        return;
    }
    const mime = cv.mime_type || mimeTypeForFilename(cv.filename || '');
    const blob = new Blob([cv.file_data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cv.filename || 'cv.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── AUTH (browser-only: auto-login from IndexedDB) ─────────────────────────
async function loadCurrentUser() {
    try {
        await cvDb.init();
        const profile   = await cvDb.profile.get();
        const lang      = await cvDb.settings.get('language');
        const rolesJson = await cvDb.settings.get('user_roles');
        const roles     = rolesJson ? JSON.parse(rolesJson) : [];
        const own       = await cvDb.kandidater.getOwn();

        currentUser = {
            id: 1,
            name:     profile?.public_name || own?.public_name || 'Användare',
            email:    profile?.email       || own?.email       || '',
            phone:    profile?.public_phone || '',
            address:  profile?.address      || '',
            language: lang || localStorage.getItem('lang') || 'sv',
            roles,
        };

        if (currentUser.language) {
            currentLang = currentUser.language;
            localStorage.setItem('lang', currentLang);
        }

        showApp();
    } catch (err) {
        console.error('Init error:', err);
        // Even on error, show app with defaults
        currentUser = { id: 1, name: 'Användare', email: '', language: 'sv', roles: [] };
        showApp();
    }
}

function resetAllState() {
    _ownKandidatId        = null;
    _ownKandidatIdPromise = null;
    selectedCV          = null;
    allCVs              = [];
    lastMatchResult     = null;
    lastJobDesc         = '';
    lastMatchKandidatId = null;

    spEditingSkillId   = null; spEditingExpId   = null;
    spEditingEduId     = null; spEditingCertId  = null;
    kandEditingSkillId = null; kandEditingExpId = null;
    kandEditingEduId   = null; kandEditingCertId = null;

    cachedSpSkills   = []; cachedSpExps   = []; cachedSpEdu   = []; cachedSpCerts   = [];
    cachedKandSkills = []; cachedKandExps = []; cachedKandEdu = []; cachedKandCerts = [];

    if (typeof bankSkills            !== 'undefined') bankSkills            = [];
    if (typeof bankExperiences       !== 'undefined') bankExperiences       = [];
    if (typeof activeBankTab         !== 'undefined') activeBankTab         = 'skills';
    if (typeof selectedExperienceIds !== 'undefined') selectedExperienceIds = new Set();

    if (typeof spCandidateCVs !== 'undefined') spCandidateCVs = [];
    if (typeof currentKandidatId !== 'undefined') currentKandidatId = null;
    if (typeof kandidaterCache   !== 'undefined') kandidaterCache   = [];
    if (typeof kandUploadSetup   !== 'undefined') kandUploadSetup   = false;
    if (typeof kandCandidateCVs  !== 'undefined') kandCandidateCVs  = [];

    const spDetail = document.getElementById('sp-cv-detail');
    if (spDetail) spDetail.style.display = 'none';

    const optResult = document.getElementById('optimize-result');
    if (optResult) { optResult.innerHTML = ''; optResult.classList.add('hidden'); }

    const genCV = document.getElementById('generated-cv-output');
    if (genCV) genCV.classList.add('hidden');

    if (jobDescription) jobDescription.value = '';

    const bankContent = document.getElementById('bank-content');
    if (bankContent) bankContent.innerHTML = '';

    ['sp-skills-list', 'sp-experiences-list', 'sp-education-list', 'sp-certifications-list',
     'kand-skills-list', 'kand-experiences-list', 'kand-education-list', 'kand-certifications-list']
        .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });

    ['basinfo', 'kompetenser', 'erfarenheter', 'utbildning', 'certifikat', 'cv'].forEach(t => {
        const tabEl = document.getElementById(`sp-tab-${t}`);
        const btnEl = document.getElementById(`sp-tab-btn-${t}`);
        if (tabEl) tabEl.style.display = t === 'basinfo' ? '' : 'none';
        if (btnEl) btnEl.classList.toggle('active', t === 'basinfo');
    });

    ['dash-cv-count', 'dash-skills-count', 'dash-exp-count', 'dash-edu-count', 'dash-cert-count', 'dash-kandidater-count']
        .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '0'; });
    document.querySelectorAll('[data-requires-role]').forEach(el => el.classList.add('hidden'));
}

function showAuthView() {
    // Browser-only: auth view not used — reload will re-init from IndexedDB
    location.reload();
}

async function showApp() {
    // First-time detection: no role and no AI key → show welcome
    const roles = currentUser?.roles || [];
    const hasRole = roles.some(r => ['Kandidat', 'Säljare', 'Rekryterare', 'Admin'].includes(r));
    if (!hasRole) {
        const s = await cvDb.settings.getAll();
        const hasAI = Boolean(s.ai_provider) && (
            s.ai_provider === 'ollama'
                ? Boolean(s.ollama_url)
                : Boolean(s[`${s.ai_provider}_key`])
        );
        if (!hasAI) {
            _showAppShell(true);
            return;
        }
    }

    _showAppShell();
}

let _localVersion = null;

function _loadSidebarVersion() {
    const el = document.getElementById('sidebar-version');
    if (!el) return;
    fetch('version.json?_=' + Date.now())
        .then(r => r.ok ? r.json() : null)
        .then(d => {
            if (d?.version) {
                _localVersion = d.version;
                el.textContent = `v${d.version}`;
                const fb = document.querySelector('a[href^="mailto:seladof"]');
                if (fb) fb.href = `mailto:seladof@gmail.com?subject=${encodeURIComponent('Angående CVOptimizer v' + d.version)}`;
            }
        })
        .catch(() => {});
}

async function checkForUpdates() {
    try {
        const res = await fetch('https://arbafax.github.io/cv-optimizer/version.json?_=' + Date.now());
        if (!res.ok) throw new Error('no response');
        const remote = await res.json();
        if (!remote?.version) throw new Error('no version');
        const _semverGt = (a, b) => {
            const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const diff = (pa[i] || 0) - (pb[i] || 0);
                if (diff !== 0) return diff > 0;
            }
            return false;
        };
        if (!_semverGt(remote.version, _localVersion)) {
            alert(`Du kör redan den senaste versionen (v${_localVersion}).`);
            return;
        }
        document.getElementById('update-modal-text').textContent =
            `Du kör v${_localVersion || '?'} men v${remote.version} är tillgänglig. Vill du ladda om sidan för att hämta den senaste versionen?`;
        document.getElementById('update-modal').classList.remove('hidden');
    } catch {
        alert('Kunde inte kontrollera versionen. Kontrollera din internetanslutning.');
    }
}

function closeUpdateModal() {
    document.getElementById('update-modal').classList.add('hidden');
}

function doUpdate() {
    closeUpdateModal();
    location.reload(true);
}

function _showAppShell(firstTime = false) {
    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    applyTranslations();
    renderSidebarUser();
    _loadSidebarVersion();
    const h1 = document.querySelector('#view-dashboard .view-header h1');
    if (h1 && currentUser) {
        h1.textContent = `${t('dash.welcome')}, ${currentUser.name.split(' ')[0]}!`;
    }
    if (firstTime) {
        showView('welcomepage', document.getElementById('nav-welcomepage'));
        loadWelcomePage();
        return;
    }
    const roles = currentUser?.roles || [];
    const hasDashboardRole = roles.some(r => ['Kandidat', 'Säljare', 'Rekryterare'].includes(r));
    if (hasDashboardRole) {
        showView('dashboard', document.getElementById('nav-dashboard'));
        loadCVs();
        loadBankData();
        loadSpCandidateCVs();
    } else {
        showView('account', document.getElementById('nav-account'));
        loadAccountView();
    }
}

async function loadWelcomePage() {
    const el = document.getElementById('welcomepage-md-content');
    if (!el) return;

    const renderer = new marked.Renderer();
    renderer.link = ({ href, title, text }) =>
        `<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${text}</a>`;

    const file = currentLang !== 'sv' ? `welcome.${currentLang}.md` : 'welcome.md';
    try {
        let res = await fetch(file);
        if (!res.ok) res = await fetch('welcome.md');
        el.innerHTML = marked.parse(await res.text(), { renderer });
    } catch {
        el.innerHTML = '<p>Kunde inte ladda välkomsttexten.</p>';
    }
}


// ── Mobile sidebar toggle ─────────────────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const btn     = document.getElementById('hamburger-btn');
    const isOpen  = sidebar.classList.toggle('sidebar-open');
    overlay.classList.toggle('visible', isOpen);
    if (btn) btn.style.display = isOpen ? 'none' : '';
}

function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('sidebar-open');
    document.getElementById('sidebar-overlay')?.classList.remove('visible');
    const btn = document.getElementById('hamburger-btn');
    if (btn) btn.style.display = '';
}

function applyRoleVisibility() {
    const roles = currentUser?.roles || [];
    document.querySelectorAll('[data-requires-role]').forEach(el => {
        el.classList.toggle('hidden', !el.dataset.requiresRole.split(' ').some(r => roles.includes(r)));
    });
}

function updateRoleBasedNav() { applyRoleVisibility(); }

function renderSidebarUser() {
    const el = document.getElementById('sidebar-user');
    if (!el || !currentUser) return;
    updateRoleBasedNav();
    const initials = (currentUser.name || 'Ä')
        .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    el.innerHTML = `
        <div class="sidebar-user-row">
            <div class="sidebar-user-clickable"
                 onclick="showView('account', document.getElementById('nav-account')); loadAccountView()"
                 title="${t('action.my_account')}">
                <div class="sidebar-avatar">${initials}</div>
                <div class="sidebar-user-text">
                    <div class="sidebar-user-name">${currentUser.name}</div>
                    <div class="sidebar-user-email">${currentUser.email}</div>
                </div>
            </div>
        </div>
    `;
}

// Kept for compatibility (auth form may still exist in HTML)
function toggleAuthMode() {}
async function handleAuthSubmit() { await loadCurrentUser(); }
function showAuthError(msg) { console.warn('Auth error:', msg); }

async function handleLogout() {
    currentUser = null;
    location.reload();
}
