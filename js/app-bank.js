// ════════════════════════════════════════════════════
// KOMPETENSBANK (egna profilen)
// ════════════════════════════════════════════════════

let bankSkills = [];
let bankExperiences = [];
let activeBankTab = 'skills';
let selectedExperienceIds = new Set();

// Load bank stats + skills + experiences
async function loadBankData() {
    try {
        const [statsRes, skillsRes, expRes] = await Promise.all([
            apiFetch(`${API_BASE_URL}/competence/stats`),
            apiFetch(`${API_BASE_URL}/competence/skills`),
            apiFetch(`${API_BASE_URL}/competence/experiences`),
        ]);

        if (!statsRes.ok || !skillsRes.ok || !expRes.ok) return;

        const stats    = await statsRes.json();
        const skillsData = await skillsRes.json();
        const expData  = await expRes.json();

        bankSkills      = skillsData.skills || [];
        bankExperiences = expData.experiences || [];

        renderBankStats(stats);
        renderBankContent();
        if (typeof updateMatchWarning === 'function') updateMatchWarning();

    } catch (err) {
        console.warn('Kunde inte ladda kompetensbank:', err.message);
    }
}

function renderBankStats(stats) {
    const statSkills = document.getElementById('stat-skills');
    const statExp    = document.getElementById('stat-experiences');
    const statSrc    = document.getElementById('stat-sources');
    const statCat    = document.getElementById('stat-categories');
    if (statSkills) statSkills.textContent = stats.total_skills           ?? 0;
    if (statExp)    statExp.textContent    = stats.total_experiences      ?? 0;
    if (statSrc)    statSrc.textContent    = stats.total_source_documents ?? 0;
    if (statCat) {
        const catCount = stats.skills_by_category
            ? Object.keys(stats.skills_by_category).length : 0;
        statCat.textContent = catCount;
    }

    const dashSkills = document.getElementById('dash-skills-count');
    const dashExp    = document.getElementById('dash-exp-count');
    const dashEdu    = document.getElementById('dash-edu-count');
    const dashCert   = document.getElementById('dash-cert-count');
    if (dashSkills) dashSkills.textContent = stats.total_skills         ?? 0;
    if (dashExp)    dashExp.textContent    = stats.total_experiences    ?? 0;
    if (dashEdu)    dashEdu.textContent    = stats.total_education      ?? 0;
    if (dashCert)   dashCert.textContent   = stats.total_certifications ?? 0;
}

