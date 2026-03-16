// ── Drag and Drop (old Mina CV:n view) ────────────────────────────────────────
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

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFileUpload(file);
    }
}

// Upload CV (old Mina CV:n flow)
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
        const response = await apiFetch(`${API_BASE_URL}/cv/upload`, {
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

function displayCVPreview(cvData) {
    cvPreview.classList.remove('hidden');

    const name = cvData.personal_info.full_name;
    const email = cvData.personal_info.email || 'Ingen email';
    const summary = cvData.summary || 'Ingen sammanfattning';
    const skills = cvData.skills.slice(0, 10).join(', ') || 'Inga skills listade';
    const workExp = cvData.work_experience.length;
    const education = cvData.education.length;

    cvPreview.innerHTML = `
        <div class="cv-preview-header">
            <h3>✅ CV strukturerat framgångsrikt!</h3>
            <button class="cv-preview-close" onclick="closePreview()" title="${t('action.close')}">&times;</button>
        </div>
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

function closePreview() {
    cvPreview.classList.add('hidden');
    cvPreview.innerHTML = '';
}

// Show status message (old upload flow)
function showStatus(message, type) {
    const icon = type === 'loading' ? '<div class="spinner"></div>' : '';
    uploadStatus.innerHTML = `
        <div class="status-message status-${type}">
            ${icon}
            <span>${message}</span>
        </div>
    `;

    if (type === 'success') {
        setTimeout(() => {
            uploadStatus.innerHTML = '';
        }, 5000);
    }
}

// Load all CVs (old /cv/ endpoint)
async function loadCVs() {
    try {
        const response = await apiFetch(`${API_BASE_URL}/cv/`);
        if (!response.ok) throw new Error('Kunde inte ladda CV:n');

        allCVs = await response.json();
        displayCVs(allCVs);
        displaySpCVs(allCVs);
        renderDashboardCVs(allCVs);
        renderCVSelectList(allCVs);

    } catch (error) {
        console.error('Error loading CVs:', error);
        if (typeof cvList !== 'undefined' && cvList) {
            cvList.innerHTML = `<div class="empty-hint">❌ Kunde inte ladda CV:n<br><small>Kontrollera att backend körs på http://localhost:8000</small></div>`;
        }
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

// Display CVs (Mina CV:n view — old)
function displayCVs(cvs) {
    if (typeof cvList === 'undefined' || !cvList) return;
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

        const mergeIndicator = cv.is_merged
            ? `<span class="cv-merged-badge">✓ Behandlad</span>`
            : `<button class="btn btn-small btn-merge" onclick="mergeCV(${cv.id}, event)">⚡ Behandla</button>`;

        return `
            <div class="cv-item ${selected ? 'selected' : ''}" onclick="selectCV(${cv.id})">
                <div class="cv-item-header">
                    <div class="cv-item-info">
                        <h3>${displayName}</h3>
                        <p>${cv.filename}</p>
                    </div>
                    <div class="cv-item-header-right">
                        ${mergeIndicator}
                        ${selected ? '<button class="cv-item-badge" onclick="deselectCV(); event.stopPropagation()">Vald ×</button>' : ''}
                    </div>
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

// Display CVs in the sokprofil CV tab (old /cv/ API)
function displaySpCVs(cvs) {
    const container = document.getElementById('sp-cv-list');
    if (!container) return;

    if (!cvs.length) {
        container.innerHTML = '<div class="empty-hint">Inga CV:n uppladdade ännu</div>';
        return;
    }

    container.innerHTML = cvs.map(cv => {
        const displayName = cv.title || cv.structured_data.personal_info.full_name;
        const date   = new Date(cv.upload_date).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });
        const skills = cv.structured_data.skills.length;
        const exps   = cv.structured_data.work_experience.length;

        return `
            <div class="cv-item">
                <div class="cv-item-header">
                    <div class="cv-item-info">
                        <h3>${displayName}</h3>
                        <p>${cv.filename}</p>
                    </div>
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

// ── Sokprofil CV-tab upload ────────────────────────────────────────────────────

let spCVUploadSetup = false;

function setupSpCVUpload() {
    if (spCVUploadSetup) return;
    spCVUploadSetup = true;

    const area  = document.getElementById('sp-cv-upload-area');
    const input = document.getElementById('sp-cv-upload');
    if (!area || !input) return;

    area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
    area.addEventListener('drop', e => {
        e.preventDefault();
        area.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) handleSpCVUpload(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', () => {
        if (input.files[0]) handleSpCVUpload(input.files[0]);
        input.value = '';
    });
}

async function handleSpCVUpload(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        showSpCVUploadStatus('Endast PDF-filer är tillåtna', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showSpCVUploadStatus('Filen är för stor (max 10 MB)', 'error');
        return;
    }

    const area = document.getElementById('sp-cv-upload-area');
    if (area) area.classList.add('uploading');
    showSpCVUploadStatus('⏳ Laddar upp och analyserar CV...', 'loading');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/cvs/upload`, { method: 'POST', body: formData });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Uppladdning misslyckades'); }
        if (area) area.classList.remove('uploading');
        showSpCVUploadStatus('✅ CV uppladdat och strukturerat!', 'success');
        await loadSpCandidateCVs();
        loadBankData();
    } catch (err) {
        if (area) area.classList.remove('uploading');
        showSpCVUploadStatus(`❌ ${err.message}`, 'error');
    }
}

function showSpCVUploadStatus(msg, type) {
    const el = document.getElementById('sp-cv-upload-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    if (type !== 'loading') setTimeout(() => { el.textContent = ''; el.className = ''; }, 5000);
}

async function mergeCV(cvId, event) {
    event.stopPropagation();
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ Behandlar...';

    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/merge/${cvId}`, { method: 'POST' });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Behandling misslyckades');
        }
        await loadCVs();
    } catch (err) {
        btn.disabled = false;
        btn.textContent = '⚡ Behandla';
        showStatus(`❌ ${err.message}`, 'error');
    }
}

