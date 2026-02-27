// ════════════════════════════════════════════════════
// SÖKPROFIL / MIN PROFIL (sp-* prefix)
// ════════════════════════════════════════════════════

async function loadSokprofil() {
    try {
        const res  = await apiFetch(`${API_BASE_URL}/sokprofil/`);
        if (!res.ok) return;
        const data = await res.json();

        document.getElementById('sp-email').value        = data.email        || '';
        document.getElementById('sp-public-name').value  = data.public_name  || '';
        document.getElementById('sp-public-phone').value = data.public_phone || '';
        document.getElementById('sp-roles').value        = data.roles        || '';
        document.getElementById('sp-city').value         = data.desired_city || '';

        ['sp-emp-heltid', 'sp-emp-deltid', 'sp-emp-timmar', 'sp-emp-fast', 'sp-emp-konsult'].forEach(id => {
            const el = document.getElementById(id);
            el.checked = (data.desired_employment || []).includes(el.value);
        });

        ['sp-wp-plats', 'sp-wp-hybrid', 'sp-wp-distans'].forEach(id => {
            const el = document.getElementById(id);
            el.checked = (data.desired_workplace || []).includes(el.value);
        });

        document.getElementById('sp-commute').checked    = data.willing_to_commute;
        document.getElementById('sp-searchable').checked = data.searchable;
        document.getElementById('sp-available-from').value = data.available_from || '';
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

async function saveSokprofil() {
    const desired_employment = ['sp-emp-heltid', 'sp-emp-deltid', 'sp-emp-timmar', 'sp-emp-fast', 'sp-emp-konsult']
        .filter(id => document.getElementById(id).checked)
        .map(id => document.getElementById(id).value);

    const desired_workplace = ['sp-wp-plats', 'sp-wp-hybrid', 'sp-wp-distans']
        .filter(id => document.getElementById(id).checked)
        .map(id => document.getElementById(id).value);

    try {
        const res = await apiFetch(`${API_BASE_URL}/sokprofil/`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email:              document.getElementById('sp-email').value.trim()         || null,
                public_name:        document.getElementById('sp-public-name').value.trim()  || null,
                public_phone:       document.getElementById('sp-public-phone').value.trim() || null,
                roles:              document.getElementById('sp-roles').value.trim()         || null,
                desired_city:       document.getElementById('sp-city').value.trim()          || null,
                desired_employment,
                desired_workplace,
                willing_to_commute: document.getElementById('sp-commute').checked,
                searchable:         document.getElementById('sp-searchable').checked,
                available_from:     document.getElementById('sp-available-from').value || null,
            }),
        });
        if (!res.ok) throw new Error('Kunde inte spara');
        showSokprofilStatus('Sökprofilen sparades ✓', 'success');
    } catch (err) {
        showSokprofilStatus(err.message, 'error');
    }
}