function renderBankContent() {
    const container = document.getElementById('bank-content');

    if (bankSkills.length === 0 && bankExperiences.length === 0) {
        container.innerHTML = `
            <div class="bank-empty">
                <p>🧠 ${t('bank.empty')}</p>
                <p class="empty-state-hint">${t('bank.empty_hint')}</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="bank-tabs">
            <button class="bank-tab ${activeBankTab === 'skills' ? 'active' : ''}"
                    onclick="switchBankTab('skills', this)">
                ${t('bank.tab_skills')} (${bankSkills.length})
            </button>
            <button class="bank-tab ${activeBankTab === 'experiences' ? 'active' : ''}"
                    onclick="switchBankTab('experiences', this)">
                ${t('bank.tab_exp')} (${bankExperiences.length})
            </button>
        </div>
        <div id="bank-tab-body"></div>
    `;

    renderActiveBankTab();
}

function switchBankTab(tab, el) {
    activeBankTab = tab;
    document.querySelectorAll('.bank-tab').forEach(btn => btn.classList.remove('active'));
    if (el) el.classList.add('active');
    renderActiveBankTab();
}

function renderActiveBankTab() {
    const body = document.getElementById('bank-tab-body');
    if (!body) return;

    if (activeBankTab === 'skills') {
        body.innerHTML = renderSkillsTab();
        setupSkillDragDrop(body, async (skillId, newCat) => {
            const skill = bankSkills.find(s => s.id === skillId);
            if (!skill) return;
            await apiFetch(`${API_BASE_URL}/competence/skills/${skillId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skill_name: skill.skill_name, category: newCat, skill_level: skill.skill_level }),
            });
            await loadBankData();
        });
    } else {
        body.innerHTML = renderExperiencesTab();
    }
}

// Group skills by category and render chips
function renderSkillsTab() {
    const addRow = `
        <div class="bank-action-row">
            <button class="btn btn-primary btn-small" onclick="showAddSkillForm()">${t('bank.add_skill_btn')}</button>
        </div>
        <div id="add-skill-form-container"></div>
    `;

    if (bankSkills.length === 0) {
        return addRow + `<div class="bank-empty"><p>${t('bank.no_skills')}</p></div>`;
    }

    const CATEGORY_ALIASES = {
        'Programming Languages': 'Mjukvaruutveckling',
    };

    const groups = {};
    bankSkills.forEach(s => {
        const raw = s.category || 'Övrigt';
        const cat = CATEGORY_ALIASES[raw] || raw;
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(s);
    });

    const sortedCats = Object.keys(groups).sort((a, b) => a.localeCompare(b, currentLang));

    return addRow + sortedCats.map(cat => `
        <div class="bank-category-block">
            <div class="bank-category-title">
                ${categoryIcon(cat)} ${cat}
                <span class="bank-category-count">${groups[cat].length}</span>
            </div>
            <div class="bank-skills-wrap skill-drop-zone" data-cat-drop-zone="${esc(cat)}">
                ${groups[cat].slice().sort((a, b) => a.skill_name.localeCompare(b.skill_name, currentLang)).map(s => `
                    <span class="bank-skill-chip ${skillLevelClass(s.skill_level)}" draggable="true" data-skill-id="${s.id}" data-skill-cat="${esc(cat)}">
                        ${s.skill_name}
                        <button class="chip-delete" onclick="event.stopPropagation(); deleteSkill(${s.id}, '${s.skill_name.replace(/'/g, "\\'")}')" title="${t('action.delete')}"><span class="material-icons">close</span></button>
                    </span>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// Render experience timeline
function renderExperiencesTab() {
    if (bankExperiences.length === 0) {
        return `<div class="bank-empty"><p>${t('bank.no_exp')}</p></div>`;
    }

    const typeOrder = ['work', 'education', 'certification', 'project'];
    const typeLabels = {
        work:          t('bank.type_work'),
        education:     t('bank.type_edu'),
        certification: t('bank.type_cert'),
        project:       t('bank.type_project'),
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

    const mergeBar = `
        <div class="bank-merge-bar ${selectedExperienceIds.size >= 2 ? 'visible' : ''}" id="exp-merge-bar">
            <span>${selectedExperienceIds.size} ${t('bank.selected')}</span>
            <button class="btn btn-primary btn-small" onclick="mergeSelectedExperiences()"
                    ${selectedExperienceIds.size < 2 ? 'disabled' : ''}>
                ${t('bank.merge_selected')}
            </button>
            <button class="btn btn-ghost btn-small" onclick="clearExperienceSelection()">${t('bank.deselect')}</button>
        </div>
    `;

    const addExpRow = `
        <div class="bank-action-row">
            <button class="btn btn-primary btn-small" onclick="showAddExperienceForm()">${t('bank.add_exp_btn')}</button>
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
                        ? `${e.start_date} — ${e.is_current ? t('bank.current') : (e.end_date || '')}`
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
                                            ${e.is_current ? `<span class="bank-exp-badge">${t('bank.current')}</span>` : ''}
                                            ${sourceCount > 1 ? `<span class="bank-exp-source-badge">${sourceCount} CV:n</span>` : ''}
                                        </h4>
                                        <div class="bank-exp-date-row" id="date-row-${e.id}">
                                            ${dateStr ? `<span class="bank-exp-date">${dateStr}</span>` : `<span class="bank-exp-date bank-exp-date-empty">${t('bank.no_date')}</span>`}
                                            <button class="btn-icon btn-icon-small btn-edit-period" onclick="editPeriod(${e.id}, '${e.start_date || ''}', '${e.end_date || ''}', ${e.is_current})" title="${t('action.edit_period')}"><span class="material-icons">edit</span></button>
                                        </div>
                                        <div id="period-form-${e.id}"></div>
                                    </div>
                                    <div class="bank-exp-actions">
                                        <button class="btn-icon btn-icon-danger" onclick="event.stopPropagation(); deleteExperience(${e.id}, '${e.title.replace(/'/g, "\\'")}')" title="${t('action.delete_experience')}"><span class="material-icons">delete</span></button>
                                    </div>
                                </div>
                                ${e.organization ? `<div class="bank-exp-org">${e.organization}</div>` : ''}
                                <div class="bank-exp-desc ${e.description ? '' : 'bank-exp-desc-empty'}"
                                     onclick="editDescription(${e.id}, this)"
                                     title="${t('action.click_to_edit')}"
                                     id="desc-${e.id}">${e.description || `<span class="desc-placeholder">${t('bank.add_desc_ph')}</span>`}</div>
                                <div class="bank-exp-achievements">
                                    <div class="bank-exp-achievements-label">
                                        ${t('bank.achievements_label')}
                                        <button class="btn-icon btn-icon-small" onclick="showAddAchievementForm(${e.id})" title="${t('action.add_achievement')}">+</button>
                                        ${achievements.length > 0 ? `<button class="btn-improve-ach" onclick="improveAchievements(${e.id})" title="${t('action.improve')}">${t('bank.improve_btn')}</button>` : ''}
                                    </div>
                                    <div id="add-achievement-form-${e.id}"></div>
                                    <div id="improve-achievement-preview-${e.id}"></div>
                                    ${achievements.length > 0 ? `
                                        <ul id="ach-list-${e.id}">
                                            ${achievements.map((a, idx) => `
                                                <li>
                                                    <span class="achievement-text" id="ach-text-${e.id}-${idx}">${a}</span>
                                                    <span class="achievement-actions">
                                                        <button class="btn-icon btn-icon-small" onclick="editAchievement(${e.id}, ${idx})" title="${t('action.edit')}"><span class="material-icons">edit</span></button>
                                                        <button class="btn-icon btn-icon-small btn-icon-danger" onclick="deleteAchievement(${e.id}, ${idx})" title="${t('action.delete')}"><span class="material-icons">close</span></button>
                                                    </span>
                                                </li>
                                            `).join('')}
                                        </ul>
                                    ` : ''}
                                </div>
                                <div class="bank-exp-skills">
                                    <div class="bank-exp-skills-label">
                                        ${t('bank.related_skills_label')}
                                        <button class="btn-icon btn-icon-small" onclick="showAddExpSkillForm(${e.id})" title="${t('action.add_skill')}">+</button>
                                    </div>
                                    <div id="add-exp-skill-form-${e.id}"></div>
                                    ${skills.length > 0 ? `
                                        <div class="bank-exp-skills-wrap">
                                            ${skills.map((s, idx) => `
                                                <span class="bank-skill-chip chip-technical">
                                                    ${s}
                                                    <button class="chip-delete" onclick="event.stopPropagation(); removeExpSkill(${e.id}, ${idx}, '${s.replace(/'/g, "\\'")}')" title="${t('action.delete')}"><span class="material-icons">close</span></button>
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
    if (!confirm(t('bank.confirm_merge_exp').replace('%n', ids.length))) return;

    showMergeStatus(t('bank.merging_exp'), 'loading');

    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/merge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ experience_ids: ids }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || t('bank.merge_exp_failed'));
        }

        const data = await res.json();
        selectedExperienceIds.clear();
        showMergeStatus(
            `<span class="material-icons" style="font-size:1rem;vertical-align:middle">check_circle</span> ${data.merged_count} ${t('bank.selected')} → "${data.title}"`,
            'success'
        );
        await loadBankData();

    } catch (err) {
        showMergeStatus(`<span class="material-icons" style="font-size:1rem;vertical-align:middle">error</span> ${err.message}`, 'error');
    }
}

function categoryIcon(cat) {
    const icons = {
        'Mjukvaruutveckling': '',
        'Frameworks & APIs': '',
        'Databases': '',
        'Cloud & DevOps': '',
        'AI & Machine Learning': '',
        'Frontend': '',
        'Technical Skills': '',
        'Tools': '',
        'Soft Skills': '',
        'Languages': '',
        'Domain Knowledge': '',
    };
    return icons[cat] || '●';
}

function showMergeStatus(message, type) {
    const el = document.getElementById('merge-status');
    if (!el) return;
    const icon = type === 'loading' ? '<div class="spinner"></div>' : '';
    el.innerHTML = `<div class="status-message status-${type}">${icon}<span>${message}</span></div>`;
    if (type === 'success' || type === 'error') {
        setTimeout(() => { el.innerHTML = ''; }, 5000);
    }
}

async function mergeSelectedCV() {
    if (!selectedCV) {
        alert(t('bank.no_cv_selected'));
        return;
    }

    showMergeStatus(t('bank.merging_cv'), 'loading');
    document.getElementById('merge-selected-btn').disabled = true;

    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/merge/${selectedCV.id}`, {
            method: 'POST'
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || t('bank.merge_failed'));
        }

        const data = await res.json();
        showMergeStatus(
            `<span class="material-icons" style="font-size:1rem;vertical-align:middle">check_circle</span> ${data.cv_name}: +${data.skills_added} skills, +${data.experiences_added} exp, ${data.duplicates_skipped} dup`,
            'success'
        );
        await loadBankData();

    } catch (err) {
        showMergeStatus(`<span class="material-icons" style="font-size:1rem;vertical-align:middle">error</span> ${err.message}`, 'error');
    } finally {
        document.getElementById('merge-selected-btn').disabled = false;
    }
}

// ── Merge ALL CVs ─────────────────────────────────────────────────────────────
async function mergeAllCVs() {
    showMergeStatus(t('bank.merging_all'), 'loading');
    document.getElementById('merge-all-btn').disabled = true;

    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/merge-all`, {
            method: 'POST'
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || t('bank.merge_failed'));
        }

        const data = await res.json();
        showMergeStatus(
            `<span class="material-icons" style="font-size:1rem;vertical-align:middle">check_circle</span> ${data.total_cvs_processed} CVs — +${data.total_skills_added} skills, +${data.total_experiences_added} exp`,
            'success'
        );
        await loadBankData();

    } catch (err) {
        showMergeStatus(`<span class="material-icons" style="font-size:1rem;vertical-align:middle">error</span> ${err.message}`, 'error');
    } finally {
        document.getElementById('merge-all-btn').disabled = false;
    }
}

