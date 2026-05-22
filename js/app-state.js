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
let lastGeneratedCV     = null;
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
}

async function setLanguage(lang, persist = true) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    applyTranslations();
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
    // parts[0] = 'auth' | 'competence' | 'cv' | 'personality' | 'profiles' | 'sokprofil' | 'kandidater'

    try {
        // ── AUTH ────────────────────────────────────────────────────────────
        if (parts[0] === 'auth') {
            if (parts[1] === 'me' && method === 'GET') {
                const p = await cvDb.profile.get();
                const lang = await cvDb.settings.get('language');
                return new LocalResponse({
                    id: 1, name: p?.public_name || 'Användare',
                    email: p?.email || '',
                    language: lang || currentLang,
                    roles: [],
                });
            }
            if (parts[1] === 'me' && method === 'PUT') {
                const profile = await cvDb.profile.get() || {};
                const profileUpdates = {};
                if (body?.language) await cvDb.settings.set('language', body.language);
                if (body?.name)     profileUpdates.public_name = body.name;
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
                const p = await cvDb.profile.get() || {};
                return new LocalResponse({
                    public_name: p.public_name || null,
                    public_phone: p.public_phone || null,
                    roles: p.roles || null,
                    desired_city: p.desired_city || null,
                    desired_employment: p.desired_employment || [],
                    desired_workplace: p.desired_workplace || [],
                    desired_domains: p.desired_domains || [],
                    unwanted_domains: p.unwanted_domains || [],
                    willing_to_commute: p.willing_to_commute || false,
                    searchable: p.searchable || false,
                    available_from: p.available_from || null,
                    description: p.description || null,
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

        // ── COMPETENCE ───────────────────────────────────────────────────────
        if (parts[0] === 'competence') {

            // /competence/cvs/* (used by app-sokprofil.js / app-cv.js)
            if (parts[1] === 'cvs') {
                if (!parts[2] && method === 'GET') {
                    const list = await cvDb.cvs.list();
                    return new LocalResponse(list.map(cv => ({
                        ...cv,
                        is_processed: Boolean(cv.structured_data && Object.keys(cv.structured_data).length),
                        is_vectorized: false,
                    })));
                }
                if (parts[2] === 'upload' && method === 'POST') {
                    const file = body instanceof FormData ? body.get('file') : null;
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
                    return new LocalResponse({ ...cv, is_processed: true, is_vectorized: false, structured_data: structured });
                }
                if (parts[2] && parts[3] === 'vectorize' && method === 'POST') {
                    return new LocalResponse({ message: 'Vektorisering inte tillgänglig i browser-läge' });
                }
                if (parts[2] && !parts[3] && method === 'DELETE') {
                    await cvDb.cvs.delete(Number(parts[2]));
                    return new LocalResponse({});
                }
            }

            // stats
            if (parts[1] === 'stats') {
                const [skillList, expList, eduList, certList, cvList] = await Promise.all([
                    cvDb.skills.list(), cvDb.experiences.list(),
                    cvDb.education.list(), cvDb.certifications.list(), cvDb.cvs.list(),
                ]);
                const { by_category } = await cvDb.skills.stats();
                return new LocalResponse({
                    total_skills: skillList.length,
                    total_experiences: expList.filter(e => e.experience_type === 'work').length,
                    total_source_documents: cvList.length,
                    skills_by_category: by_category,
                    total_education: eduList.length,
                    total_certifications: certList.length,
                });
            }

            // skills CRUD
            if (parts[1] === 'skills' && !parts[2]) {
                if (method === 'GET')    return new LocalResponse({ skills: await cvDb.skills.list() });
                if (method === 'POST')   return new LocalResponse(await cvDb.skills.add(body));
                if (method === 'DELETE') { await cvDb.skills.deleteAll(); return new LocalResponse({}); }
            }
            if (parts[1] === 'skills' && parts[2]) {
                const id = Number(parts[2]);
                if (method === 'PUT')    return new LocalResponse(await cvDb.skills.update(id, body));
                if (method === 'DELETE') { await cvDb.skills.delete(id); return new LocalResponse({}); }
            }

            // experiences CRUD
            if (parts[1] === 'experiences' && !parts[2]) {
                if (method === 'GET')    return new LocalResponse({ experiences: await cvDb.experiences.list() });
                if (method === 'POST')   return new LocalResponse(await cvDb.experiences.add(body));
                if (method === 'DELETE') { await cvDb.experiences.deleteAll(); return new LocalResponse({}); }
            }
            if (parts[1] === 'experiences' && parts[2] === 'merge' && method === 'POST') {
                const ids = body.experience_ids || [];
                const exps = await Promise.all(ids.map(id => cvDb.experiences.get(Number(id))));
                const merged = await cvAI.mergeExperiences(exps);
                const allRelatedSkills = [...new Set(exps.flatMap(e => e.related_skills || []))];
                const newExp = await cvDb.experiences.add({ ...merged, related_skills: allRelatedSkills });
                for (const id of ids) await cvDb.experiences.delete(Number(id));
                return new LocalResponse({ merged_count: ids.length, title: newExp.title, id: newExp.id });
            }
            if (parts[1] === 'experiences' && parts[2] && !parts[3]) {
                const id = Number(parts[2]);
                if (method === 'PUT')    return new LocalResponse(await cvDb.experiences.update(id, body));
                if (method === 'DELETE') { await cvDb.experiences.delete(id); return new LocalResponse({}); }
            }
            if (parts[1] === 'experiences' && parts[2] && parts[3]) {
                const id = Number(parts[2]);
                const sub = parts[3];
                // achievements
                if (sub === 'achievements') {
                    if (!parts[4]) {
                        if (method === 'POST') return new LocalResponse(await cvDb.experiences.addAchievement(id, body.text));
                        if (method === 'PUT')  return new LocalResponse(await cvDb.experiences.replaceAchievements(id, body.achievements));
                    } else {
                        const idx = Number(parts[4]);
                        if (method === 'PUT')    return new LocalResponse(await cvDb.experiences.updateAchievement(id, idx, body.text));
                        if (method === 'DELETE') return new LocalResponse(await cvDb.experiences.deleteAchievement(id, idx));
                    }
                }
                if (sub === 'improve-achievements' && method === 'POST') {
                    const exp = await cvDb.experiences.get(id);
                    const improved = await cvAI.improveAchievements(exp.achievements || [], exp.title, exp.organization);
                    await cvDb.experiences.replaceAchievements(id, improved);
                    return new LocalResponse({ achievements: improved });
                }
                if (sub === 'description' && method === 'PUT') {
                    return new LocalResponse(await cvDb.experiences.updateDescription(id, body.description));
                }
                if (sub === 'period' && method === 'PUT') {
                    return new LocalResponse(await cvDb.experiences.updatePeriod(id, body));
                }
                if (sub === 'skills') {
                    if (!parts[4]) {
                        if (method === 'POST') return new LocalResponse(await cvDb.experiences.addSkill(id, body.skill_name));
                    } else {
                        if (method === 'DELETE') return new LocalResponse(await cvDb.experiences.removeSkill(id, Number(parts[4])));
                    }
                }
            }

            // education
            if (parts[1] === 'education' && !parts[2]) {
                if (method === 'GET')    return new LocalResponse({ education: await cvDb.education.list() });
                if (method === 'POST')   return new LocalResponse(await cvDb.education.add(body));
                if (method === 'DELETE') { await cvDb.education.deleteAll(); return new LocalResponse({}); }
            }
            if (parts[1] === 'education' && parts[2]) {
                const id = Number(parts[2]);
                if (method === 'PUT')    return new LocalResponse(await cvDb.education.update(id, body));
                if (method === 'DELETE') { await cvDb.education.delete(id); return new LocalResponse({}); }
            }

            // certifications
            if (parts[1] === 'certifications' && !parts[2]) {
                if (method === 'GET')  return new LocalResponse({ certifications: await cvDb.certifications.list() });
                if (method === 'POST') return new LocalResponse(await cvDb.certifications.add(body));
            }
            if (parts[1] === 'certifications' && parts[2]) {
                const id = Number(parts[2]);
                if (method === 'PUT')    return new LocalResponse(await cvDb.certifications.update(id, body));
                if (method === 'DELETE') { await cvDb.certifications.delete(id); return new LocalResponse({}); }
            }

            // reset
            if (parts[1] === 'reset' && method === 'DELETE') {
                await cvDb.skills.deleteAll();
                await cvDb.experiences.deleteAll();
                return new LocalResponse({});
            }

            // merge CV into bank
            if (parts[1] === 'merge' && parts[2] && method === 'POST') {
                const cv = await cvDb.cvs.get(Number(parts[2]));
                if (!cv) return new LocalResponse({ detail: 'CV hittades inte' }, 404);
                const result = await cvCompSvc.mergeCVIntoBank(cv);
                return new LocalResponse(result);
            }

            // merge-all
            if (parts[1] === 'merge-all' && method === 'POST') {
                const result = await cvCompSvc.mergeAllCVs();
                return new LocalResponse(result);
            }

            // fetch-job-url
            if (parts[1] === 'fetch-job-url' && method === 'POST') {
                const content = await cvAI.fetchJobUrl(body.url);
                return new LocalResponse({ content });
            }

            // match-job
            if (parts[1] === 'match-job' && method === 'POST') {
                const [skills, exps, profile] = await Promise.all([
                    cvDb.skills.list(),
                    cvDb.experiences.list(),
                    cvDb.profile.get(),
                ]);
                if (!skills.length && !exps.length) {
                    return new LocalResponse({ detail: 'Kompetensbanken är tom' }, 400);
                }
                const seekerProfile = profile ? {
                    roles: profile.roles || null,
                    desired_city: profile.desired_city || null,
                    desired_employment: profile.desired_employment || [],
                    desired_workplace: profile.desired_workplace || [],
                    desired_domains: profile.desired_domains || [],
                    unwanted_domains: profile.unwanted_domains || [],
                    willing_to_commute: profile.willing_to_commute || false,
                } : null;

                const result = await cvAI.matchJob(
                    skills,
                    exps,
                    body.job_title || '',
                    body.job_description || '',
                    seekerProfile,
                );

                // Enrich experiences with full data
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
                const expList = await cvDb.experiences.list();
                const matched = matched_experience_ids.length
                    ? expList.filter(e => matched_experience_ids.includes(e.id))
                    : expList;
                const result = await cvAI.generateCV(job_description, matched, skills);
                return new LocalResponse(result);
            }

            // generate-loghouse-cv
            if (parts[1] === 'generate-loghouse-cv' && method === 'POST') {
                const { job_description, matched_experience_ids = [], skills: reqSkills = [] } = body;
                const [expList, skillList, eduList, cvList, profile, answers] = await Promise.all([
                    cvDb.experiences.list(),
                    cvDb.skills.list(),
                    cvDb.education.list(),
                    cvDb.cvs.list(),
                    cvDb.profile.get(),
                    cvDb.pa.list(),
                ]);
                const matched = matched_experience_ids.length
                    ? expList.filter(e => matched_experience_ids.includes(e.id))
                    : expList;
                const cvTexts = cvList.map(c => c.original_text).filter(Boolean);

                // Build personality answers with question text
                const allQ = await cvDb.pq.list();
                const qMap = Object.fromEntries(allQ.map(q => [q.id, q]));
                const richAnswers = answers.map(a => ({
                    question: qMap[a.question_id]?.question_text || '',
                    category: qMap[a.question_id]?.category || '',
                    answer: a.answer_text || '',
                    likert: a.likert_score,
                }));

                const result = await cvAI.generateLogHouseCV(
                    job_description, matched, reqSkills.length ? reqSkills : skillList,
                    profile || {}, richAnswers, eduList, cvTexts
                );
                return new LocalResponse(result);
            }

            // improvement-tips
            if (parts[1] === 'improvement-tips' && method === 'POST') {
                const { job_description, overall_score, current_skills = [], missing_skills = [], matched_experience_ids = [] } = body;
                const expList = await cvDb.experiences.list();
                const matched = matched_experience_ids.length
                    ? expList.filter(e => matched_experience_ids.includes(e.id))
                    : expList;
                const result = await cvAI.improvementTips(job_description, overall_score, current_skills, missing_skills, matched);
                return new LocalResponse(result);
            }
        }

        // ── PERSONALITY ──────────────────────────────────────────────────────
        if (parts[0] === 'personality') {
            if (parts[1] === 'questions') {
                if (!parts[2] && method === 'GET')  return new LocalResponse({ questions: await cvDb.pq.list() });
                if (!parts[2] && method === 'POST') {
                    const q = await cvDb.pq.add(body);
                    // Generate embedding async
                    if (body.question_text && typeof cvEmbed !== 'undefined') {
                        cvEmbed.generate(body.question_text).then(emb =>
                            cvDb.pq.update(q.id, { embedding: emb })
                        ).catch(() => {});
                    }
                    return new LocalResponse(q);
                }
                if (parts[2] === 'extract' && method === 'POST') {
                    const questions = await cvAI.extractPersonalityQuestions(body.md_content || body.content || '');
                    return new LocalResponse({ imported: questions.length, questions });
                }
                if (parts[2] === 'check-similar' && method === 'POST') {
                    const { question_text, threshold = 0.85 } = body;
                    if (typeof cvEmbed === 'undefined') return new LocalResponse({ is_duplicate: false, score: 0, match: null });
                    const allQ = await cvDb.pq.list();
                    const { isDuplicate, match, similarity } = await cvEmbed.checkSimilar(question_text, allQ, threshold);
                    return new LocalResponse({ is_duplicate: isDuplicate, score: Math.round(similarity * 100), match: match || null });
                }
                if (parts[2] === 'backfill-embeddings' && method === 'POST') {
                    if (typeof cvEmbed === 'undefined') return new LocalResponse({ updated: 0 });
                    const allQ = await cvDb.pq.list();
                    const updated = await cvEmbed.backfill(allQ, q => q.question_text, (id, emb) => cvDb.pq.update(id, { embedding: emb }));
                    return new LocalResponse({ updated });
                }
                if (parts[2] === 'import' && method === 'POST') {
                    const questions = await cvAI.extractPersonalityQuestions(body.md_content || body.content || '');
                    let imported = 0;
                    for (const q of questions) {
                        if (typeof cvEmbed !== 'undefined' && q.question_text) {
                            try { q.embedding = await cvEmbed.generate(q.question_text); } catch {}
                        }
                        await cvDb.pq.add(q);
                        imported++;
                    }
                    return new LocalResponse({ imported });
                }
                if (parts[2] && method === 'PUT')    return new LocalResponse(await cvDb.pq.update(Number(parts[2]), body));
                if (parts[2] && method === 'DELETE') { await cvDb.pq.delete(Number(parts[2])); return new LocalResponse({}); }
            }

            if (parts[1] === 'answers') {
                if (!parts[2] && method === 'GET') return new LocalResponse({ answers: await cvDb.pa.list() });
                if (parts[2] === 'next' && method === 'GET') {
                    const q = await cvDb.pa.nextUnanswered([]);
                    const answer = q ? await cvDb.pa.getByQuestion(q.id) : null;
                    return new LocalResponse({ question: q || null, answer: answer || null });
                }
                if (parts[2] === 'big-five' && method === 'GET') {
                    const scores = await cvDb.pa.bigFiveScores();
                    return new LocalResponse({ scores });
                }
                if (!parts[2] && method === 'POST') {
                    const a = await cvDb.pa.upsert(body.question_id, body);
                    return new LocalResponse(a);
                }
                if (parts[2] && method === 'PUT') {
                    const existing = await cvDb.pa.list().then(list => list.find(a => a.id === Number(parts[2])));
                    const a = await cvDb.pa.upsert(existing?.question_id || body.question_id, body);
                    return new LocalResponse(a);
                }
            }

            if (parts[1] === 'description' && method === 'POST') {
                const [answers, profile, skills, exps, cvList] = await Promise.all([
                    cvDb.pa.list(), cvDb.profile.get(), cvDb.skills.list(),
                    cvDb.experiences.list(), cvDb.cvs.list(),
                ]);
                const allQ = await cvDb.pq.list();
                const qMap = Object.fromEntries(allQ.map(q => [q.id, q]));
                const richAnswers = answers.map(a => ({
                    question: qMap[a.question_id]?.question_text || '',
                    context: qMap[a.question_id]?.context || null,
                    category: qMap[a.question_id]?.category || '',
                    big_five: qMap[a.question_id]?.big_five_trait || null,
                    answer: a.answer_text || '',
                    likert: a.likert_score,
                }));
                const name = profile?.public_name || 'Kandidat';
                const cvTexts = cvList.map(c => c.original_text).filter(Boolean);
                const description = await cvAI.generatePersonalityDescription(
                    richAnswers, profile || {}, skills, exps, cvTexts, name
                );
                return new LocalResponse({ description });
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

        // ── KANDIDATER (stub — multi-user feature removed) ───────────────────
        if (parts[0] === 'kandidater') {
            if (method === 'GET') return new LocalResponse([]);
            return new LocalResponse({});
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
            <button id="gen-cv-btn" class="btn btn-primary" onclick="handleGenerateCV()">
                ${t('match.gen_btn')}
            </button>
            <button id="gen-lh-cv-btn" class="btn btn-primary" onclick="handleGenerateLHCV()">
                ${t('match.gen_lh_btn')}
            </button>
        </div>` : ''}
    `;

    optimizeResult.classList.remove('hidden');
}

// ── AUTH (browser-only: auto-login from IndexedDB) ─────────────────────────
async function loadCurrentUser() {
    try {
        await cvDb.init();
        let profile = await cvDb.profile.get();
        const lang  = await cvDb.settings.get('language');
        const rolesJson = await cvDb.settings.get('user_roles');
        const roles = rolesJson ? JSON.parse(rolesJson) : [];

        currentUser = {
            id: 1,
            name: profile?.public_name || 'Användare',
            email: profile?.email || '',
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
    selectedCV          = null;
    allCVs              = [];
    lastMatchResult     = null;
    lastJobDesc         = '';
    lastGeneratedCV     = null;
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

function showApp() {
    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    applyTranslations();
    renderSidebarUser();
    const h1 = document.querySelector('#view-dashboard .view-header h1');
    if (h1 && currentUser) {
        h1.textContent = `${t('dash.welcome')}, ${currentUser.name.split(' ')[0]}!`;
    }
    showView('dashboard', document.getElementById('nav-dashboard'));
    loadCVs();
    loadBankData();
    loadSpCandidateCVs();
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
