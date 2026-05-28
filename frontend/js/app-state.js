// ── Constants ─────────────────────────────────────────────────────────────────
// Browser-only version: API_BASE_URL stripped in apiFetch dispatcher
const API_BASE_URL = '';

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
    if (level === 'Erfaren')        return 'chip-level-2';
    if (level === 'Mycket erfaren') return 'chip-level-3';
    return 'chip-technical';
}

function mimeTypeForFilename(filename) {
    const ext = (filename || '').toLowerCase().split('.').pop();
    return _MIME_MAP[ext] || 'application/octet-stream';
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
            statusFn?.('Filen är för stor (max 10 MB)', 'error');
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

    function render(input) {
        const dd = getDD(input);
        const f  = (input.value || '').toLowerCase();
        const hits = CATS.filter(c => !f || c.toLowerCase().includes(f));
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
        if (!own.profile_uuid) {
            own = await cvDb.kandidater.update(own.id, { profile_uuid: crypto.randomUUID() });
        }
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
        is_own_profile:     true,
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
                start_date: e.start_date || null, end_date: e.end_date || null,
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
                    name:     own?.public_name || p?.public_name || 'Användare',
                    email:    p?.email         || own?.email     || '',
                    language: lang             || currentLang,
                    roles: [],
                });
            }
            if (parts[1] === 'me' && method === 'PUT') {
                const profile = await cvDb.profile.get() || {};
                const profileUpdates = {};
                if (body?.language) await cvDb.settings.set('language', body.language);
                if (body?.name) {
                    // Only pre-fill public name if it hasn't been set yet
                    if (!profile.public_name) profileUpdates.public_name = body.name;
                    const own = await cvDb.kandidater.getOwn();
                    if (own && !own.public_name) {
                        await cvDb.kandidater.update(own.id, { public_name: body.name });
                    }
                }
                if (body?.email)    profileUpdates.email = body.email;
                if (body?.roles)    await cvDb.settings.set('user_roles', JSON.stringify(body.roles));
                if (Object.keys(profileUpdates).length) {
                    await cvDb.profile.save({ ...profile, ...profileUpdates });
                }
                const roles = body?.roles ?? currentUser?.roles ?? [];
                const user = {
                    id: 1,
                    name: body?.name || currentUser?.name || 'Användare',
                    email: body?.email || currentUser?.email || '',
                    language: body?.language || currentUser?.language || 'sv',
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

        // ── SOKPROFIL ────────────────────────────────────────────────────────
        if (parts[0] === 'sokprofil') {
            if (method === 'GET') {
                const [p, ownRaw] = await Promise.all([cvDb.profile.get(), cvDb.kandidater.getOwn()]);
                const own = (ownRaw && !ownRaw.profile_uuid)
                    ? await cvDb.kandidater.update(ownRaw.id, { profile_uuid: crypto.randomUUID() })
                    : ownRaw;
                const prof = p || {};
                return new LocalResponse({
                    public_name: prof.public_name || null,
                    public_phone: prof.public_phone || null,
                    roles: prof.roles || null,
                    desired_city: prof.desired_city || null,
                    desired_employment: prof.desired_employment || [],
                    desired_workplace: prof.desired_workplace || [],
                    desired_domains: prof.desired_domains || [],
                    unwanted_domains: prof.unwanted_domains || [],
                    willing_to_commute: prof.willing_to_commute || false,
                    searchable: prof.searchable || false,
                    available_from: prof.available_from || null,
                    description: prof.description || null,
                    profile_uuid: own?.profile_uuid || null,
                });
            }
            if (method === 'PUT') {
                await cvDb.profile.save({ ...(await cvDb.profile.get() || {}), ...body });
                return new LocalResponse(body);
            }
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
                    const [text, fileData] = await Promise.all([cvPdf.extractText(file), file.arrayBuffer()]);
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
                const [skills, exps, own] = await Promise.all([
                    cvDb.kandSkills.listFor(ownId),
                    cvDb.kandExperiences.listFor(ownId),
                    cvDb.kandidater.get(ownId),
                ]);
                if (!skills.length && !exps.length) {
                    return new LocalResponse({ detail: 'Kompetensbanken är tom' }, 400);
                }
                const seekerProfile = own ? {
                    roles:              own.roles              || null,
                    desired_city:       own.desired_city       || null,
                    desired_employment: own.desired_employment || [],
                    desired_workplace:  own.desired_workplace  || [],
                    desired_domains:    own.desired_domains    || [],
                    unwanted_domains:   own.unwanted_domains   || [],
                    willing_to_commute: own.willing_to_commute || false,
                } : null;
                const result = await cvAI.matchJob(skills, exps, body.job_title || '', body.job_description || '', seekerProfile);
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
                const { job_description, matched_experience_ids = [], skills: reqSkills = [] } = body;
                const [expList, skillList, eduList, cvList, own] = await Promise.all([
                    cvDb.kandExperiences.listFor(ownId),
                    cvDb.kandSkills.listFor(ownId),
                    cvDb.kandEducation.listFor(ownId),
                    cvDb.kandCvs.listFor(ownId),
                    cvDb.kandidater.get(ownId),
                ]);
                const matched = matched_experience_ids.length
                    ? expList.filter(e => matched_experience_ids.includes(e.id)) : expList;
                const cvTexts = cvList.map(c => c.original_text).filter(Boolean);
                const profile = own ? { public_name: own.public_name || '', email: own.email || '',
                    phone: own.public_phone || '', city: own.desired_city || '' } : {};
                const result = await cvAI.generateLogHouseCV(
                    job_description, matched, reqSkills.length ? reqSkills : skillList,
                    profile, [], eduList, cvTexts);
                return new LocalResponse(result);
            }

            // generate-henrik-cv
            if (parts[1] === 'generate-henrik-cv' && method === 'POST') {
                const { job_description, matched_experience_ids = [], skills: reqSkills = [] } = body;
                const [expList, skillList, eduList, certList, own] = await Promise.all([
                    cvDb.kandExperiences.listFor(ownId),
                    cvDb.kandSkills.listFor(ownId),
                    cvDb.kandEducation.listFor(ownId),
                    cvDb.kandCertifications.listFor(ownId),
                    cvDb.kandidater.get(ownId),
                ]);
                const matched = matched_experience_ids.length
                    ? expList.filter(e => matched_experience_ids.includes(e.id)) : expList;
                const profile = own ? { public_name: own.public_name || '', email: own.email || '',
                    phone: own.public_phone || '', city: own.desired_city || '' } : {};
                const result = await cvAI.generateHenrikCV(
                    job_description, matched, reqSkills.length ? reqSkills : skillList,
                    profile, eduList, certList);
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
            if (parts[2] === 'job' && method === 'PUT') {
                return new LocalResponse(await cvDb.searchProfiles.saveJob(Number(parts[1]), body));
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
                const filtered = await Promise.all(
                    all.filter(k => !k.is_own_profile).map(async k =>
                        k.profile_uuid ? k : cvDb.kandidater.update(k.id, { profile_uuid: crypto.randomUUID() })
                    )
                );
                return new LocalResponse({ kandidater: filtered });
            }

            // POST /kandidater/
            if (method === 'POST' && parts.length === 1) {
                const saved = await cvDb.kandidater.add(body);
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
                if (toDelete?.is_own_profile) return new LocalResponse({ detail: 'Kan inte ta bort egen profil' }, 403);
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
                    const [text, fileData] = await Promise.all([
                        cvPdf.extractText(file),
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
                            start_date:      e.start_date   || null,
                            end_date:        e.end_date     || null,
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
                } : null;
                const result = await cvAI.matchJob(
                    skills,
                    exps,
                    body.job_title || '',
                    body.job_description || '',
                    seekerProfile,
                );
                const expById = Object.fromEntries(exps.map(e => [e.id, e]));
                result.experiences = (result.experiences || []).map(item => {
                    const exp = expById[item.id];
                    return exp ? { ...item, title: exp.title, organization: exp.organization,
                        start_date: exp.start_date, end_date: exp.end_date,
                        is_current: exp.is_current, experience_type: exp.experience_type } : item;
                });
                return new LocalResponse(result);
            }

            // multi-match: rank all kandidater against a job
            if (parts[1] === 'multi-match' && method === 'POST') {
                const allKand = (await cvDb.kandidater.list()).filter(k => !k.is_own_profile);
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
                        };
                        const result = await cvAI.matchJob(skills, exps, '', body.job_description || '', seekerProfile);
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

            // generate-henrik-cv for kandidat
            if (kid && parts[2] === 'generate-henrik-cv' && method === 'POST') {
                const { job_description, matched_experience_ids = [], skills: reqSkills = [] } = body;
                const [expList, skillList, eduList, certList, kandidat] = await Promise.all([
                    cvDb.kandExperiences.listFor(kid),
                    cvDb.kandSkills.listFor(kid),
                    cvDb.kandEducation.listFor(kid),
                    cvDb.kandCertifications.listFor(kid),
                    cvDb.kandidater.get(kid),
                ]);
                const matched = matched_experience_ids.length
                    ? expList.filter(e => matched_experience_ids.includes(e.id))
                    : expList;
                const profile = kandidat ? {
                    public_name: kandidat.public_name || kandidat.name || '',
                    email:       kandidat.email || '',
                    phone:       kandidat.phone || '',
                    city:        kandidat.city  || kandidat.desired_city || '',
                } : {};
                const result = await cvAI.generateHenrikCV(
                    job_description, matched,
                    reqSkills.length ? reqSkills : skillList,
                    profile, eduList, certList
                );
                return new LocalResponse(result);
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
function showView(viewId, navEl) {
    if (!currentUser) { showAuthView(); return; }
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const view = document.getElementById('view-' + viewId);
    if (view) view.classList.add('active');
    if (navEl) navEl.classList.add('active');
    closeSidebar();
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
    const missing = result.missing_skills ?? [];
    const jobInfo = result.job_info ?? {};
    const profileFit = result.profile_fit ?? [];

    const typeLabels = { work: t('tab.erfarenheter'), education: t('tab.utbildning'), certification: t('tab.certifikat'), project: 'Projekt' };

    const skillsHtml = skills.map(s => `
        <div class="match-item">
            <div class="match-item-header">
                <span class="match-item-name">${s.skill_name}</span>
                <span class="match-item-score ${scoreColor(s.score)}">${s.score}%</span>
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
                <span class="match-item-score ${scoreColor(e.score)}">${e.score}%</span>
            </div>
            ${scoreBar(e.score)}
            <div class="match-item-reason">${e.reason}</div>
        </div>
    `).join('');

    const missingHtml = missing.length
        ? missing.map(m => `<span class="match-missing-chip">${m}</span>`).join('')
        : '<p class="match-empty">Inga saknade kompetenser identifierade</p>';

    const jobInfoItems = [
        { icon: '📍', value: jobInfo.city },
        { icon: '⏱', value: jobInfo.employment_type },
        { icon: '📋', value: jobInfo.duration },
        { icon: '🏢', value: jobInfo.workplace },
    ].filter(i => i.value);

    const jobInfoHtml = jobInfoItems.length ? `
        <div class="job-info-bar">
            ${jobInfoItems.map(i => `<span class="job-info-chip">${i.icon} ${i.value}</span>`).join('')}
        </div>` : '';

    const fitIcon = m => m === true ? '✅' : m === false ? '❌' : '❓';
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
                            <span class="fit-arrow">→</span>
                            <span class="fit-pref">${f.preference || 'Ej angiven'}</span>
                        </span>
                        ${f.note ? `<span class="fit-note">${f.note}</span>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>` : '';

    optimizeResult.innerHTML = `
        <div class="match-result-header">
            <div class="match-overall-score ${scoreColor(overall)}">
                <span class="match-overall-number">${overall}</span>
                <span class="match-overall-label">/ 100</span>
            </div>
            <div>
                ${jobInfoHtml}
                <p class="match-summary">${result.summary || ''}</p>
            </div>
        </div>

        ${profileFitHtml}

        <div class="match-sections">
            <div class="match-section">
                <h4 class="match-section-title">${t('match.section_skills')} (${skills.length})</h4>
                <div class="match-list">${skillsHtml || `<p class="match-empty">${t('match.no_missing')}</p>`}</div>
            </div>
            <div class="match-section">
                <h4 class="match-section-title">${t('match.section_exp')} (${experiences.length})</h4>
                <div class="match-list">${expHtml || `<p class="match-empty">${t('match.no_missing')}</p>`}</div>
            </div>
        </div>

        ${missing.length ? `
        <div class="match-missing-section">
            <h4 class="match-section-title">${t('match.section_missing')} (${missing.length})</h4>
            <div class="match-missing-chips">${missingHtml}</div>
        </div>` : ''}

        ${experiences.length > 0 ? `
        <div class="gen-cv-action">
            <button id="tips-btn" class="btn btn-secondary" onclick="handleTips()">
                ${t('match.tips_btn')}
            </button>
            <button id="gen-lh-cv-btn" class="btn btn-primary" onclick="handleGenerateLHCV()">
                ${t('match.gen_lh_btn')}
            </button>
            <button id="gen-hc-cv-btn" class="btn btn-primary" onclick="handleGenerateHenrikCV()">
                ${t('match.gen_hc_btn')}
            </button>
        </div>` : ''}
    `;

    optimizeResult.classList.remove('hidden');
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
            name:  own?.public_name  || profile?.public_name || 'Användare',
            email: profile?.email    || own?.email           || '',
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

function _loadSidebarVersion() {
    const el = document.getElementById('sidebar-version');
    if (!el) return;
    fetch('version.json?_=' + Date.now())
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.version) el.textContent = `v${d.version}`; })
        .catch(() => {});
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
