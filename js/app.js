// API Base URL
const API_BASE_URL = 'http://localhost:8000/api/v1';

// DOM Elements
const uploadArea    = document.getElementById('upload-area');
const uploadLabel   = document.getElementById('upload-label');
const cvUpload      = document.getElementById('cv-upload');
const uploadStatus  = document.getElementById('upload-status');
const cvPreview     = document.getElementById('cv-preview');
const cvList        = document.getElementById('cv-list');
const optimizeBtn   = document.getElementById('optimize-btn');
const jobTitle      = document.getElementById('job-title');
const jobDescription = document.getElementById('job-description');
const charCount     = document.getElementById('char-count');
const optimizeResult = document.getElementById('optimize-result');

// State
let selectedCV = null;
let allCVs     = [];

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
    jobTitle.addEventListener('input', updateOptimizeButton);
    jobDescription.addEventListener('input', updateOptimizeButton);
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
        const name = cv.structured_data.personal_info.full_name;
        const date = new Date(cv.upload_date).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' });
        const skills = cv.structured_data.skills.length;
        return `
            <div class="dash-cv-row">
                <div class="dash-cv-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div>
                    <div class="dash-cv-name">${name}</div>
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
        const name = cv.structured_data.personal_info.full_name;
        const isSelected = selectedCV?.id === cv.id;
        return `
            <div class="cv-select-item ${isSelected ? 'selected' : ''}" onclick="selectCV(${cv.id})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                ${name}
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
        const name     = cv.structured_data.personal_info.full_name;
        const date     = new Date(cv.upload_date).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });
        const skills   = cv.structured_data.skills.length;
        const exps     = cv.structured_data.work_experience.length;
        const selected = selectedCV?.id === cv.id;

        return `
            <div class="cv-item ${selected ? 'selected' : ''}" onclick="selectCV(${cv.id})">
                <div class="cv-item-header">
                    <div class="cv-item-info">
                        <h3>${name}</h3>
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
                    <button class="btn btn-small btn-secondary" onclick="viewCV(${cv.id}, event)">👁️ Visa</button>
                    <button class="btn btn-small btn-danger" onclick="deleteCV(${cv.id}, event)">🗑️ Ta bort</button>
                </div>
            </div>
        `;
    }).join('');
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

// Update optimize button state
function updateOptimizeButton() {
    const hasCV = selectedCV !== null;
    const hasTitle = jobTitle.value.trim().length > 0;
    const hasDescription = jobDescription.value.trim().length > 0;
    
    optimizeBtn.disabled = !(hasCV && hasTitle && hasDescription);
}

// Optimize CV
async function handleOptimize() {
    if (!selectedCV) {
        alert('Välj ett CV först');
        return;
    }
    
    if (!jobTitle.value || !jobDescription.value) {
        alert('Fyll i jobbtitel och beskrivning');
        return;
    }
    
    // Show loading state
    optimizeBtn.disabled = true;
    optimizeBtn.querySelector('.btn-text').style.display = 'none';
    optimizeBtn.querySelector('.btn-loading').classList.remove('hidden');
    optimizeResult.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_BASE_URL}/optimize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                cv_id: selectedCV.id,
                job_posting: {
                    title: jobTitle.value,
                    description: jobDescription.value
                }
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Optimering misslyckades');
        }
        
        const result = await response.json();
        displayOptimizedCV(result);
        
        // Scroll to result
        setTimeout(() => {
            optimizeResult.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        }, 100);
        
    } catch (error) {
        optimizeResult.innerHTML = `
            <div class="status-message status-error">
                ❌ Fel: ${error.message}
            </div>
        `;
        optimizeResult.classList.remove('hidden');
    } finally {
        optimizeBtn.disabled = false;
        optimizeBtn.querySelector('.btn-text').style.display = 'inline';
        optimizeBtn.querySelector('.btn-loading').classList.add('hidden');
        updateOptimizeButton();
    }
}