function showSokprofilStatus(msg, type) {
    const el = document.getElementById('sp-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

function switchSokprofilTab(tab) {
    ['basinfo', 'kompetenser', 'erfarenheter', 'utbildning', 'certifikat', 'cv'].forEach(t => {
        document.getElementById(`sp-tab-${t}`).style.display       = t === tab ? '' : 'none';
        document.getElementById(`sp-tab-btn-${t}`).classList.toggle('active', t === tab);
    });
    if (tab === 'kompetenser')  loadSpKompetenser();
    if (tab === 'erfarenheter') loadSpErfarenheter();
    if (tab === 'utbildning')   loadSpEducation();
    if (tab === 'certifikat')   loadSpCertifications();
    if (tab === 'cv') { setupSpCVUpload(); loadSpCandidateCVs(); }
}

// ── Kompetenser ────────────────────────────────────────────────────────────────

async function loadSpKompetenser() {
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/skills`);
        if (!res.ok) return;
        const data = await res.json();
        cachedSpSkills = data.skills || [];
        spEditingSkillId = null;
        renderSpSkills(cachedSpSkills);
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

async function addSpSkill() {
    const nameEl = document.getElementById('sp-skill-name');
    const catEl  = document.getElementById('sp-skill-category');
    const name   = nameEl.value.trim();
    if (!name) { showSpSkillStatus('Ange ett kompetensnamn', 'error'); return; }

    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/skills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                skill_name: name,
                category:   catEl.value.trim() || 'Övrigt',
            }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        nameEl.value = '';
        catEl.value  = '';
        showSpSkillStatus('Kompetens tillagd', 'success');
        await loadSpKompetenser();
    } catch (err) {
        showSpSkillStatus(err.message, 'error');
    }
}

function showSpSkillStatus(msg, type) {
    const el = document.getElementById('sp-skill-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 3500);
}

function renderSpSkills(skills) {
    const container = document.getElementById('sp-skills-list');
    if (!container) return;
    if (!skills || !skills.length) {
        container.innerHTML = '<div class="empty-hint">Inga kompetenser i banken ännu. Ladda upp ett CV under CV-fliken.</div>';
        return;
    }
    const byCategory = {};
    skills.forEach(s => {
        const cat = s.category || 'Övrigt';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(s);
    });
    const typeClass = t => t === 'soft' ? 'chip-soft' : t === 'language' ? 'chip-language' : 'chip-technical';
    const clearBarSkills = `<div class="list-clear-bar"><span>${skills.length} kompetens${skills.length !== 1 ? 'er' : ''}</span><button class="btn btn-danger btn-sm" onclick="clearSpSkills()">Rensa alla</button></div>`;
    container.innerHTML = clearBarSkills + Object.entries(byCategory).map(([cat, items]) => `
        <div style="margin-bottom:1rem">
            <div style="font-size:0.8125rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;
                        letter-spacing:0.05em;margin-bottom:0.5rem">${cat}</div>
            <div class="bank-skills-wrap">
                ${items.map(s => {
                    if (s.id === spEditingSkillId) {
                        return `<div class="skill-edit-row">
                            <input class="form-input" id="sp-edit-skill-name" value="${esc(s.skill_name)}" placeholder="Kompetensnamn" style="flex:1;min-width:120px">
                            <input class="form-input" id="sp-edit-skill-cat"  value="${esc(s.category)}"   placeholder="Kategori"      style="flex:1;min-width:100px">
                            <select class="form-input" id="sp-edit-skill-type" style="min-width:110px">
                                <option value="technical" ${s.skill_type==='technical'?'selected':''}>Teknisk</option>
                                <option value="soft"      ${s.skill_type==='soft'     ?'selected':''}>Mjuk</option>
                                <option value="language"  ${s.skill_type==='language' ?'selected':''}>Språk</option>
                                <option value="tool"      ${s.skill_type==='tool'     ?'selected':''}>Verktyg</option>
                            </select>
                            <button class="btn btn-primary btn-small" onclick="saveSpSkill(${s.id})">Spara</button>
                            <button class="btn btn-secondary btn-small" onclick="spEditingSkillId=null;renderSpSkills(cachedSpSkills)">Avbryt</button>
                        </div>`;
                    }
                    return `<span class="bank-skill-chip ${typeClass(s.skill_type)}">
                        ${esc(s.skill_name)}
                        <button class="chip-delete" style="font-size:0.85em;padding:0 1px 0 3px" onclick="spEditingSkillId=${s.id};renderSpSkills(cachedSpSkills)" title="Redigera">✎</button>
                        <button class="chip-delete" onclick="deleteSpSkill(${s.id})" title="Ta bort">×</button>
                    </span>`;
                }).join('')}
            </div>
        </div>
    `).join('');
}

async function saveSpSkill(id) {
    const body = {
        skill_name: document.getElementById('sp-edit-skill-name').value.trim(),
        category:   document.getElementById('sp-edit-skill-cat').value.trim()  || 'Övrigt',
        skill_type: document.getElementById('sp-edit-skill-type').value,
    };
    if (!body.skill_name) { alert('Kompetensnamn krävs'); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/skills/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        spEditingSkillId = null;
        await loadSpKompetenser();
    } catch (err) { alert(err.message); }
}

async function deleteSpSkill(id) {
    if (!confirm('Ta bort kompetensen?')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/skills/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadSpKompetenser();
    } catch (err) { alert(err.message); }
}

async function clearSpSkills() {
    if (!confirm('Radera alla kompetenser? Detta kan inte ångras.')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/skills`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadSpKompetenser();
    } catch (err) { alert(err.message); }
}

// ── Erfarenheter ───────────────────────────────────────────────────────────────

async function loadSpErfarenheter() {
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences`);
        if (!res.ok) return;
        const data = await res.json();
        cachedSpExps = data.experiences || [];
        spEditingExpId = null;
        renderSpExperiences(cachedSpExps);
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function renderSpExperiences(experiences) {
    const container = document.getElementById('sp-experiences-list');
    if (!container) return;
    if (!experiences || !experiences.length) {
        container.innerHTML = '<div class="empty-hint">Inga erfarenheter i banken ännu. Ladda upp ett CV under CV-fliken.</div>';
        return;
    }
    const typeLabel = { work: 'Arbete', education: 'Utbildning', certification: 'Certifiering', project: 'Projekt' };
    const sel = (val, opt) => opt === val ? 'selected' : '';
    const clearBarExp = `<div class="list-clear-bar"><span>${experiences.length} erfarenhet${experiences.length !== 1 ? 'er' : ''}</span><button class="btn btn-danger btn-sm" onclick="clearSpExperiences()">Rensa alla</button></div>`;
    container.innerHTML = clearBarExp + experiences.map(e => {
        if (e.id === spEditingExpId) {
            const achText = (e.achievements || []).join('\n');
            return `<div style="border:1px solid var(--blue);border-radius:var(--radius);padding:0.875rem 1rem;margin-bottom:0.75rem">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem">
                    <input class="form-input" id="sp-edit-exp-title" value="${esc(e.title)}" placeholder="Titel" style="grid-column:span 2">
                    <input class="form-input" id="sp-edit-exp-org"   value="${esc(e.organization)}" placeholder="Organisation">
                    <select class="form-input" id="sp-edit-exp-type">
                        <option value="work"    ${sel(e.experience_type,'work')}   >Arbete</option>
                        <option value="project" ${sel(e.experience_type,'project')}>Projekt</option>
                    </select>
                    <input class="form-input" id="sp-edit-exp-start" value="${esc(e.start_date)}" placeholder="Från (ÅÅÅÅ-MM)">
                    <input class="form-input" id="sp-edit-exp-end"   value="${esc(e.end_date)}"   placeholder="Till (ÅÅÅÅ-MM)">
                </div>
                <label style="font-size:0.8125rem;display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem">
                    <input type="checkbox" id="sp-edit-exp-current" ${e.is_current?'checked':''}> Pågående
                </label>
                <textarea class="form-input" id="sp-edit-exp-desc" placeholder="Beskrivning" rows="3" style="margin-bottom:0.5rem;width:100%;box-sizing:border-box">${esc(e.description)}</textarea>
                <label style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.25rem;display:block">Prestationer (en per rad)</label>
                <textarea class="form-input" id="sp-edit-exp-ach" placeholder="En prestation per rad" rows="3" style="margin-bottom:0.5rem;width:100%;box-sizing:border-box">${esc(achText)}</textarea>
                <div style="display:flex;gap:0.5rem">
                    <button class="btn btn-primary btn-small" onclick="saveSpExperience(${e.id})">Spara</button>
                    <button class="btn btn-secondary btn-small" onclick="spEditingExpId=null;renderSpExperiences(cachedSpExps)">Avbryt</button>
                </div>
            </div>`;
        }
        const period = [e.start_date, e.is_current ? 'nu' : e.end_date].filter(Boolean).join(' – ');
        const achHtml = (e.achievements || []).length
            ? `<ul class="exp-card-ach">${(e.achievements).map(a=>`<li>${esc(a)}</li>`).join('')}</ul>` : '';
        return `<div class="exp-card">
            <div class="exp-card-header">
                <div>
                    <span class="exp-card-type">${typeLabel[e.experience_type]||e.experience_type}</span>
                    <div class="exp-card-title">${esc(e.title)}</div>
                    ${e.organization ? `<div class="exp-card-org">${esc(e.organization)}</div>` : ''}
                    ${period ? `<div class="exp-card-period">${period}</div>` : ''}
                </div>
                <div class="exp-card-actions">
                    <button class="btn-icon" onclick="spEditingExpId=${e.id};renderSpExperiences(cachedSpExps)" title="Redigera">✎</button>
                    <button class="btn-icon btn-icon-danger" onclick="deleteSpExperience(${e.id})" title="Ta bort">&times;</button>
                </div>
            </div>
            ${e.description ? `<div class="exp-card-desc">${esc(e.description)}</div>` : ''}
            ${achHtml}
        </div>`;
    }).join('');
}

async function saveSpExperience(id) {
    const body = {
        title:           document.getElementById('sp-edit-exp-title').value.trim(),
        organization:    document.getElementById('sp-edit-exp-org').value.trim()   || null,
        experience_type: document.getElementById('sp-edit-exp-type').value,
        start_date:      document.getElementById('sp-edit-exp-start').value.trim() || null,
        end_date:        document.getElementById('sp-edit-exp-end').value.trim()   || null,
        is_current:      document.getElementById('sp-edit-exp-current').checked,
        description:     document.getElementById('sp-edit-exp-desc').value.trim() || null,
        achievements:    document.getElementById('sp-edit-exp-ach').value.split('\n').map(s=>s.trim()).filter(Boolean),
    };
    if (!body.title) { alert('Titel krävs'); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        spEditingExpId = null;
        await loadSpErfarenheter();
    } catch (err) { alert(err.message); }
}

async function deleteSpExperience(id) {
    if (!confirm('Ta bort erfarenheten?')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadSpErfarenheter();
    } catch (err) { alert(err.message); }
}

async function clearSpExperiences() {
    if (!confirm('Radera alla erfarenheter? Detta kan inte ångras.')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadSpErfarenheter();
    } catch (err) { alert(err.message); }
}

// ── Utbildning ─────────────────────────────────────────────────────────────────

async function loadSpEducation() {
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/education`);
        if (!res.ok) return;
        const data = await res.json();
        cachedSpEdu = data.education || [];
        spEditingEduId = null;
        renderSpEducation(cachedSpEdu);
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function renderSpEducation(items) {
    const container = document.getElementById('sp-education-list');
    if (!container) return;
    if (!items.length) {
        container.innerHTML = '<div class="empty-hint">Inga utbildningar tillagda ännu.</div>';
        return;
    }
    const clearBarEdu = `<div class="list-clear-bar"><span>${items.length} utbildning${items.length !== 1 ? 'ar' : ''}</span><button class="btn btn-danger btn-sm" onclick="clearSpEducation()">Rensa alla</button></div>`;
    container.innerHTML = clearBarEdu + items.map(e => {
        if (e.id === spEditingEduId) {
            return `<div style="border:1px solid var(--blue);border-radius:var(--radius);padding:0.875rem 1rem;margin-bottom:0.75rem">
                <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.5rem">
                    <input class="form-input" id="sp-edit-edu-degree"      value="${esc(e.degree)}"         placeholder="Examen / Utbildning" required>
                    <input class="form-input" id="sp-edit-edu-institution"  value="${esc(e.institution)}"    placeholder="Lärosäte">
                    <input class="form-input" id="sp-edit-edu-field"        value="${esc(e.field_of_study)}" placeholder="Ämne / Inriktning">
                    <div style="display:flex;gap:0.5rem">
                        <input class="form-input" id="sp-edit-edu-start" value="${esc(e.start_date)}" placeholder="Från (ÅÅÅÅ-MM)" style="flex:1">
                        <input class="form-input" id="sp-edit-edu-end"   value="${esc(e.end_date)}"   placeholder="Till (ÅÅÅÅ-MM)" style="flex:1">
                    </div>
                    <textarea class="form-input" id="sp-edit-edu-desc" placeholder="Beskrivning" rows="2">${esc(e.description)}</textarea>
                </div>
                <div style="display:flex;gap:0.5rem">
                    <button class="btn btn-primary btn-small" onclick="saveSpEducation(${e.id})">Spara</button>
                    <button class="btn btn-secondary btn-small" onclick="spEditingEduId=null;renderSpEducation(cachedSpEdu)">Avbryt</button>
                </div>
            </div>`;
        }
        const period = [e.start_date, e.end_date].filter(Boolean).join(' – ');
        return `<div class="edu-card">
            <div>
                <div class="edu-card-title">${esc(e.degree)}</div>
                ${e.institution    ? `<div class="edu-card-sub">${esc(e.institution)}</div>` : ''}
                ${e.field_of_study ? `<div class="edu-card-sub">${esc(e.field_of_study)}</div>` : ''}
                ${period           ? `<div class="edu-card-period">${period}</div>` : ''}
            </div>
            <div class="exp-card-actions">
                <button class="btn-icon" onclick="spEditingEduId=${e.id};renderSpEducation(cachedSpEdu)" title="Redigera">✎</button>
                <button class="btn-icon btn-icon-danger" onclick="deleteSpEducation(${e.id})" title="Ta bort">&times;</button>
            </div>
        </div>`;
    }).join('');
}

async function saveSpEducation(id) {
    const body = {
        degree:         document.getElementById('sp-edit-edu-degree').value.trim(),
        institution:    document.getElementById('sp-edit-edu-institution').value.trim() || null,
        field_of_study: document.getElementById('sp-edit-edu-field').value.trim()       || null,
        start_date:     document.getElementById('sp-edit-edu-start').value.trim()       || null,
        end_date:       document.getElementById('sp-edit-edu-end').value.trim()         || null,
        description:    document.getElementById('sp-edit-edu-desc').value.trim()        || null,
    };
    if (!body.degree) { showSpEduStatus('Examen / Utbildning krävs', 'error'); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/education/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        spEditingEduId = null;
        showSpEduStatus('Utbildning sparad', 'success');
        await loadSpEducation();
    } catch (err) { showSpEduStatus(err.message, 'error'); }
}

async function addSpEducation() {
    const degree = document.getElementById('sp-edu-degree').value.trim();
    if (!degree) { showSpEduStatus('Examen / Utbildning krävs', 'error'); return; }
    const body = {
        degree,
        institution:    document.getElementById('sp-edu-institution').value.trim() || null,
        field_of_study: document.getElementById('sp-edu-field').value.trim()       || null,
        start_date:     document.getElementById('sp-edu-start').value.trim()       || null,
        end_date:       document.getElementById('sp-edu-end').value.trim()         || null,
    };
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/education`, {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        ['sp-edu-degree','sp-edu-institution','sp-edu-field','sp-edu-start','sp-edu-end']
            .forEach(id => document.getElementById(id).value = '');
        showSpEduStatus('Utbildning tillagd', 'success');
        await loadSpEducation();
    } catch (err) { showSpEduStatus(err.message, 'error'); }
}

async function deleteSpEducation(id) {
    if (!confirm('Ta bort utbildningen?')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/education/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadSpEducation();
    } catch (err) { alert(err.message); }
}

function showSpEduStatus(msg, type) {
    const el = document.getElementById('sp-edu-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

async function clearSpEducation() {
    if (!confirm('Radera all utbildning? Detta kan inte ångras.')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/education`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadSpEducation();
    } catch (err) { alert(err.message); }
}

