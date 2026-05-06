// ── Constants ─────────────────────────────────────────────────────────────────
const API_BASE_URL = 'http://localhost:8018/api/v1';

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
let lastMatchKandidatId = null;  // null = egen bank, number = kandidat-id

// Auth state
let currentUser = null;
let authMode    = 'login'; // 'login' | 'register'

// Language state
let currentLang = localStorage.getItem('lang') || 'sv';

// Edit state for inline forms
let spEditingSkillId  = null, spEditingExpId   = null,
    spEditingEduId    = null, spEditingCertId  = null;
let kandEditingSkillId = null, kandEditingExpId = null,
    kandEditingEduId  = null, kandEditingCertId = null;

// Cached lists (for cancel without re-fetch)
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
    // Sync language dropdowns
    document.querySelectorAll('#sidebar-language, #auth-language, #account-language').forEach(sel => {
        sel.value = currentLang;
    });
}

async function setLanguage(lang, persist = true) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    applyTranslations();
    if (persist && currentUser) {
        try {
            await apiFetch(`${API_BASE_URL}/auth/me`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language: lang }),
            });
        } catch { /* ignore */ }
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

// Escape value for use inside HTML attribute strings
const esc = v => (v == null ? '' : String(v)).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── apiFetch — wraps fetch with credentials + 401-guard ───────────────────────
async function apiFetch(url, options = {}) {
    const response = await fetch(url, { ...options, credentials: 'include' });
    if (response.status === 401) {
        currentUser = null;
        showAuthView();
        throw new Error('Inte inloggad');
    }
    return response;
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

// ── Match result helpers (shared between optimize + matchakandidater) ─────────
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
        </div>` : ''}
    `;

    optimizeResult.classList.remove('hidden');
}

// ── AUTH ──────────────────────────────────────────────────────────────────────

async function loadCurrentUser() {
    try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' });
        if (res.status === 401) {
            showAuthView();
            return;
        }
        currentUser = await res.json();
        if (currentUser.language) {
            currentLang = currentUser.language;
            localStorage.setItem('lang', currentLang);
        }
        showApp();
    } catch {
        showAuthView();
    }
}

function resetAllState() {
    // ── app-state.js ──────────────────────────────────────────────────────────
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

    // ── app-bank.js ───────────────────────────────────────────────────────────
    if (typeof bankSkills            !== 'undefined') bankSkills            = [];
    if (typeof bankExperiences       !== 'undefined') bankExperiences       = [];
    if (typeof activeBankTab         !== 'undefined') activeBankTab         = 'skills';
    if (typeof selectedExperienceIds !== 'undefined') selectedExperienceIds = new Set();

    // ── app-sokprofil.js ──────────────────────────────────────────────────────
    if (typeof spCandidateCVs !== 'undefined') spCandidateCVs = [];

    // ── app-kandidater.js ─────────────────────────────────────────────────────
    if (typeof currentKandidatId !== 'undefined') currentKandidatId = null;
    if (typeof kandidaterCache   !== 'undefined') kandidaterCache   = [];
    if (typeof kandUploadSetup   !== 'undefined') kandUploadSetup   = false;
    if (typeof kandCandidateCVs  !== 'undefined') kandCandidateCVs  = [];

    // ── DOM: hide / clear persistent panels ───────────────────────────────────
    const spDetail = document.getElementById('sp-cv-detail');
    if (spDetail) spDetail.style.display = 'none';

    const optResult = document.getElementById('optimize-result');
    if (optResult) { optResult.innerHTML = ''; optResult.classList.add('hidden'); }

    const genCV = document.getElementById('generated-cv-output');
    if (genCV) genCV.classList.add('hidden');

    if (jobDescription) jobDescription.value = '';

    const bankContent = document.getElementById('bank-content');
    if (bankContent) bankContent.innerHTML = '';

    // Clear sokprofil list containers (DOM survives between logins — must be emptied)
    ['sp-skills-list', 'sp-experiences-list', 'sp-education-list', 'sp-certifications-list',
     'kand-skills-list', 'kand-experiences-list', 'kand-education-list', 'kand-certifications-list']
        .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });

    // Reset sokprofil tab back to basinfo so no stale tab content is visible on next login
    ['basinfo', 'kompetenser', 'erfarenheter', 'utbildning', 'certifikat', 'cv'].forEach(t => {
        const tabEl = document.getElementById(`sp-tab-${t}`);
        const btnEl = document.getElementById(`sp-tab-btn-${t}`);
        if (tabEl) tabEl.style.display = t === 'basinfo' ? '' : 'none';
        if (btnEl) btnEl.classList.toggle('active', t === 'basinfo');
    });

    // Reset dashboard counters to 0
    ['dash-cv-count', 'dash-skills-count', 'dash-exp-count', 'dash-edu-count', 'dash-cert-count', 'dash-kandidater-count']
        .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '0'; });
    // Hide all role-gated elements (will be re-shown by applyRoleVisibility() after login)
    document.querySelectorAll('[data-requires-role]').forEach(el => el.classList.add('hidden'));
}

