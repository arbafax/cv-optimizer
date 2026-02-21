// API Base URL
const API_BASE_URL = 'http://localhost:8000/api/v1';

// DOM Elements
const uploadArea    = document.getElementById('upload-area');
const uploadLabel   = document.getElementById('upload-label');
const cvUpload      = document.getElementById('cv-upload');
const uploadStatus  = document.getElementById('upload-status');
const cvPreview     = document.getElementById('cv-preview');
const cvList        = document.getElementById('cv-list');
const optimizeBtn    = document.getElementById('optimize-btn');
const jobDescription = document.getElementById('job-description');
const charCount      = document.getElementById('char-count');
const optimizeResult = document.getElementById('optimize-result');
const jobUrlInput    = document.getElementById('job-url');
const fetchUrlBtn    = document.getElementById('fetch-url-btn');
const fetchUrlStatus = document.getElementById('fetch-url-status');

// State
let selectedCV      = null;
let allCVs          = [];
let lastMatchResult = null;
let lastJobDesc     = '';

// ── Navigation ────────────────────────────────────────────
function showView(viewId, navEl) {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Show target view
    const view = document.getElementById('view-' + viewId);
    if (view) view.classList.add('active');
    if (navEl) navEl.classList.add('active');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadCVs();
    loadBankData();

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCVModal();
    });
});

// Event Listeners
function setupEventListeners() {
    cvUpload.addEventListener('change', handleFileSelect);
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    optimizeBtn.addEventListener('click', handleOptimize);
    jobDescription.addEventListener('input', updateCharCount);
    jobDescription.addEventListener('input', updateOptimizeButton);
    fetchUrlBtn.addEventListener('click', handleFetchUrl);
    jobUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleFetchUrl(); });
}

// Drag and Drop Handlers
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileUpload(files[0]);
    }
}

// Handle file selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFileUpload(file);
    }
}

// Upload CV
async function handleFileUpload(file) {
    if (!file.type.includes('pdf')) {
        showStatus('❌ Endast PDF-filer är tillåtna', 'error');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showStatus('❌ Filen är för stor. Max 10 MB tillåtet', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    uploadArea.classList.add('uploading');
    showStatus('⏳ Laddar upp och analyserar CV...', 'loading');
    
    try {
        const response = await fetch(`${API_BASE_URL}/cv/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Uppladdning misslyckades');
        }
        
        const data = await response.json();
        uploadArea.classList.remove('uploading');
        showStatus('✅ CV uppladdat och strukturerat!', 'success');
        displayCVPreview(data.structured_data);
        await loadCVs();
        
    } catch (error) {
        uploadArea.classList.remove('uploading');
        showStatus(`❌ Fel: ${error.message}`, 'error');
    }
}

// Display CV preview after upload
function displayCVPreview(cvData) {
    cvPreview.classList.remove('hidden');
    
    const name = cvData.personal_info.full_name;
    const email = cvData.personal_info.email || 'Ingen email';
    const summary = cvData.summary || 'Ingen sammanfattning';
    const skills = cvData.skills.slice(0, 10).join(', ') || 'Inga skills listade';
    const workExp = cvData.work_experience.length;
    const education = cvData.education.length;
    
    cvPreview.innerHTML = `
        <h3>✅ CV strukturerat framgångsrikt!</h3>
        <div class="cv-preview-section">
            <h4>Personlig information</h4>
            <p><strong>${name}</strong> • ${email}</p>
        </div>
        <div class="cv-preview-section">
            <h4>Sammanfattning</h4>
            <p>${summary}</p>
        </div>
        <div class="cv-preview-section">
            <h4>Erfarenhet</h4>
            <p>${workExp} arbetslivserfarenheter • ${education} utbildningar</p>
        </div>
        <div class="cv-preview-section">
            <h4>Kompetenser</h4>
            <p>${skills}</p>
        </div>
    `;
}

// Load all CVs
async function loadCVs() {
    try {
        const response = await fetch(`${API_BASE_URL}/cv/`);
        if (!response.ok) throw new Error('Kunde inte ladda CV:n');

        allCVs = await response.json();
        displayCVs(allCVs);
        renderDashboardCVs(allCVs);
        renderCVSelectList(allCVs);
        document.getElementById('dash-cv-count').textContent = allCVs.length;

    } catch (error) {
        console.error('Error loading CVs:', error);
        cvList.innerHTML = `<div class="empty-hint">❌ Kunde inte ladda CV:n<br><small>Kontrollera att backend körs på http://localhost:8000</small></div>`;
    }
}

// Dashboard mini-list
function renderDashboardCVs(cvs) {
    const el = document.getElementById('dash-cv-list');
    if (!el) return;

    if (cvs.length === 0) {
        el.innerHTML = '<div class="empty-hint">Inga CV:n uppladdade än</div>';
        return;
    }

    el.innerHTML = cvs.slice(0, 5).map(cv => {
        const displayName = cv.title || cv.structured_data.personal_info.full_name;
        const date  = new Date(cv.upload_date).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' });
        const skills = cv.structured_data.skills.length;
        return `
            <div class="dash-cv-row">
                <div class="dash-cv-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div>
                    <div class="dash-cv-name">${displayName}</div>
                    <div class="dash-cv-meta">${date} &nbsp;·&nbsp; ${skills} skills</div>
                </div>
                <div class="dash-cv-actions">
                    <button class="btn btn-small btn-secondary" onclick="viewCV(${cv.id}, event)">Visa</button>
                </div>
            </div>
        `;
    }).join('');
}

// CV select list in optimize view
function renderCVSelectList(cvs) {
    const el = document.getElementById('cv-select-list');
    if (!el) return;

    if (cvs.length === 0) {
        el.innerHTML = '<p class="empty-hint">Ladda upp ett CV först</p>';
        return;
    }

    el.innerHTML = cvs.map(cv => {
        const displayName = cv.title || cv.structured_data.personal_info.full_name;
        const isSelected  = selectedCV?.id === cv.id;
        return `
            <div class="cv-select-item ${isSelected ? 'selected' : ''}" onclick="selectCV(${cv.id})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                ${displayName}
            </div>
        `;
    }).join('');
}

// Display CVs (Mina CV:n view)
function displayCVs(cvs) {
    if (cvs.length === 0) {
        cvList.innerHTML = '<div class="empty-hint">Inga CV:n uppladdade ännu</div>';
        return;
    }

    cvList.innerHTML = cvs.map(cv => {
        const displayName = cv.title || cv.structured_data.personal_info.full_name;
        const date   = new Date(cv.upload_date).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });
        const skills = cv.structured_data.skills.length;
        const exps   = cv.structured_data.work_experience.length;
        const selected = selectedCV?.id === cv.id;

        return `
            <div class="cv-item ${selected ? 'selected' : ''}" onclick="selectCV(${cv.id})">
                <div class="cv-item-header">
                    <div class="cv-item-info">
                        <h3>${displayName}</h3>
                        <p>${cv.filename}</p>
                    </div>
                    ${selected ? '<span class="cv-item-badge">Vald</span>' : ''}
                </div>
                <div class="cv-item-details">
                    <div class="cv-item-detail">📅 ${date}</div>
                    <div class="cv-item-detail">💼 ${exps} arbetslivserfarenheter</div>
                    <div class="cv-item-detail">🎯 ${skills} kompetenser</div>
                </div>
                <div class="cv-item-actions">
                    <button class="btn btn-small btn-secondary" onclick="editTitle(${cv.id}, event)">✏️ Titel</button>
                    <button class="btn btn-small btn-secondary" onclick="viewCV(${cv.id}, event)">👁️ Visa</button>
                    <button class="btn btn-small btn-danger"    onclick="deleteCV(${cv.id}, event)">🗑️ Ta bort</button>
                </div>
            </div>
        `;
    }).join('');
}

// Edit title inline
async function editTitle(id, event) {
    event.stopPropagation();
    const cv = allCVs.find(c => c.id === id);
    if (!cv) return;

    const current = cv.title || '';
    const newTitle = prompt('Ange titel för detta CV:', current);

    // null = cancel, empty string = clear
    if (newTitle === null) return;

    try {
        const res = await fetch(`${API_BASE_URL}/cv/${id}/title`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle.trim() || cv.structured_data.personal_info.full_name })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Kunde inte spara titel');
        }

        const updated = await res.json();
        // Update local state
        const idx = allCVs.findIndex(c => c.id === id);
        if (idx !== -1) allCVs[idx] = { ...allCVs[idx], title: updated.title };
        if (selectedCV?.id === id) selectedCV = allCVs[idx];

        displayCVs(allCVs);
        renderDashboardCVs(allCVs);
        renderCVSelectList(allCVs);

    } catch (err) {
        showStatus(`❌ ${err.message}`, 'error');
    }
}