// Edit title inline
async function editTitle(id, event) {
    event.stopPropagation();
    const cv = allCVs.find(c => c.id === id);
    if (!cv) return;

    const current = cv.title || '';
    const newTitle = prompt('Ange titel för detta CV:', current);

    if (newTitle === null) return;

    try {
        const res = await apiFetch(`${API_BASE_URL}/cv/${id}/title`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle.trim() || cv.structured_data.personal_info.full_name })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Kunde inte spara titel');
        }

        const updated = await res.json();
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
function selectCV(id) {
    selectedCV = allCVs.find(cv => cv.id === id);
    displayCVs(allCVs);
    renderCVSelectList(allCVs);
    updateOptimizeButton();

    const mergeBtn = document.getElementById('merge-selected-btn');
    if (mergeBtn) mergeBtn.disabled = false;
}

function deselectCV() {
    if (!selectedCV) return;
    selectedCV = null;
    displayCVs(allCVs);
    renderCVSelectList(allCVs);
    updateOptimizeButton();

    const mergeBtn = document.getElementById('merge-selected-btn');
    if (mergeBtn) mergeBtn.disabled = true;
}

// View CV details
function viewCV(id, event) {
    event.stopPropagation();
    const cv = allCVs.find(cv => cv.id === id);

    if (!cv) return;

    const modal      = document.getElementById('cv-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody  = document.getElementById('modal-body');

    modalTitle.textContent = cv.structured_data.personal_info.full_name || 'CV-detaljer';
    modalBody.innerHTML = buildCVDetailsHTML(cv.structured_data);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// Close modal
function closeCVModal() {
    const modal = document.getElementById('cv-modal');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

// Build CV details HTML
function buildCVDetailsHTML(cvData) {
    let html = '';

    html += `
        <div class="cv-section">
            <h3 class="cv-section-title">Personlig Information</h3>
            <div class="cv-personal-grid">
                ${cvData.personal_info.email ? `<div class="cv-personal-item"><strong>Email:</strong> ${cvData.personal_info.email}</div>` : ''}
                ${cvData.personal_info.phone ? `<div class="cv-personal-item"><strong>Telefon:</strong> ${cvData.personal_info.phone}</div>` : ''}
                ${cvData.personal_info.location ? `<div class="cv-personal-item"><strong>Plats:</strong> ${cvData.personal_info.location}</div>` : ''}
                ${cvData.personal_info.linkedin ? `<div class="cv-personal-item"><strong>LinkedIn:</strong> <a href="${cvData.personal_info.linkedin}" target="_blank">Profil</a></div>` : ''}
                ${cvData.personal_info.github ? `<div class="cv-personal-item"><strong>GitHub:</strong> <a href="${cvData.personal_info.github}" target="_blank">Profil</a></div>` : ''}
                ${cvData.personal_info.website ? `<div class="cv-personal-item"><strong>Webbplats:</strong> <a href="${cvData.personal_info.website}" target="_blank">Besök</a></div>` : ''}
            </div>
        </div>
    `;

    if (cvData.summary) {
        html += `<div class="cv-section"><h3 class="cv-section-title">Sammanfattning</h3><div class="cv-summary">${cvData.summary}</div></div>`;
    }

    if (cvData.work_experience && cvData.work_experience.length > 0) {
        html += `<div class="cv-section"><h3 class="cv-section-title">Arbetslivserfarenhet</h3>`;
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
                    ${exp.achievements && exp.achievements.length > 0 ? `<div class="cv-achievements"><h4>Huvudsakliga prestationer</h4><ul>${exp.achievements.map(ach => `<li>${ach}</li>`).join('')}</ul></div>` : ''}
                    ${exp.technologies && exp.technologies.length > 0 ? `<div class="cv-tags">${exp.technologies.map(tech => `<span class="cv-tag">${tech}</span>`).join('')}</div>` : ''}
                </div>
            `;
        });
        html += `</div>`;
    }

    if (cvData.education && cvData.education.length > 0) {
        html += `<div class="cv-section"><h3 class="cv-section-title">Utbildning</h3>`;
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
                    ${edu.gpa ? `<div class="cv-personal-item">GPA: ${edu.gpa}</div>` : ''}
                    ${edu.achievements && edu.achievements.length > 0 ? `<div class="cv-achievements"><ul>${edu.achievements.map(ach => `<li>${ach}</li>`).join('')}</ul></div>` : ''}
                </div>
            `;
        });
        html += `</div>`;
    }

    if (cvData.skills && cvData.skills.length > 0) {
        html += `<div class="cv-section"><h3 class="cv-section-title">Kompetenser</h3><div class="cv-skills-grid">${cvData.skills.map(skill => `<span class="cv-skill-tag">${skill}</span>`).join('')}</div></div>`;
    }

    if (cvData.certifications && cvData.certifications.length > 0) {
        html += `<div class="cv-section"><h3 class="cv-section-title">Certifieringar</h3>`;
        cvData.certifications.forEach(cert => {
            html += `
                <div class="cv-education-item">
                    <h3>${cert.name || 'Certifiering'}</h3>
                    ${cert.issuing_organization ? `<div class="cv-experience-company">${cert.issuing_organization}</div>` : ''}
                    ${cert.issue_date ? `<div class="cv-personal-item">Utfärdad: ${cert.issue_date}</div>` : ''}
                    ${cert.credential_id ? `<div class="cv-personal-item">ID: ${cert.credential_id}</div>` : ''}
                </div>
            `;
        });
        html += `</div>`;
    }

    if (cvData.projects && cvData.projects.length > 0) {
        html += `<div class="cv-section"><h3 class="cv-section-title">Projekt</h3>`;
        cvData.projects.forEach(proj => {
            html += `
                <div class="cv-experience-item">
                    <h3>${proj.name || 'Projekt'}</h3>
                    ${proj.role ? `<div class="cv-experience-company">Roll: ${proj.role}</div>` : ''}
                    ${proj.description ? `<div class="cv-experience-description">${proj.description}</div>` : ''}
                    ${proj.url ? `<div class="cv-personal-item"><a href="${proj.url}" target="_blank">Projektlänk</a></div>` : ''}
                    ${proj.technologies && proj.technologies.length > 0 ? `<div class="cv-tags">${proj.technologies.map(tech => `<span class="cv-tag">${tech}</span>`).join('')}</div>` : ''}
                </div>
            `;
        });
        html += `</div>`;
    }

    if (cvData.languages && cvData.languages.length > 0) {
        html += `
            <div class="cv-section">
                <h3 class="cv-section-title">Språk</h3>
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

    const cv = allCVs.find(c => c.id === id);
    const name = cv?.title || cv?.structured_data?.personal_info?.full_name || 'detta CV';
    if (!confirm(`Vill du verkligen ta bort "${name}"?`)) {
        return;
    }

    showStatus('⏳ Raderar CV...', 'loading');

    try {
        const response = await apiFetch(`${API_BASE_URL}/cv/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Kunde inte ta bort CV');
        }

        if (selectedCV?.id === id) {
            selectedCV = null;
            updateOptimizeButton();
            const mergeBtn = document.getElementById('merge-selected-btn');
            if (mergeBtn) mergeBtn.disabled = true;
        }

        await loadCVs();
        showStatus('✅ CV borttaget.', 'success');

    } catch (error) {
        showStatus(`❌ ${error.message}`, 'error');
    }
}