function showAuthView() {
    resetAllState();
    document.getElementById('view-auth').classList.remove('hidden');
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('main-content').classList.add('hidden');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    applyTranslations();
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
    if (roles.includes('Säljare') && typeof loadDashKandidaterCount === 'function') {
        loadDashKandidaterCount();
    }
}

function updateRoleBasedNav() {
    applyRoleVisibility();
}

function renderSidebarUser() {
    const el = document.getElementById('sidebar-user');
    if (!el || !currentUser) return;
    updateRoleBasedNav();
    const initials = currentUser.name
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
            <button class="btn-logout" onclick="handleLogout()" title="${t('action.logout')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
            </button>
        </div>
    `;
}

function toggleAuthMode() {
    authMode = authMode === 'login' ? 'register' : 'login';
    const isReg = authMode === 'register';
    document.getElementById('auth-heading').textContent      = isReg ? t('auth.register') : t('auth.login');
    document.getElementById('auth-name-group').classList.toggle('hidden', !isReg);
    document.getElementById('auth-submit').textContent       = isReg ? t('auth.submit_register') : t('auth.submit_login');
    document.getElementById('auth-toggle-msg').textContent   = isReg ? t('auth.has_account') : t('auth.no_account');
    document.getElementById('auth-toggle-link').textContent  = isReg ? t('auth.login_link') : t('auth.register');
    document.getElementById('auth-error').classList.add('hidden');
}

async function handleAuthSubmit() {
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    if (!email || !password) { showAuthError('Fyll i e-post och lösenord'); return; }

    const btn = document.getElementById('auth-submit');
    btn.disabled    = true;
    btn.textContent = '…';
    document.getElementById('auth-error').classList.add('hidden');

    try {
        let url, body;
        if (authMode === 'login') {
            url  = `${API_BASE_URL}/auth/login`;
            body = { email, password };
        } else {
            const name = document.getElementById('auth-name').value.trim();
            if (!name) { showAuthError('Ange ditt namn'); btn.disabled = false; btn.textContent = 'Skapa konto'; return; }
            url  = `${API_BASE_URL}/auth/register`;
            body = { name, email, password };
        }

        const res  = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            credentials: 'include',
        });
        const data = await res.json();

        if (!res.ok) { showAuthError(data.detail || t('auth.error_login')); return; }

        currentUser = data;
        if (currentUser.language) {
            currentLang = currentUser.language;
            localStorage.setItem('lang', currentLang);
        }
        showApp();

    } finally {
        btn.disabled    = false;
        btn.textContent = authMode === 'login' ? t('auth.submit_login') : t('auth.submit_register');
    }
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.classList.remove('hidden');
}

async function handleLogout() {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    currentUser = null;
    showAuthView();
}