// Select CV
// Select CV
function selectCV(id) {
    selectedCV = allCVs.find(cv => cv.id === id);
    displayCVs(allCVs);
    renderCVSelectList(allCVs);
    updateOptimizeButton();

    const mergeBtn = document.getElementById('merge-selected-btn');
    if (mergeBtn) mergeBtn.disabled = false;
}

// View CV details
function viewCV(id, event) {
    event.stopPropagation();
    const cv = allCVs.find(cv => cv.id === id);
    
    if (!cv) return;
    
    // Show modal
    const modal = document.getElementById('cv-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    
    // Set title
    modalTitle.textContent = cv.structured_data.personal_info.full_name || 'CV-detaljer';
    
    // Build modal content
    modalBody.innerHTML = buildCVDetailsHTML(cv.structured_data);
    
    // Show modal
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

// Close modal
function closeCVModal() {
    const modal = document.getElementById('cv-modal');
    modal.classList.add('hidden');
    document.body.style.overflow = ''; // Re-enable scrolling
}

// Build CV details HTML
function buildCVDetailsHTML(cvData) {
    let html = '';
    
    // Personal Information
    html += `
        <div class="cv-section">
            <h3 class="cv-section-title">
                <span class="cv-section-icon">👤</span>
                Personlig Information
            </h3>
            <div class="cv-personal-grid">
                ${cvData.personal_info.email ? `
                    <div class="cv-personal-item">
                        📧 <strong>Email:</strong> ${cvData.personal_info.email}
                    </div>
                ` : ''}
                ${cvData.personal_info.phone ? `
                    <div class="cv-personal-item">
                        📱 <strong>Telefon:</strong> ${cvData.personal_info.phone}
                    </div>
                ` : ''}
                ${cvData.personal_info.location ? `
                    <div class="cv-personal-item">
                        📍 <strong>Plats:</strong> ${cvData.personal_info.location}
                    </div>
                ` : ''}
                ${cvData.personal_info.linkedin ? `
                    <div class="cv-personal-item">
                        💼 <strong>LinkedIn:</strong> <a href="${cvData.personal_info.linkedin}" target="_blank">Profil</a>
                    </div>
                ` : ''}
                ${cvData.personal_info.github ? `
                    <div class="cv-personal-item">
                        💻 <strong>GitHub:</strong> <a href="${cvData.personal_info.github}" target="_blank">Profil</a>
                    </div>
                ` : ''}
                ${cvData.personal_info.website ? `
                    <div class="cv-personal-item">
                        🌐 <strong>Webbplats:</strong> <a href="${cvData.personal_info.website}" target="_blank">Besök</a>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    // Summary
    if (cvData.summary) {
        html += `
            <div class="cv-section">
                <h3 class="cv-section-title">
                    <span class="cv-section-icon">📝</span>
                    Sammanfattning
                </h3>
                <div class="cv-summary">${cvData.summary}</div>
            </div>
        `;
    }
    
    // Work Experience
    if (cvData.work_experience && cvData.work_experience.length > 0) {
        html += `
            <div class="cv-section">
                <h3 class="cv-section-title">
                    <span class="cv-section-icon">💼</span>
                    Arbetslivserfarenhet
                </h3>
        `;
        
        cvData.work_experience.forEach(exp => {
            const startDate = exp.start_date || '';
            const endDate = exp.current ? 'Nuvarande' : (exp.end_date || '');
            const dateStr = startDate && endDate ? `${startDate} - ${endDate}` : (startDate || endDate);
            
            html += `
                <div class="cv-experience-item">
                    <div class="cv-experience-header">
                        <div class="cv-experience-title">
                            <h3>${exp.position || 'Position'}</h3>
                            <div class="cv-experience-company">${exp.company || 'Företag'}${exp.location ? ` • ${exp.location}` : ''}</div>
                        </div>
                        ${dateStr ? `<div class="cv-experience-date">${dateStr}</div>` : ''}
                    </div>
                    
                    ${exp.description ? `<div class="cv-experience-description">${exp.description}</div>` : ''}
                    
                    ${exp.achievements && exp.achievements.length > 0 ? `
                        <div class="cv-achievements">
                            <h4>Huvudsakliga prestationer</h4>
                            <ul>
                                ${exp.achievements.map(ach => `<li>${ach}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    ${exp.technologies && exp.technologies.length > 0 ? `
                        <div class="cv-tags">
                            ${exp.technologies.map(tech => `<span class="cv-tag">${tech}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    // Education
    if (cvData.education && cvData.education.length > 0) {
        html += `
            <div class="cv-section">
                <h3 class="cv-section-title">
                    <span class="cv-section-icon">🎓</span>
                    Utbildning
                </h3>
        `;
        
        cvData.education.forEach(edu => {
            const startDate = edu.start_date || '';
            const endDate = edu.end_date || '';
            const dateStr = startDate && endDate ? `${startDate} - ${endDate}` : (startDate || endDate);
            
            html += `
                <div class="cv-education-item">
                    <div class="cv-experience-header">
                        <div class="cv-experience-title">
                            <h3>${edu.degree || 'Examen'}${edu.field_of_study ? ` - ${edu.field_of_study}` : ''}</h3>
                            <div class="cv-experience-company">${edu.institution || 'Institution'}</div>
                        </div>
                        ${dateStr ? `<div class="cv-experience-date">${dateStr}</div>` : ''}
                    </div>
                    
                    ${edu.gpa ? `<div class="cv-personal-item">📊 GPA: ${edu.gpa}</div>` : ''}
                    
                    ${edu.achievements && edu.achievements.length > 0 ? `
                        <div class="cv-achievements">
                            <ul>
                                ${edu.achievements.map(ach => `<li>${ach}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    // Skills
    if (cvData.skills && cvData.skills.length > 0) {
        html += `
            <div class="cv-section">
                <h3 class="cv-section-title">
                    <span class="cv-section-icon">🎯</span>
                    Kompetenser
                </h3>
                <div class="cv-skills-grid">
                    ${cvData.skills.map(skill => `<span class="cv-skill-tag">${skill}</span>`).join('')}
                </div>
            </div>
        `;
    }
    
    // Certifications
    if (cvData.certifications && cvData.certifications.length > 0) {
        html += `
            <div class="cv-section">
                <h3 class="cv-section-title">
                    <span class="cv-section-icon">🏆</span>
                    Certifieringar
                </h3>
        `;
        
        cvData.certifications.forEach(cert => {
            html += `
                <div class="cv-education-item">
                    <h3>${cert.name || 'Certifiering'}</h3>
                    ${cert.issuing_organization ? `<div class="cv-experience-company">${cert.issuing_organization}</div>` : ''}
                    ${cert.issue_date ? `<div class="cv-personal-item">📅 Utfärdad: ${cert.issue_date}</div>` : ''}
                    ${cert.credential_id ? `<div class="cv-personal-item">🆔 ID: ${cert.credential_id}</div>` : ''}
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    // Projects
    if (cvData.projects && cvData.projects.length > 0) {
        html += `
            <div class="cv-section">
                <h3 class="cv-section-title">
                    <span class="cv-section-icon">🚀</span>
                    Projekt
                </h3>
        `;
        
        cvData.projects.forEach(proj => {
            html += `
                <div class="cv-experience-item">
                    <h3>${proj.name || 'Projekt'}</h3>
                    ${proj.role ? `<div class="cv-experience-company">Roll: ${proj.role}</div>` : ''}
                    ${proj.description ? `<div class="cv-experience-description">${proj.description}</div>` : ''}
                    ${proj.url ? `<div class="cv-personal-item">🔗 <a href="${proj.url}" target="_blank">Projektlänk</a></div>` : ''}
                    
                    ${proj.technologies && proj.technologies.length > 0 ? `
                        <div class="cv-tags">
                            ${proj.technologies.map(tech => `<span class="cv-tag">${tech}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    // Languages
    if (cvData.languages && cvData.languages.length > 0) {
        html += `
            <div class="cv-section">
                <h3 class="cv-section-title">
                    <span class="cv-section-icon">🌍</span>
                    Språk
                </h3>
                <div class="cv-languages-grid">
                    ${cvData.languages.map(lang => `
                        <div class="cv-language-item">
                            <div class="cv-language-name">${lang.language || 'Språk'}</div>
                            ${lang.proficiency ? `<div class="cv-language-proficiency">${lang.proficiency}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    return html;
}

// Delete CV
async function deleteCV(id, event) {
    event.stopPropagation();

    if (!confirm('Radera detta CV?\n\nKompetensbanken byggs om automatiskt från kvarvarande CV:n.')) {
        return;
    }

    showStatus('⏳ Raderar CV och bygger om kompetensbanken...', 'loading');

    try {
        const response = await fetch(`${API_BASE_URL}/cv/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Kunde inte ta bort CV');
        }

        const data = await response.json();

        // Om det raderade CV:t var valt, nollställ valet
        if (selectedCV?.id === id) {
            selectedCV = null;
            updateOptimizeButton();
            const mergeBtn = document.getElementById('merge-selected-btn');
            if (mergeBtn) mergeBtn.disabled = true;
        }

        await loadCVs();
        await loadBankData();

        showStatus(
            `✅ ${data.message} — ${data.total_skills} skills från ${data.remaining_cvs} CV:n`,
            'success'
        );

    } catch (error) {
        showStatus(`❌ ${error.message}`, 'error');
    }
}

// Update character count
function updateCharCount() {
    const count = jobDescription.value.length;
    charCount.textContent = `${count} tecken`;
}

// Fetch job posting text from URL
async function handleFetchUrl() {
    const url = jobUrlInput.value.trim();
    if (!url) return;

    fetchUrlBtn.disabled = true;
    fetchUrlBtn.querySelector('.btn-text').classList.add('hidden');
    fetchUrlBtn.querySelector('.btn-loading').classList.remove('hidden');
    fetchUrlStatus.innerHTML = '';

    try {
        const response = await fetch(`${API_BASE_URL}/competence/fetch-job-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });

        const data = await response.json();

        if (!response.ok) {
            const blocked = response.status === 502 || response.status === 504;
            if (blocked) {
                document.getElementById('url-blocked-popup').classList.remove('hidden');
                document.getElementById('url-blocked-popup').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                return;
            }
            throw new Error(data.detail || 'Kunde inte hämta sidan');
        }

        jobDescription.value = data.text;
        updateCharCount();
        updateOptimizeButton();
        fetchUrlStatus.innerHTML = '<span class="fetch-url-ok">✓ Annonstext hämtad</span>';
        jobUrlInput.value = '';

    } catch (err) {
        fetchUrlStatus.innerHTML = `<span class="fetch-url-err">✗ ${err.message}</span>`;
    } finally {
        fetchUrlBtn.disabled = false;
        fetchUrlBtn.querySelector('.btn-text').classList.remove('hidden');
        fetchUrlBtn.querySelector('.btn-loading').classList.add('hidden');
    }
}

// Update optimize button state
function updateOptimizeButton() {
    optimizeBtn.disabled = jobDescription.value.trim().length === 0;
}

// Match competences against job
async function handleOptimize() {
    if (!jobDescription.value.trim()) {
        alert('Klistra in en jobbannons');
        return;
    }

    optimizeBtn.disabled = true;
    optimizeBtn.querySelector('.btn-text').style.display = 'none';
    optimizeBtn.querySelector('.btn-loading').classList.remove('hidden');
    optimizeResult.classList.add('hidden');

    try {
        const response = await fetch(`${API_BASE_URL}/competence/match-job`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_title: '',
                job_description: jobDescription.value.trim(),
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Matchning misslyckades');
        }

        const result = await response.json();
        lastMatchResult = result;
        lastJobDesc = jobDescription.value.trim();
        displayMatchResult(result);

        setTimeout(() => {
            optimizeResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);

    } catch (error) {
        optimizeResult.innerHTML = `
            <div class="status-message status-error">❌ Fel: ${error.message}</div>
        `;
        optimizeResult.classList.remove('hidden');
    } finally {
        optimizeBtn.disabled = false;
        optimizeBtn.querySelector('.btn-text').style.display = 'inline';
        optimizeBtn.querySelector('.btn-loading').classList.add('hidden');
        updateOptimizeButton();
    }
}

function scoreColor(score) {
    if (score >= 75) return 'match-high';
    if (score >= 45) return 'match-mid';
    return 'match-low';
}

function scoreBar(score) {
    return `<div class="match-bar"><div class="match-bar-fill ${scoreColor(score)}" style="width:${score}%"></div></div>`;
}

function displayMatchResult(result) {
    const overall = result.overall_score ?? 0;
    const skills = (result.skills ?? []).filter(s => s.score > 0);
    const experiences = (result.experiences ?? []).filter(e => e.score > 0);
    const missing = result.missing_skills ?? [];

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

    optimizeResult.innerHTML = `
        <div class="match-result-header">
            <div class="match-overall-score ${scoreColor(overall)}">
                <span class="match-overall-number">${overall}</span>
                <span class="match-overall-label">/ 100</span>
            </div>
            <p class="match-summary">${result.summary || ''}</p>
        </div>

        <div class="match-sections">
            <div class="match-section">
                <h4 class="match-section-title">Matchande skills (${skills.length})</h4>
                <div class="match-list">${skillsHtml || '<p class="match-empty">Inga matchande skills</p>'}</div>
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
                ✨ Generera anpassat CV-utkast
            </button>
        </div>` : ''}
    `;

    optimizeResult.classList.remove('hidden');
}

async function handleGenerateCV() {
    const genBtn = document.getElementById('gen-cv-btn');
    genBtn.disabled = true;
    genBtn.innerHTML = '<span class="spinner-small"></span> Genererar...';

    const expIds = (lastMatchResult.experiences ?? [])
        .filter(e => e.score > 0)
        .map(e => e.id);
    const skills = (lastMatchResult.skills ?? [])
        .filter(s => s.score > 0)
        .map(s => s.skill_name);

    try {
        const response = await fetch(`${API_BASE_URL}/competence/generate-cv`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_description: lastJobDesc,
                matched_experience_ids: expIds,
                skills,
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Kunde inte generera CV');
        }

        const data = await response.json();
        displayGeneratedCV(data);

    } catch (err) {
        genBtn.disabled = false;
        genBtn.innerHTML = '✨ Generera anpassat CV-utkast';
        alert('Fel: ' + err.message);
    }
}

function displayGeneratedCV(data) {
    const body = document.getElementById('cv-generate-body');

    const expHtml = (data.experiences || []).map(e => {
        const start = e.start_date || '';
        const end   = e.is_current ? 'nu' : (e.end_date || '');
        const dates = start ? `${start}–${end}` : '';
        const achievements = (e.highlighted_achievements || [])
            .map(a => `<li>${a}</li>`).join('');
        const matchedClass = e.is_matched ? ' gen-cv-exp--matched' : '';
        return `
            <div class="gen-cv-exp${matchedClass}">
                <div class="gen-cv-exp-header">
                    <div>
                        <span class="gen-cv-exp-title">${e.title}</span>
                        ${e.organization ? `<span class="gen-cv-exp-org"> · ${e.organization}</span>` : ''}
                        ${e.is_matched ? '<span class="gen-cv-match-badge">✦ Matchar jobbet</span>' : ''}
                    </div>
                    ${dates ? `<span class="gen-cv-exp-date">${dates}</span>` : ''}
                </div>
                ${achievements ? `<ul class="gen-cv-achievements">${achievements}</ul>` : ''}
            </div>
        `;
    }).join('');

    const skillsHtml = (data.skills || [])
        .map(s => `<span class="cv-skill-tag">${s}</span>`).join('');

    body.innerHTML = `
        <div class="gen-cv-pitch">
            <h3 class="gen-cv-section-title">Profil</h3>
            <p>${data.pitch || ''}</p>
        </div>

        <div class="gen-cv-section">
            <h3 class="gen-cv-section-title">Erfarenheter</h3>
            ${expHtml || '<p>Inga matchande erfarenheter</p>'}
        </div>

        ${skillsHtml ? `
        <div class="gen-cv-section">
            <h3 class="gen-cv-section-title">Relevanta kompetenser</h3>
            <div class="cv-skills-grid">${skillsHtml}</div>
        </div>` : ''}
    `;

    document.getElementById('cv-generate-modal').classList.remove('hidden');
}

function closeCVGenerateModal() {
    document.getElementById('cv-generate-modal').classList.add('hidden');
    const genBtn = document.getElementById('gen-cv-btn');
    if (genBtn) {
        genBtn.disabled = false;
        genBtn.innerHTML = '✨ Generera anpassat CV-utkast';
    }
}

// ── Tips ────────────────────────────────────────────────────────────────────

async function handleTips() {
    const tipsBtn = document.getElementById('tips-btn');
    tipsBtn.disabled = true;
    tipsBtn.innerHTML = '<span class="spinner-small"></span> Analyserar...';

    const currentSkills  = (lastMatchResult.skills ?? []).filter(s => s.score > 0).map(s => s.skill_name);
    const missingSkills  = lastMatchResult.missing_skills ?? [];
    const matchedExpIds  = (lastMatchResult.experiences ?? []).filter(e => e.score > 0).map(e => e.id);
    const overallScore   = lastMatchResult.overall_score ?? 0;

    try {
        const response = await fetch(`${API_BASE_URL}/competence/improvement-tips`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_description:        lastJobDesc,
                overall_score:          overallScore,
                current_skills:         currentSkills,
                missing_skills:         missingSkills,
                matched_experience_ids: matchedExpIds,
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Kunde inte generera tips');
        }

        const data = await response.json();
        displayTips(data, overallScore);

    } catch (err) {
        alert('Fel: ' + err.message);
    } finally {
        tipsBtn.disabled = false;
        tipsBtn.innerHTML = '💡 Tips';
    }
}

function displayTips(data, overallScore) {
    const body = document.getElementById('tips-body');

    const suggestedSkills = data.suggested_skills ?? [];
    const tips            = data.tips ?? [];

    const impactLabel = { high: 'Hög effekt', medium: 'Medel', low: 'Lägre' };
    const impactClass = { high: 'tip-impact--high', medium: 'tip-impact--medium', low: 'tip-impact--low' };

    const skillsHtml = suggestedSkills.map((s, i) => `
        <div class="tip-skill-row" id="tip-skill-${i}">
            <div class="tip-skill-info">
                <span class="tip-skill-name">${s.skill_name}</span>
                ${s.category ? `<span class="tip-skill-cat">${s.category}</span>` : ''}
                <span class="tip-skill-reason">${s.reason}</span>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="addSuggestedSkill('${s.skill_name.replace(/'/g, "\\'")}', '${(s.category || '').replace(/'/g, "\\'")}', ${i})">
                + Lägg till
            </button>
        </div>
    `).join('');

    const tipsHtml = tips.map(t => `
        <li class="tip-item">
            <span class="tip-impact ${impactClass[t.impact] || ''}">${impactLabel[t.impact] || ''}</span>
            ${t.tip}
        </li>
    `).join('');

    body.innerHTML = `
        <div class="tips-score-row">
            <span class="tips-score-label">Nuvarande matchning</span>
            <span class="tips-score-value ${scoreColor(overallScore)}">${overallScore} / 100</span>
        </div>

        ${suggestedSkills.length ? `
        <div class="tips-section">
            <h3 class="tips-section-title">Skills att lägga till</h3>
            <p class="tips-section-desc">Dessa kompetenser nämns i annonsen och saknas i din bank. Klicka "+ Lägg till" för att direkt lägga till dem.</p>
            <div class="tip-skills-list">${skillsHtml}</div>
        </div>` : ''}

        ${tipsHtml ? `
        <div class="tips-section">
            <h3 class="tips-section-title">Förbättringstips</h3>
            <ul class="tips-list">${tipsHtml}</ul>
        </div>` : ''}
    `;

    document.getElementById('tips-modal').classList.remove('hidden');
}

async function addSuggestedSkill(skillName, category, rowIndex) {
    const row = document.getElementById(`tip-skill-${rowIndex}`);
    const btn = row.querySelector('button');
    btn.disabled = true;
    btn.textContent = '…';

    try {
        const response = await fetch(`${API_BASE_URL}/competence/skills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skill_name: skillName, category: category || null }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Kunde inte lägga till skill');
        }

        row.classList.add('tip-skill-row--added');
        btn.textContent = '✓ Tillagd';

    } catch (err) {
        btn.disabled = false;
        btn.textContent = '+ Lägg till';
        alert('Fel: ' + err.message);
    }
}

function closeTipsModal() {
    document.getElementById('tips-modal').classList.add('hidden');
}

// Show status message
function showStatus(message, type) {
    const icon = type === 'loading' ? '<div class="spinner"></div>' : '';
    uploadStatus.innerHTML = `
        <div class="status-message status-${type}">
            ${icon}
            <span>${message}</span>
        </div>
    `;
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            uploadStatus.innerHTML = '';
        }, 5000);
    }
}

// =============================================
// COMPETENCE BANK
// =============================================

let bankSkills = [];
let bankExperiences = [];
let activeBankTab = 'skills';
let selectedExperienceIds = new Set();

// Load bank stats + skills + experiences
async function loadBankData() {
    try {
        const [statsRes, skillsRes, expRes] = await Promise.all([
            fetch(`${API_BASE_URL}/competence/stats`),
            fetch(`${API_BASE_URL}/competence/skills`),
            fetch(`${API_BASE_URL}/competence/experiences`),
        ]);

        if (!statsRes.ok || !skillsRes.ok || !expRes.ok) return;

        const stats    = await statsRes.json();
        const skillsData = await skillsRes.json();
        const expData  = await expRes.json();

        bankSkills      = skillsData.skills || [];
        bankExperiences = expData.experiences || [];

        renderBankStats(stats);
        renderBankContent();

    } catch (err) {
        console.warn('Kunde inte ladda kompetensbank:', err.message);
    }
}

function renderBankStats(stats) {
    document.getElementById('stat-skills').textContent      = stats.total_skills ?? 0;
    document.getElementById('stat-experiences').textContent = stats.total_experiences ?? 0;
    document.getElementById('stat-sources').textContent     = stats.total_source_documents ?? 0;

    const catCount = stats.skills_by_category
        ? Object.keys(stats.skills_by_category).length : 0;
    document.getElementById('stat-categories').textContent = catCount;

    // Update dashboard counters too
    const dashSkills = document.getElementById('dash-skills-count');
    const dashExp    = document.getElementById('dash-exp-count');
    if (dashSkills) dashSkills.textContent = stats.total_skills ?? 0;
    if (dashExp)    dashExp.textContent    = stats.total_experiences ?? 0;
}

// Render tabs + content
function renderBankContent() {
    const container = document.getElementById('bank-content');

    if (bankSkills.length === 0 && bankExperiences.length === 0) {
        container.innerHTML = `
            <div class="bank-empty">
                <p>🧠 Kompetensbanken är tom</p>
                <p class="empty-state-hint">Ladda upp ett CV och klicka "Merge alla CV:n" för att fylla banken</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="bank-tabs">
            <button class="bank-tab ${activeBankTab === 'skills' ? 'active' : ''}"
                    onclick="switchBankTab('skills')">
                🎯 Skills (${bankSkills.length})
            </button>
            <button class="bank-tab ${activeBankTab === 'experiences' ? 'active' : ''}"
                    onclick="switchBankTab('experiences')">
                💼 Erfarenheter (${bankExperiences.length})
            </button>
        </div>
        <div id="bank-tab-body"></div>
    `;

    renderActiveBankTab();
}

function switchBankTab(tab) {
    activeBankTab = tab;
    document.querySelectorAll('.bank-tab').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
    renderActiveBankTab();
}

function renderActiveBankTab() {
    const body = document.getElementById('bank-tab-body');
    if (!body) return;

    if (activeBankTab === 'skills') {
        body.innerHTML = renderSkillsTab();
    } else {
        body.innerHTML = renderExperiencesTab();
    }
}

// Group skills by category and render chips
function renderSkillsTab() {
    const addRow = `
        <div class="bank-action-row">
            <button class="btn btn-primary btn-small" onclick="showAddSkillForm()">+ Lägg till skill</button>
        </div>
        <div id="add-skill-form-container"></div>
    `;

    if (bankSkills.length === 0) {
        return addRow + '<div class="bank-empty"><p>Inga skills ännu</p></div>';
    }

    // Group by category
    const groups = {};
    bankSkills.forEach(s => {
        const cat = s.category || 'Övrigt';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(s);
    });

    const categoryOrder = [
        'Programming Languages', 'Frameworks & APIs', 'Databases',
        'Cloud & DevOps', 'AI & Machine Learning', 'Frontend',
        'Technical Skills', 'Tools', 'Soft Skills', 'Languages',
        'Domain Knowledge', 'Övrigt'
    ];

    const sortedCats = [
        ...categoryOrder.filter(c => groups[c]),
        ...Object.keys(groups).filter(c => !categoryOrder.includes(c)).sort()
    ];

    return addRow + sortedCats.map(cat => `
        <div class="bank-category-block">
            <div class="bank-category-title">
                ${categoryIcon(cat)} ${cat}
                <span class="bank-category-count">${groups[cat].length}</span>
            </div>
            <div class="bank-skills-wrap">
                ${groups[cat].map(s => `
                    <span class="bank-skill-chip chip-${s.skill_type || 'default'}">
                        ${s.skill_name}
                        <button class="chip-delete" onclick="event.stopPropagation(); deleteSkill(${s.id}, '${s.skill_name.replace(/'/g, "\\'")}')" title="Ta bort">&times;</button>
                    </span>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Render experience timeline
function renderExperiencesTab() {
    if (bankExperiences.length === 0) {
        return '<div class="bank-empty"><p>Inga erfarenheter ännu</p></div>';
    }

    const typeOrder = ['work', 'education', 'certification', 'project'];
    const typeLabels = {
        work:          '💼 Arbetslivserfarenhet',
        education:     '🎓 Utbildning',
        certification: '🏆 Certifieringar',
        project:       '🚀 Projekt',
    };

    const groups = {};
    bankExperiences.forEach(e => {
        const t = e.experience_type || 'other';
        if (!groups[t]) groups[t] = [];
        groups[t].push(e);
    });

    const sortedTypes = [
        ...typeOrder.filter(t => groups[t]),
        ...Object.keys(groups).filter(t => !typeOrder.includes(t)),
    ];

    // Merge toolbar (visible when ≥2 selected)
    const mergeBar = `
        <div class="bank-merge-bar ${selectedExperienceIds.size >= 2 ? 'visible' : ''}" id="exp-merge-bar">
            <span>${selectedExperienceIds.size} valda</span>
            <button class="btn btn-primary btn-small" onclick="mergeSelectedExperiences()"
                    ${selectedExperienceIds.size < 2 ? 'disabled' : ''}>
                Slå ihop valda
            </button>
            <button class="btn btn-ghost btn-small" onclick="clearExperienceSelection()">Avmarkera</button>
        </div>
    `;

    const addExpRow = `
        <div class="bank-action-row">
            <button class="btn btn-primary btn-small" onclick="showAddExperienceForm()">+ Lägg till erfarenhet</button>
        </div>
        <div id="add-experience-form-container"></div>
    `;

    const content = sortedTypes.map(type => `
        <div class="bank-category-block">
            <div class="bank-category-title">
                ${typeLabels[type] || type}
                <span class="bank-category-count">${groups[type].length}</span>
            </div>
            <div class="bank-experience-list">
                ${groups[type].map(e => {
                    const dateStr = e.start_date
                        ? `${e.start_date} — ${e.is_current ? 'Nuvarande' : (e.end_date || '')}`
                        : '';
                    const skills = (e.related_skills || []);
                    const achievements = (e.achievements || []);
                    const sourceCount = (e.source_cv_ids || []).length;
                    const checked = selectedExperienceIds.has(e.id);

                    return `
                        <div class="bank-exp-item ${checked ? 'bank-exp-selected' : ''}">
                            <label class="bank-exp-checkbox">
                                <input type="checkbox" ${checked ? 'checked' : ''}
                                       onchange="toggleExperienceSelection(${e.id})">
                                <span class="bank-exp-checkmark"></span>
                            </label>
                            <div class="bank-exp-main">
                                <div class="bank-exp-header">
                                    <div>
                                        <h4>
                                            ${e.title}
                                            ${e.is_current ? '<span class="bank-exp-badge">Nuvarande</span>' : ''}
                                            ${sourceCount > 1 ? `<span class="bank-exp-source-badge">${sourceCount} CV:n</span>` : ''}
                                        </h4>
                                        ${dateStr ? `<div class="bank-exp-date">${dateStr}</div>` : ''}
                                    </div>
                                    <div class="bank-exp-actions">
                                        <button class="btn-icon btn-icon-danger" onclick="event.stopPropagation(); deleteExperience(${e.id}, '${e.title.replace(/'/g, "\\'")}')" title="Ta bort erfarenhet">&times;</button>
                                    </div>
                                </div>
                                ${e.organization ? `<div class="bank-exp-org">${e.organization}</div>` : ''}
                                <div class="bank-exp-desc ${e.description ? '' : 'bank-exp-desc-empty'}"
                                     onclick="editDescription(${e.id}, this)"
                                     title="Klicka för att redigera"
                                     id="desc-${e.id}">${e.description || '<span class="desc-placeholder">Klicka för att lägga till beskrivning...</span>'}</div>
                                <div class="bank-exp-achievements">
                                    <div class="bank-exp-achievements-label">
                                        Huvudsakliga prestationer
                                        <button class="btn-icon btn-icon-small" onclick="showAddAchievementForm(${e.id})" title="Lägg till prestation">+</button>
                                    </div>
                                    <div id="add-achievement-form-${e.id}"></div>
                                    ${achievements.length > 0 ? `
                                        <ul>
                                            ${achievements.map((a, idx) => `
                                                <li>
                                                    <span class="achievement-text" id="ach-text-${e.id}-${idx}">${a}</span>
                                                    <span class="achievement-actions">
                                                        <button class="btn-icon btn-icon-small" onclick="editAchievement(${e.id}, ${idx})" title="Redigera">&#9998;</button>
                                                        <button class="btn-icon btn-icon-small btn-icon-danger" onclick="deleteAchievement(${e.id}, ${idx})" title="Ta bort">&times;</button>
                                                    </span>
                                                </li>
                                            `).join('')}
                                        </ul>
                                    ` : ''}
                                </div>
                                <div class="bank-exp-skills">
                                    <div class="bank-exp-skills-label">
                                        Relaterade skills
                                        <button class="btn-icon btn-icon-small" onclick="showAddExpSkillForm(${e.id})" title="Lägg till skill">+</button>
                                    </div>
                                    <div id="add-exp-skill-form-${e.id}"></div>
                                    ${skills.length > 0 ? `
                                        <div class="bank-exp-skills-wrap">
                                            ${skills.map((s, idx) => `
                                                <span class="bank-skill-chip chip-technical">
                                                    ${s}
                                                    <button class="chip-delete" onclick="event.stopPropagation(); removeExpSkill(${e.id}, ${idx}, '${s.replace(/'/g, "\\'")}')" title="Ta bort">&times;</button>
                                                </span>
                                            `).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `).join('');

    return mergeBar + addExpRow + content;
}

function toggleExperienceSelection(id) {
    if (selectedExperienceIds.has(id)) {
        selectedExperienceIds.delete(id);
    } else {
        selectedExperienceIds.add(id);
    }
    renderActiveBankTab();
}

function clearExperienceSelection() {
    selectedExperienceIds.clear();
    renderActiveBankTab();
}

async function mergeSelectedExperiences() {
    if (selectedExperienceIds.size < 2) return;

    const ids = Array.from(selectedExperienceIds);
    if (!confirm(`Slå ihop ${ids.length} erfarenheter till en post?`)) return;

    showMergeStatus('⏳ Slår ihop erfarenheter...', 'loading');

    try {
        const res = await fetch(`${API_BASE_URL}/competence/experiences/merge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ experience_ids: ids }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Sammanslagning misslyckades');
        }

        const data = await res.json();
        selectedExperienceIds.clear();
        showMergeStatus(
            `✅ ${data.merged_count} poster sammanslagna till "${data.title}"`,
            'success'
        );
        await loadBankData();

    } catch (err) {
        showMergeStatus(`❌ ${err.message}`, 'error');
    }
}

function categoryIcon(cat) {
    const icons = {
        'Programming Languages': '💻',
        'Frameworks & APIs': '⚙️',
        'Databases': '🗄️',
        'Cloud & DevOps': '☁️',
        'AI & Machine Learning': '🤖',
        'Frontend': '🎨',
        'Technical Skills': '🔧',
        'Tools': '🛠️',
        'Soft Skills': '🤝',
        'Languages': '🌍',
        'Domain Knowledge': '📚',
    };
    return icons[cat] || '📌';
}

// Show merge status inside bank section
function showMergeStatus(message, type) {
    const el = document.getElementById('merge-status');
    if (!el) return;
    const icon = type === 'loading' ? '<div class="spinner"></div>' : '';
    el.innerHTML = `<div class="status-message status-${type}">${icon}<span>${message}</span></div>`;
    if (type === 'success' || type === 'error') {
        setTimeout(() => { el.innerHTML = ''; }, 5000);
    }
}

// Merge the currently selected CV
async function mergeSelectedCV() {
    if (!selectedCV) {
        alert('Välj ett CV i listan ovan först');
        return;
    }

    showMergeStatus('⏳ Mergar CV...', 'loading');
    document.getElementById('merge-selected-btn').disabled = true;

    try {
        const res = await fetch(`${API_BASE_URL}/competence/merge/${selectedCV.id}`, {
            method: 'POST'
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Merge misslyckades');
        }

        const data = await res.json();
        showMergeStatus(
            `✅ ${data.cv_name}: +${data.skills_added} skills, +${data.experiences_added} erfarenheter, ${data.duplicates_skipped} duplicat(er) hoppade över`,
            'success'
        );
        await loadBankData();

    } catch (err) {
        showMergeStatus(`❌ ${err.message}`, 'error');
    } finally {
        document.getElementById('merge-selected-btn').disabled = false;
    }
}

// ── Skill CRUD ──────────────────────────────────────────────────────────────

function showAddSkillForm() {
    const container = document.getElementById('add-skill-form-container');
    container.innerHTML = `
        <div class="bank-inline-form">
            <input type="text" id="new-skill-name" placeholder="Skill-namn (separera med komma)" class="form-input" />
            <select id="new-skill-category" class="form-input">
                <option value="">Auto-kategorisera</option>
                <option value="Programming Languages">Programming Languages</option>
                <option value="Frameworks & APIs">Frameworks & APIs</option>
                <option value="Databases">Databases</option>
                <option value="Cloud & DevOps">Cloud & DevOps</option>
                <option value="AI & Machine Learning">AI & Machine Learning</option>
                <option value="Frontend">Frontend</option>
                <option value="Tools">Tools</option>
                <option value="Soft Skills">Soft Skills</option>
                <option value="Languages">Languages</option>
            </select>
            <button class="btn btn-primary btn-small" onclick="submitNewSkill()">Spara</button>
            <button class="btn btn-ghost btn-small" onclick="hideAddSkillForm()">Avbryt</button>
        </div>
    `;
    document.getElementById('new-skill-name').focus();
}

function hideAddSkillForm() {
    const container = document.getElementById('add-skill-form-container');
    if (container) container.innerHTML = '';
}

async function submitNewSkill() {
    const name = document.getElementById('new-skill-name').value.trim();
    if (!name) return alert('Ange ett skill-namn');
    const category = document.getElementById('new-skill-category').value || null;
    try {
        const res = await fetch(`${API_BASE_URL}/competence/skills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skill_name: name, category: category }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Kunde inte lägga till skill');
        }
        hideAddSkillForm();
        await loadBankData();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteSkill(skillId, skillName) {
    if (!confirm(`Ta bort "${skillName}" från kompetensbanken?`)) return;
    try {
        const res = await fetch(`${API_BASE_URL}/competence/skills/${skillId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort skill');
        await loadBankData();
    } catch (err) {
        alert(err.message);
    }
}

// ── Experience delete ───────────────────────────────────────────────────────

async function deleteExperience(expId, title) {
    if (!confirm(`Ta bort "${title}" från kompetensbanken?`)) return;
    try {
        const res = await fetch(`${API_BASE_URL}/competence/experiences/${expId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort erfarenhet');
        selectedExperienceIds.delete(expId);
        await loadBankData();
    } catch (err) {
        alert(err.message);
    }
}

// ── Achievement CRUD ────────────────────────────────────────────────────────

function showAddAchievementForm(expId) {
    const container = document.getElementById(`add-achievement-form-${expId}`);
    container.innerHTML = `
        <div class="bank-inline-form">
            <input type="text" id="new-ach-text-${expId}" placeholder="Ny prestation..." class="form-input"
                   onkeydown="if(event.key==='Enter') submitNewAchievement(${expId}); if(event.key==='Escape') document.getElementById('add-achievement-form-${expId}').innerHTML='';" />
            <button class="btn btn-primary btn-small" onclick="submitNewAchievement(${expId})">Spara</button>
            <button class="btn btn-ghost btn-small" onclick="document.getElementById('add-achievement-form-${expId}').innerHTML=''">Avbryt</button>
        </div>
    `;
    document.getElementById(`new-ach-text-${expId}`).focus();
}

async function submitNewAchievement(expId) {
    const input = document.getElementById(`new-ach-text-${expId}`);
    const text = input.value.trim();
    if (!text) return;
    try {
        const res = await fetch(`${API_BASE_URL}/competence/experiences/${expId}/achievements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error('Kunde inte lägga till prestation');
        await loadBankData();
    } catch (err) {
        alert(err.message);
    }
}

function editDescription(expId, el) {
    if (el.querySelector('textarea')) return; // redan i redigeringsläge
    const current = el.dataset.desc ?? el.textContent.trim();
    el.innerHTML = `
        <textarea class="desc-textarea" id="desc-ta-${expId}"
                  onkeydown="if(event.key==='Escape') cancelEditDescription(this.closest('.bank-exp-desc'))"
        >${current}</textarea>
        <div class="desc-actions">
            <button class="btn btn-primary btn-small" onclick="event.stopPropagation(); saveDescription(${expId})">Spara</button>
            <button class="btn btn-ghost btn-small" onclick="event.stopPropagation(); cancelEditDescription(document.getElementById('desc-${expId}'))">Avbryt</button>
        </div>
    `;
    el.dataset.desc = current;
    document.getElementById(`desc-ta-${expId}`).focus();
}

async function saveDescription(expId) {
    const ta = document.getElementById(`desc-ta-${expId}`);
    if (!ta) return;
    const text = ta.value.trim();
    try {
        const res = await fetch(`${API_BASE_URL}/competence/experiences/${expId}/description`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: text }),
        });
        if (!res.ok) throw new Error('Kunde inte spara beskrivning');
        await loadBankData();
    } catch (err) {
        alert(err.message);
    }
}

function cancelEditDescription(el) {
    const original = el.dataset.desc || '';
    el.innerHTML = original || '<span class="desc-placeholder">Klicka för att lägga till beskrivning...</span>';
    delete el.dataset.desc;
}

function editAchievement(expId, index) {
    const span = document.getElementById(`ach-text-${expId}-${index}`);
    const currentText = span.textContent;
    span.innerHTML = `
        <input type="text" class="form-input form-input-inline" value="${currentText.replace(/"/g, '&quot;')}"
               id="edit-ach-${expId}-${index}"
               onkeydown="if(event.key==='Enter') submitEditAchievement(${expId}, ${index}); if(event.key==='Escape') loadBankData();" />
    `;
    document.getElementById(`edit-ach-${expId}-${index}`).focus();
}

async function submitEditAchievement(expId, index) {
    const input = document.getElementById(`edit-ach-${expId}-${index}`);
    const text = input.value.trim();
    if (!text) return;
    try {
        const res = await fetch(`${API_BASE_URL}/competence/experiences/${expId}/achievements/${index}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error('Kunde inte uppdatera prestation');
        await loadBankData();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteAchievement(expId, index) {
    if (!confirm('Ta bort denna prestation?')) return;
    try {
        const res = await fetch(`${API_BASE_URL}/competence/experiences/${expId}/achievements/${index}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort prestation');
        await loadBankData();
    } catch (err) {
        alert(err.message);
    }
}

// ── Experience skill CRUD ───────────────────────────────────────────────────

function showAddExpSkillForm(expId) {
    const container = document.getElementById(`add-exp-skill-form-${expId}`);
    container.innerHTML = `
        <div class="bank-inline-form">
            <input type="text" id="new-exp-skill-${expId}" placeholder="Skills (separera med komma)" class="form-input"
                   onkeydown="if(event.key==='Enter') submitNewExpSkill(${expId}); if(event.key==='Escape') document.getElementById('add-exp-skill-form-${expId}').innerHTML='';" />
            <button class="btn btn-primary btn-small" onclick="submitNewExpSkill(${expId})">Spara</button>
            <button class="btn btn-ghost btn-small" onclick="document.getElementById('add-exp-skill-form-${expId}').innerHTML=''">Avbryt</button>
        </div>
    `;
    document.getElementById(`new-exp-skill-${expId}`).focus();
}

async function submitNewExpSkill(expId) {
    const input = document.getElementById(`new-exp-skill-${expId}`);
    const name = input.value.trim();
    if (!name) return;
    try {
        const res = await fetch(`${API_BASE_URL}/competence/experiences/${expId}/skills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skill_name: name }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Kunde inte lägga till skill');
        }
        await loadBankData();
    } catch (err) {
        alert(err.message);
    }
}

async function removeExpSkill(expId, index, skillName) {
    if (!confirm(`Ta bort "${skillName}" från denna erfarenhet?`)) return;
    try {
        const res = await fetch(`${API_BASE_URL}/competence/experiences/${expId}/skills/${index}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort skill');
        await loadBankData();
    } catch (err) {
        alert(err.message);
    }
}

// ── Create new experience ───────────────────────────────────────────────────

function showAddExperienceForm() {
    const container = document.getElementById('add-experience-form-container');
    container.innerHTML = `
        <div class="bank-add-exp-form">
            <div class="bank-form-row">
                <div class="bank-form-field">
                    <label>Titel *</label>
                    <input type="text" id="new-exp-title" placeholder="T.ex. Systemutvecklare" class="form-input" />
                </div>
                <div class="bank-form-field">
                    <label>Organisation</label>
                    <input type="text" id="new-exp-org" placeholder="T.ex. Företaget AB" class="form-input" />
                </div>
            </div>
            <div class="bank-form-row">
                <div class="bank-form-field">
                    <label>Typ</label>
                    <select id="new-exp-type" class="form-input">
                        <option value="work">Arbetslivserfarenhet</option>
                        <option value="education">Utbildning</option>
                        <option value="certification">Certifiering</option>
                        <option value="project">Projekt</option>
                    </select>
                </div>
                <div class="bank-form-field">
                    <label>Startdatum</label>
                    <input type="text" id="new-exp-start" placeholder="T.ex. 2020-01" class="form-input" />
                </div>
                <div class="bank-form-field">
                    <label>Slutdatum</label>
                    <input type="text" id="new-exp-end" placeholder="T.ex. 2023-06" class="form-input" />
                </div>
                <div class="bank-form-field bank-form-check">
                    <label><input type="checkbox" id="new-exp-current" /> Nuvarande</label>
                </div>
            </div>
            <div class="bank-form-row">
                <div class="bank-form-field bank-form-full">
                    <label>Beskrivning</label>
                    <textarea id="new-exp-desc" rows="3" placeholder="Beskriv rollen eller erfarenheten..." class="form-input"></textarea>
                </div>
            </div>
            <div class="bank-form-actions">
                <button class="btn btn-primary btn-small" onclick="submitNewExperience()">Spara</button>
                <button class="btn btn-ghost btn-small" onclick="hideAddExperienceForm()">Avbryt</button>
            </div>
        </div>
    `;
    document.getElementById('new-exp-title').focus();
}

function hideAddExperienceForm() {
    const container = document.getElementById('add-experience-form-container');
    if (container) container.innerHTML = '';
}

async function submitNewExperience() {
    const title = document.getElementById('new-exp-title').value.trim();
    if (!title) return alert('Titel krävs');

    const body = {
        title,
        organization: document.getElementById('new-exp-org').value.trim() || null,
        experience_type: document.getElementById('new-exp-type').value,
        start_date: document.getElementById('new-exp-start').value.trim() || null,
        end_date: document.getElementById('new-exp-end').value.trim() || null,
        is_current: document.getElementById('new-exp-current').checked,
        description: document.getElementById('new-exp-desc').value.trim() || null,
        related_skills: [],
        achievements: [],
    };

    try {
        const res = await fetch(`${API_BASE_URL}/competence/experiences`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Kunde inte skapa erfarenhet');
        }
        hideAddExperienceForm();
        await loadBankData();
    } catch (err) {
        alert(err.message);
    }
}

// Merge ALL CVs
async function mergeAllCVs() {
    showMergeStatus('⏳ Mergar alla CV:n...', 'loading');
    document.getElementById('merge-all-btn').disabled = true;

    try {
        const res = await fetch(`${API_BASE_URL}/competence/merge-all`, {
            method: 'POST'
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Merge misslyckades');
        }

        const data = await res.json();
        showMergeStatus(
            `✅ ${data.total_cvs_processed} CV:n processade — +${data.total_skills_added} nya skills, +${data.total_experiences_added} nya erfarenheter`,
            'success'
        );
        await loadBankData();

    } catch (err) {
        showMergeStatus(`❌ ${err.message}`, 'error');
    } finally {
        document.getElementById('merge-all-btn').disabled = false;
    }
}