// ── Certifieringar ─────────────────────────────────────────────────────────────

async function loadSpCertifications() {
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/certifications`);
        if (!res.ok) return;
        const data = await res.json();
        cachedSpCerts = data.certifications || [];
        spEditingCertId = null;
        renderSpCertifications(cachedSpCerts);
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function renderSpCertifications(items) {
    const container = document.getElementById('sp-certifications-list');
    if (!container) return;
    if (!items.length) {
        container.innerHTML = '<div class="empty-hint">Inga kurser eller certifikat tillagda ännu.</div>';
        return;
    }
    const clearBarCert = `<div class="list-clear-bar"><span>${items.length} certifikat</span><button class="btn btn-danger btn-sm" onclick="clearSpCertifications()">Rensa alla</button></div>`;
    container.innerHTML = clearBarCert + items.map(c => {
        if (c.id === spEditingCertId) {
            return `<div style="border:1px solid var(--blue);border-radius:var(--radius);padding:0.875rem 1rem;margin-bottom:0.75rem">
                <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.5rem">
                    <input class="form-input" id="sp-edit-cert-name"   value="${esc(c.name)}"        placeholder="Kurs / Certifikat" required>
                    <input class="form-input" id="sp-edit-cert-issuer" value="${esc(c.issuer)}"       placeholder="Utfärdare">
                    <input class="form-input" id="sp-edit-cert-date"   value="${esc(c.date)}"         placeholder="Datum (ÅÅÅÅ-MM)">
                    <textarea class="form-input" id="sp-edit-cert-desc" placeholder="Beskrivning" rows="2">${esc(c.description)}</textarea>
                </div>
                <div style="display:flex;gap:0.5rem">
                    <button class="btn btn-primary btn-small" onclick="saveSpCertification(${c.id})">Spara</button>
                    <button class="btn btn-secondary btn-small" onclick="spEditingCertId=null;renderSpCertifications(cachedSpCerts)">Avbryt</button>
                </div>
            </div>`;
        }
        return `<div class="edu-card">
            <div>
                <div class="edu-card-title">${esc(c.name)}</div>
                ${c.issuer ? `<div class="edu-card-sub">${esc(c.issuer)}</div>` : ''}
                ${c.date   ? `<div class="edu-card-period">${c.date}</div>` : ''}
            </div>
            <div class="exp-card-actions">
                <button class="btn-icon" onclick="spEditingCertId=${c.id};renderSpCertifications(cachedSpCerts)" title="Redigera">✎</button>
                <button class="btn-icon btn-icon-danger" onclick="deleteSpCertification(${c.id})" title="Ta bort">&times;</button>
            </div>
        </div>`;
    }).join('');
}

async function saveSpCertification(id) {
    const body = {
        name:        document.getElementById('sp-edit-cert-name').value.trim(),
        issuer:      document.getElementById('sp-edit-cert-issuer').value.trim() || null,
        date:        document.getElementById('sp-edit-cert-date').value.trim()   || null,
        description: document.getElementById('sp-edit-cert-desc').value.trim()  || null,
    };
    if (!body.name) { showSpCertStatus('Namn krävs', 'error'); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/certifications/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        spEditingCertId = null;
        showSpCertStatus('Certifikat sparat', 'success');
        await loadSpCertifications();
    } catch (err) { showSpCertStatus(err.message, 'error'); }
}

async function addSpCertification() {
    const name = document.getElementById('sp-cert-name').value.trim();
    if (!name) { showSpCertStatus('Namn krävs', 'error'); return; }
    const body = {
        name,
        issuer: document.getElementById('sp-cert-issuer').value.trim() || null,
        date:   document.getElementById('sp-cert-date').value.trim()   || null,
    };
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/certifications`, {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        ['sp-cert-name','sp-cert-issuer','sp-cert-date'].forEach(id => document.getElementById(id).value = '');
        showSpCertStatus('Certifikat tillagt', 'success');
        await loadSpCertifications();
    } catch (err) { showSpCertStatus(err.message, 'error'); }
}