// Display optimized CV
function displayOptimizedCV(result) {
    const originalSummary = selectedCV.structured_data.summary || 'Ingen sammanfattning';
    const optimizedSummary = result.optimized_data.summary || 'Ingen sammanfattning';
    
    const originalSkills = selectedCV.structured_data.skills.slice(0, 8).join(', ');
    const optimizedSkills = result.optimized_data.skills.slice(0, 8).join(', ');
    
    optimizeResult.innerHTML = `
        <h3>✨ CV optimerat för: ${result.job_title}</h3>
        
        <div class="match-score">
            <div class="score-circle">${result.match_score || 85}%</div>
            <div>
                <strong>Matchningsgrad</strong>
                <p style="color: var(--text-secondary); margin-top: 5px;">
                    Ditt CV matchar väl med denna jobbannons!
                </p>
            </div>
        </div>
        
        <div class="result-comparison">
            <div class="result-column">
                <h4>📄 Original</h4>
                <div style="margin-bottom: 15px;">
                    <strong>Sammanfattning:</strong>
                    <p style="color: var(--text-secondary); margin-top: 5px; font-size: 0.9rem;">
                        ${originalSummary}
                    </p>
                </div>
                <div>
                    <strong>Kompetenser:</strong>
                    <p style="color: var(--text-secondary); margin-top: 5px; font-size: 0.9rem;">
                        ${originalSkills}
                    </p>
                </div>
            </div>
            
            <div class="result-column" style="background: #ecfdf5;">
                <h4>✨ Optimerad</h4>
                <div style="margin-bottom: 15px;">
                    <strong>Sammanfattning:</strong>
                    <p style="color: var(--text-secondary); margin-top: 5px; font-size: 0.9rem;">
                        ${optimizedSummary}
                    </p>
                </div>
                <div>
                    <strong>Kompetenser:</strong>
                    <p style="color: var(--text-secondary); margin-top: 5px; font-size: 0.9rem;">
                        ${optimizedSkills}
                    </p>
                </div>
            </div>
        </div>
        
        <div style="margin-top: 30px; text-align: center;">
            <button class="btn btn-primary" onclick="viewFullOptimizedCV(${result.id})">
                👁️ Visa komplett optimerat CV
            </button>
            <button class="btn btn-secondary" style="margin-left: 10px;" onclick="downloadOptimizedCV(${result.id})">
                📥 Ladda ner PDF (kommer snart)
            </button>
        </div>
    `;
    
    optimizeResult.classList.remove('hidden');
}

// View full optimized CV
async function viewFullOptimizedCV(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/optimize/${id}`);
        const data = await response.json();
        
        console.log('Optimerat CV:', data);
        alert('Komplett CV-data finns i konsolen (F12). En dedikerad vy kommer snart!');
        
    } catch (error) {
        alert(`Fel: ${error.message}`);
    }
}

// Download optimized CV (placeholder)
function downloadOptimizedCV(id) {
    alert('PDF-export kommer i nästa version! För tillfället kan du kopiera data från "Visa komplett optimerat CV".');
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
    if (bankSkills.length === 0) {
        return '<div class="bank-empty"><p>Inga skills ännu</p></div>';
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

    return sortedCats.map(cat => `
        <div class="bank-category-block">
            <div class="bank-category-title">
                ${categoryIcon(cat)} ${cat}
                <span class="bank-category-count">${groups[cat].length}</span>
            </div>
            <div class="bank-skills-wrap">
                ${groups[cat].map(s => `
                    <span class="bank-skill-chip chip-${s.skill_type || 'default'}">
                        ${s.skill_name}
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
        work: '💼 Arbetslivserfarenhet',
        education: '🎓 Utbildning',
        certification: '🏆 Certifieringar',
        project: '🚀 Projekt',
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

    return sortedTypes.map(type => `
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
                    return `
                        <div class="bank-exp-item">
                            <div class="bank-exp-main">
                                <h4>
                                    ${e.title}
                                    ${e.is_current ? '<span class="bank-exp-badge">Nuvarande</span>' : ''}
                                </h4>
                                ${e.organization ? `<div class="bank-exp-org">${e.organization}</div>` : ''}
                            </div>
                            ${dateStr ? `<div class="bank-exp-date">${dateStr}</div>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `).join('');
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