// ── Skill CRUD ──────────────────────────────────────────────────────────────

function showAddSkillForm() {
    const container = document.getElementById('add-skill-form-container');
    container.innerHTML = `
        <div class="bank-inline-form">
            <div>
                <label for="new-skill-name" style="display:block;font-size:0.8125rem;color:var(--text-muted);margin-bottom:2px">${t('bank.label_skill')}</label>
                <input type="text" id="new-skill-name" placeholder="t.ex. Python, Projektledning" class="form-input" />
            </div>
            <div>
                <label for="new-skill-category" style="display:block;font-size:0.8125rem;color:var(--text-muted);margin-bottom:2px">${t('bank.label_category')}</label>
                <select id="new-skill-category" class="form-input">
                    <option value="">${t('bank.auto_category')}</option>
                    <option value="Mjukvaruutveckling">Mjukvaruutveckling</option>
                    <option value="Frameworks & APIs">Frameworks & APIs</option>
                    <option value="Databases">Databases</option>
                    <option value="Cloud & DevOps">Cloud & DevOps</option>
                    <option value="AI & Machine Learning">AI & Machine Learning</option>
                    <option value="Frontend">Frontend</option>
                    <option value="Tools">Tools</option>
                    <option value="Soft Skills">Soft Skills</option>
                    <option value="Languages">Languages</option>
                </select>
            </div>
            <div style="display:flex;gap:8px;align-items:flex-end">
                <button class="btn btn-primary btn-small" onclick="submitNewSkill()">${t('common.save')}</button>
                <button class="btn btn-ghost btn-small" onclick="hideAddSkillForm()">${t('common.cancel')}</button>
            </div>
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
    if (!name) return alert(t('bank.skill_name_required'));
    const category = document.getElementById('new-skill-category').value || null;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/skills`, {
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
    if (!confirm(t('bank.confirm_delete_skill').replace('%n', skillName))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/skills/${skillId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort skill');
        await loadBankData();
    } catch (err) {
        alert(err.message);
    }
}

// ── Experience delete ───────────────────────────────────────────────────────

async function deleteExperience(expId, title) {
    if (!confirm(t('bank.confirm_delete_exp').replace('%n', title))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${expId}`, { method: 'DELETE' });
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
            <input type="text" id="new-ach-text-${expId}" placeholder="${t('bank.new_ach_ph')}" class="form-input"
                   onkeydown="if(event.key==='Enter') submitNewAchievement(${expId}); if(event.key==='Escape') document.getElementById('add-achievement-form-${expId}').innerHTML='';" />
            <button class="btn btn-primary btn-small" onclick="submitNewAchievement(${expId})">${t('common.save')}</button>
            <button class="btn btn-ghost btn-small" onclick="document.getElementById('add-achievement-form-${expId}').innerHTML=''">${t('common.cancel')}</button>
        </div>
    `;
    document.getElementById(`new-ach-text-${expId}`).focus();
}

async function submitNewAchievement(expId) {
    const input = document.getElementById(`new-ach-text-${expId}`);
    const text = input.value.trim();
    if (!text) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${expId}/achievements`, {
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
    if (el.querySelector('textarea')) return;
    const current = el.dataset.desc ?? el.textContent.trim();
    el.innerHTML = `
        <textarea class="desc-textarea" id="desc-ta-${expId}"
                  onkeydown="if(event.key==='Escape') cancelEditDescription(this.closest('.bank-exp-desc'))"
        >${current}</textarea>
        <div class="desc-actions">
            <button class="btn btn-primary btn-small" onclick="event.stopPropagation(); saveDescription(${expId})">${t('common.save')}</button>
            <button class="btn btn-ghost btn-small" onclick="event.stopPropagation(); cancelEditDescription(document.getElementById('desc-${expId}'))">${t('common.cancel')}</button>
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
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${expId}/description`, {
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
    el.innerHTML = original || `<span class="desc-placeholder">${t('bank.add_desc_ph')}</span>`;
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
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${expId}/achievements/${index}`, {
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
    if (!confirm(t('bank.confirm_delete_ach'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${expId}/achievements/${index}`, { method: 'DELETE' });
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
            <input type="text" id="new-exp-skill-${expId}" placeholder="${t('bank.skills_comma_ph')}" class="form-input"
                   onkeydown="if(event.key==='Enter') submitNewExpSkill(${expId}); if(event.key==='Escape') document.getElementById('add-exp-skill-form-${expId}').innerHTML='';" />
            <button class="btn btn-primary btn-small" onclick="submitNewExpSkill(${expId})">${t('common.save')}</button>
            <button class="btn btn-ghost btn-small" onclick="document.getElementById('add-exp-skill-form-${expId}').innerHTML=''">${t('common.cancel')}</button>
        </div>
    `;
    document.getElementById(`new-exp-skill-${expId}`).focus();
}

async function submitNewExpSkill(expId) {
    const input = document.getElementById(`new-exp-skill-${expId}`);
    const name = input.value.trim();
    if (!name) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${expId}/skills`, {
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
    if (!confirm(t('bank.confirm_delete_skill').replace('%n', skillName))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${expId}/skills/${index}`, { method: 'DELETE' });
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
                    <label>${t('bank.label_title')}</label>
                    <input type="text" id="new-exp-title" placeholder="T.ex. Systemutvecklare" class="form-input" />
                </div>
                <div class="bank-form-field">
                    <label>${t('bank.label_org')}</label>
                    <input type="text" id="new-exp-org" placeholder="T.ex. Företaget AB" class="form-input" />
                </div>
            </div>
            <div class="bank-form-row">
                <div class="bank-form-field">
                    <label>${t('bank.label_type')}</label>
                    <select id="new-exp-type" class="form-input">
                        <option value="work">${t('bank.type_opt_work')}</option>
                        <option value="education">${t('bank.type_opt_edu')}</option>
                        <option value="certification">${t('bank.type_opt_cert')}</option>
                        <option value="project">${t('bank.type_opt_project')}</option>
                    </select>
                </div>
                <div class="bank-form-field">
                    <label>${t('bank.label_start_date')}</label>
                    <input type="text" id="new-exp-start" placeholder="T.ex. 2020-01" class="form-input" />
                </div>
                <div class="bank-form-field">
                    <label>${t('bank.label_end_date')}</label>
                    <input type="text" id="new-exp-end" placeholder="T.ex. 2023-06" class="form-input" />
                </div>
                <div class="bank-form-field bank-form-check">
                    <label><input type="checkbox" id="new-exp-current" /> ${t('bank.current')}</label>
                </div>
            </div>
            <div class="bank-form-row">
                <div class="bank-form-field bank-form-full">
                    <label>${t('bank.label_desc')}</label>
                    <textarea id="new-exp-desc" rows="3" placeholder="${t('bank.desc_ph')}" class="form-input"></textarea>
                </div>
            </div>
            <div class="bank-form-actions">
                <button class="btn btn-primary btn-small" onclick="submitNewExperience()">${t('common.save')}</button>
                <button class="btn btn-ghost btn-small" onclick="hideAddExperienceForm()">${t('common.cancel')}</button>
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
    if (!title) return alert(t('bank.title_required'));

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
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences`, {
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

// ── Improve Achievements ──────────────────────────────────────────────────────

async function improveAchievements(expId) {
    const btn = document.querySelector(`button[onclick="improveAchievements(${expId})"]`);
    const preview = document.getElementById(`improve-achievement-preview-${expId}`);
    if (!btn || !preview) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-small"></span>';
    preview.innerHTML = `<p class="ach-improve-loading">${t('bank.analysing_ach')}</p>`;

    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${expId}/improve-achievements`, {
            method: 'POST',
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || '');
        }
        const data = await res.json();
        showImprovePreview(expId, data.improved, data.original);
    } catch (err) {
        preview.innerHTML = `<p class="ach-improve-error"><span class="material-icons" style="font-size:1rem;vertical-align:middle">error</span> ${err.message}</p>`;
        btn.disabled = false;
        btn.textContent = t('bank.improve_btn');
    }
}

function showImprovePreview(expId, improved, original) {
    const preview = document.getElementById(`improve-achievement-preview-${expId}`);
    if (!preview) return;

    const listHTML = improved.map((a, i) => `
        <li class="ach-improve-item">
            <span>${a}</span>
        </li>
    `).join('');

    preview.innerHTML = `
        <div class="ach-improve-box">
            <div class="ach-improve-header">
                <span class="ach-improve-title">${t('bank.improve_title')}</span>
                <span class="ach-improve-count">${improved.length}</span>
            </div>
            <ul class="ach-improve-list">${listHTML}</ul>
            <div class="ach-improve-actions">
                <button class="btn btn-primary btn-small" onclick="acceptImprovedAchievements(${expId}, this)">${t('common.accept')}</button>
                <button class="btn btn-ghost btn-small" onclick="cancelImprovedAchievements(${expId})">${t('common.cancel')}</button>
            </div>
        </div>
    `;
    preview.querySelector('.btn-primary')._improvedData = improved;
}

async function acceptImprovedAchievements(expId, btn) {
    const improved = btn._improvedData;
    if (!improved) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-small"></span>';

    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${expId}/achievements`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ achievements: improved }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Kunde inte spara prestationer');
        }
        await loadBankData();
    } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = t('common.accept');
    }
}

function cancelImprovedAchievements(expId) {
    const preview = document.getElementById(`improve-achievement-preview-${expId}`);
    if (preview) preview.innerHTML = '';

    const btn = document.querySelector(`button[onclick="improveAchievements(${expId})"]`);
    if (btn) {
        btn.disabled = false;
        btn.textContent = t('bank.improve_btn');
    }
}

// ── Edit Period ───────────────────────────────────────────────────────────────

function editPeriod(expId, startDate, endDate, isCurrent) {
    const form = document.getElementById(`period-form-${expId}`);
    const row  = document.getElementById(`date-row-${expId}`);
    if (!form || !row) return;

    row.style.display = 'none';
    form.innerHTML = `
        <div class="period-edit-form">
            <div class="period-edit-fields">
                <div class="period-edit-field">
                    <label>${t('bank.label_start_date')}</label>
                    <input type="text" id="period-start-${expId}" value="${startDate}" placeholder="T.ex. 2020-01" class="form-input form-input-small" />
                </div>
                <div class="period-edit-field" id="period-end-wrap-${expId}" ${isCurrent ? 'style="display:none"' : ''}>
                    <label>${t('bank.label_end_date')}</label>
                    <input type="text" id="period-end-${expId}" value="${endDate}" placeholder="T.ex. 2023-06" class="form-input form-input-small" />
                </div>
                <div class="period-edit-field period-edit-check">
                    <label>
                        <input type="checkbox" id="period-current-${expId}" ${isCurrent ? 'checked' : ''}
                               onchange="toggleCurrentCheckbox(${expId})" />
                        ${t('bank.current')}
                    </label>
                </div>
            </div>
            <div class="period-edit-actions">
                <button class="btn btn-primary btn-small" onclick="savePeriod(${expId})">${t('common.save')}</button>
                <button class="btn btn-ghost btn-small" onclick="cancelEditPeriod(${expId})">${t('common.cancel')}</button>
            </div>
        </div>
    `;
    document.getElementById(`period-start-${expId}`).focus();
}

function toggleCurrentCheckbox(expId) {
    const isCurrent = document.getElementById(`period-current-${expId}`).checked;
    const wrap = document.getElementById(`period-end-wrap-${expId}`);
    if (wrap) wrap.style.display = isCurrent ? 'none' : '';
}

async function savePeriod(expId) {
    const startDate = document.getElementById(`period-start-${expId}`).value.trim() || null;
    const isCurrent = document.getElementById(`period-current-${expId}`).checked;
    const endDate   = isCurrent ? null : (document.getElementById(`period-end-${expId}`).value.trim() || null);

    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${expId}/period`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start_date: startDate, end_date: endDate, is_current: isCurrent }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Kunde inte spara tidsperiod');
        }
        await loadBankData();
    } catch (err) {
        alert(err.message);
    }
}

function cancelEditPeriod(expId) {
    const form = document.getElementById(`period-form-${expId}`);
    const row  = document.getElementById(`date-row-${expId}`);
    if (form) form.innerHTML = '';
    if (row)  row.style.display = '';
}