async function deleteSpCertification(id) {
    if (!confirm('Ta bort certifikatet?')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/certifications/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadSpCertifications();
    } catch (err) { alert(err.message); }
}

function showSpCertStatus(msg, type) {
    const el = document.getElementById('sp-cert-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

async function clearSpCertifications() {
    if (!confirm('Radera alla certifikat? Detta kan inte ångras.')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/certifications`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadSpCertifications();
    } catch (err) { alert(err.message); }
}

// ── CV-tab (ny kandidat-CV-API) ────────────────────────────────────────────────

let spCandidateCVs = [];

async function loadSpCandidateCVs() {
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/cvs/`);
        if (!res.ok) return;
        spCandidateCVs = await res.json();
        displaySpCandidateCVs(spCandidateCVs);
        // Keep dashboard CV counter in sync (new system)
        const dashCvCount = document.getElementById('dash-cv-count');
        if (dashCvCount) dashCvCount.textContent = spCandidateCVs.length;
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function displaySpCandidateCVs(cvs) {
    const container = document.getElementById('sp-cv-list');
    if (!container) return;
    if (!cvs.length) {
        container.innerHTML = '<div class="empty-hint">Inga CV:n uppladdade än</div>';
        return;
    }
    container.innerHTML = cvs.map(cv => {
        const date = cv.upload_date
            ? new Date(cv.upload_date).toLocaleDateString('sv-SE', { year:'numeric', month:'short', day:'numeric' })
            : '—';
        const processedBadge  = cv.is_processed
            ? '<span class="cv-badge cv-badge--green">✓ Behandlad</span>'
            : '<span class="cv-badge cv-badge--blue">Ej behandlad</span>';
        const vectorizedBadge = cv.is_vectorized
            ? '<span class="cv-badge cv-badge--green">✓ Vektoriserad</span>'
            : '';
        return `
            <div class="cv-item" onclick="openSpCVDetail(${cv.id})" style="cursor:pointer">
                <div class="cv-item-header">
                    <div class="cv-item-info">
                        <h3>${cv.filename}</h3>
                        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.25rem">
                            ${processedBadge}${vectorizedBadge}
                        </div>
                    </div>
                </div>
                <div class="cv-item-details">
                    <div class="cv-item-detail">📅 ${date}</div>
                    <div class="cv-item-detail">🎯 ${cv.skill_count} kompetenser</div>
                    <div class="cv-item-detail">💼 ${cv.experience_count} erfarenheter</div>
                    <div class="cv-item-detail">🎓 ${cv.education_count} utbildningar</div>
                    <div class="cv-item-detail">📜 ${cv.certification_count} certifikat</div>
                </div>
            </div>`;
    }).join('');
}

function openSpCVDetail(cvId) {
    const cv = spCandidateCVs.find(c => c.id === cvId);
    if (!cv) return;
    const detail = document.getElementById('sp-cv-detail');
    const title  = document.getElementById('sp-cv-detail-title');
    const body   = document.getElementById('sp-cv-detail-body');
    if (!detail) return;
    title.textContent = cv.filename;
    const date = cv.upload_date
        ? new Date(cv.upload_date).toLocaleDateString('sv-SE', { year:'numeric', month:'long', day:'numeric' })
        : '—';
    body.innerHTML = `
        <div class="cv-detail-stats">
            <div class="cv-detail-stat"><strong>${cv.skill_count}</strong><span>Kompetenser</span></div>
            <div class="cv-detail-stat"><strong>${cv.experience_count}</strong><span>Erfarenheter</span></div>
            <div class="cv-detail-stat"><strong>${cv.education_count}</strong><span>Utbildningar</span></div>
            <div class="cv-detail-stat"><strong>${cv.certification_count}</strong><span>Certifikat</span></div>
        </div>
        <div style="margin-bottom:1rem;color:var(--text-muted);font-size:0.875rem">Uppladdad: ${date}</div>
        <div id="sp-cv-action-status"></div>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
            ${!cv.is_vectorized && cv.is_processed
                ? `<button class="btn btn-primary" onclick="vectorizeSpCV(${cv.id})">⚡ Vektorisera</button>`
                : ''}
            <a class="btn btn-secondary" href="${API_BASE_URL}/competence/cvs/${cv.id}/file" target="_blank">⬇ Ladda ner PDF</a>
            <button class="btn btn-danger btn-sm" onclick="deleteSpCV(${cv.id}, '${cv.filename.replace(/'/g, "\\'")}')">🗑 Ta bort</button>
        </div>`;
    detail.style.display = '';
    detail.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function closeSpCVDetail() {
    const detail = document.getElementById('sp-cv-detail');
    if (detail) detail.style.display = 'none';
}

async function vectorizeSpCV(cvId) {
    const statusEl = document.getElementById('sp-cv-action-status');
    if (statusEl) { statusEl.className = 'status-message status-loading'; statusEl.textContent = '⏳ Vektoriserar...'; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/cvs/${cvId}/vectorize`, { method:'POST' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadSpCandidateCVs();
        loadBankData();
        closeSpCVDetail();
    } catch (err) {
        if (statusEl) { statusEl.className = 'status-message status-error'; statusEl.textContent = `❌ ${err.message}`; }
    }
}

async function deleteSpCV(cvId, filename) {
    if (!confirm(`Ta bort "${filename}"? Kompetenser och utbildningar kopplade enbart till detta CV tas också bort.`)) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/cvs/${cvId}`, { method:'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        closeSpCVDetail();
        await loadSpCandidateCVs();
    } catch (err) {
        alert(`❌ ${err.message}`);
    }
}
