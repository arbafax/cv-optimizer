// ── Constants ─────────────────────────────────────────────────────────────────
const API_BASE_URL = 'http://localhost:8000/api/v1';

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

// Edit state for inline forms
let spEditingSkillId  = null, spEditingExpId   = null,
    spEditingEduId    = null, spEditingCertId  = null;
let kandEditingSkillId = null, kandEditingExpId = null,
    kandEditingEduId  = null, kandEditingCertId = null;

// Cached lists (for cancel without re-fetch)
let cachedSpSkills   = [], cachedSpExps   = [], cachedSpEdu   = [], cachedSpCerts   = [];
let cachedKandSkills = [], cachedKandExps = [], cachedKandEdu = [], cachedKandCerts = [];

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

    const typeLabels = { work: 'Arbete', education: 'Utbildning', certification: 'Certifiering', project: 'Projekt' };

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
                <h4 class="match-section-title">Matchande kompetenser (${skills.length})</h4>
                <div class="match-list">${skillsHtml || '<p class="match-empty">Inga matchande kompetenser</p>'}</div>
            </div>
            <div class="match-section">
                <h4 class="match-section-title">Matchande erfarenheter (${experiences.length})</h4>
                <div class="match-list">${expHtml || '<p class="match-empty">Inga matchande erfarenheter</p>'}</div>
            </div>
        </div>

        ${missing.length ? `
        <div class="match-missing-section">
            <h4 class="match-section-title">Saknade kompetenser (${missing.length})</h4>
            <p class="match-missing-desc">Annonsen efterfrågar dessa kompetenser som saknas i din kompetensbank:</p>
            <div class="match-missing-chips">${missingHtml}</div>
        </div>` : ''}

        ${experiences.length > 0 ? `
        <div class="gen-cv-action">
            <button id="tips-btn" class="btn btn-secondary" onclick="handleTips()">
                💡 Tips
            </button>
            <button id="gen-cv-btn" class="btn btn-primary" onclick="handleGenerateCV()">
                Generera anpassat CV-utkast
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
        showApp();
    } catch {
        showAuthView();
    }
}

function showAuthView() {
    document.getElementById('view-auth').classList.remove('hidden');
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('main-content').classList.add('hidden');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
}

function showApp() {
    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    renderSidebarUser();
    const h1 = document.querySelector('#view-dashboard .view-header h1');
    if (h1 && currentUser) {
        h1.textContent = `Välkommen tillbaka, ${currentUser.name.split(' ')[0]}!`;
    }
}

function updateRoleBasedNav() {
    const roles = currentUser?.roles || [];
    const isSaljare = roles.includes('Säljare');
    document.getElementById('nav-minakandidater')
        ?.classList.toggle('hidden', !isSaljare);
    document.getElementById('nav-matchakandidater')
        ?.classList.toggle('hidden', !isSaljare);
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
                 title="Mitt konto">
                <div class="sidebar-avatar">${initials}</div>
                <div class="sidebar-user-text">
                    <div class="sidebar-user-name">${currentUser.name}</div>
                    <div class="sidebar-user-email">${currentUser.email}</div>
                </div>
            </div>
            <button class="btn-logout" onclick="handleLogout()" title="Logga ut">
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
    document.getElementById('auth-heading').textContent      = isReg ? 'Skapa konto' : 'Logga in';
    document.getElementById('auth-name-group').classList.toggle('hidden', !isReg);
    document.getElementById('auth-submit').textContent       = isReg ? 'Skapa konto' : 'Logga in';
    document.getElementById('auth-toggle-msg').textContent   = isReg ? 'Har du ett konto?' : 'Inget konto?';
    document.getElementById('auth-toggle-link').textContent  = isReg ? 'Logga in' : 'Registrera dig';
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

        if (!res.ok) { showAuthError(data.detail || 'Inloggning misslyckades'); return; }

        currentUser = data;
        showApp();

    } finally {
        btn.disabled    = false;
        btn.textContent = authMode === 'login' ? 'Logga in' : 'Skapa konto';
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
    allCVs = []; bankSkills = []; bankExperiences = [];
    lastMatchResult = null; lastJobDesc = ''; lastGeneratedCV = null; lastMatchKandidatId = null;
    showAuthView();
}
