// ════════════════════════════════════════════════════
// SÖKPROFIL / MIN PROFIL (sp-* prefix)
// ════════════════════════════════════════════════════

let spSelectedExpIds = new Set();
let _spQualities     = [];

// ── Timestamps (own profile) ──────────────────────────────────────────────────

function _showSpTimestamps(kandidat) {
    const el = document.getElementById('sp-timestamps');
    if (!el) return;
    if (!kandidat) { el.classList.add('hidden'); return; }
    el.innerHTML =
        `<span>${t('kand.created_at')} ${_fmtSpDateTime(kandidat.created_at)}</span>` +
        `<span>${t('kand.updated_at')} ${_fmtSpDateTime(kandidat.updated_at)}</span>`;
    el.classList.remove('hidden');
}

function _fmtSpDateTime(iso) {
    if (!iso) return '–';
    return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });
}

async function touchOwnKandidat() {
    try {
        const own = await cvDb.kandidater.getOwn();
        if (!own) return;
        await cvDb.kandidater.update(own.id, {});
        const fresh = await cvDb.kandidater.get(own.id);
        _showSpTimestamps(fresh);
    } catch { /* silent */ }
}

async function loadSokprofil() {
    try {
        const own = await cvDb.kandidater.getOwn();
        if (!own) return;

        document.getElementById('sp-email').value        = own.email        || '';
        document.getElementById('sp-public-name').value  = own.public_name  || '';
        document.getElementById('sp-public-phone').value = own.public_phone || '';
        document.getElementById('sp-roles').value          = own.roles          || '';
        document.getElementById('sp-unwanted-roles').value = own.unwanted_roles || '';
        document.getElementById('sp-city').value         = own.desired_city || '';

        ['sp-emp-heltid', 'sp-emp-deltid', 'sp-emp-timmar', 'sp-emp-fast', 'sp-emp-konsult'].forEach(id => {
            const el = document.getElementById(id);
            el.checked = (own.desired_employment || []).includes(el.value);
        });
        document.querySelectorAll('.sp-domain-desired').forEach(el => {
            el.checked = (own.desired_domains || []).includes(el.value);
        });
        document.querySelectorAll('.sp-domain-unwanted').forEach(el => {
            el.checked = (own.unwanted_domains || []).includes(el.value);
        });

        ['sp-wp-plats', 'sp-wp-hybrid', 'sp-wp-distans'].forEach(id => {
            const el = document.getElementById(id);
            el.checked = (own.desired_workplace || []).includes(el.value);
        });

        _spQualities = Array.isArray(own.personal_qualities) ? [...own.personal_qualities] : [];
        renderSpQualities();
        document.getElementById('sp-commute').checked      = own.willing_to_commute || false;
        document.getElementById('sp-searchable').checked   = own.searchable         || false;
        document.getElementById('sp-available-from').value = own.available_from     || '';
        document.getElementById('sp-profile-uuid').value   = own.profile_uuid       || '';
        _showSpTimestamps(own);
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

    const desired_domains = Array.from(document.querySelectorAll('.sp-domain-desired:checked'))
        .map(el => el.value);
    const unwanted_domains = Array.from(document.querySelectorAll('.sp-domain-unwanted:checked'))
        .map(el => el.value);

    try {
        const ownId = await _getOwnKandidatId();
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${ownId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email:              document.getElementById('sp-email').value.trim()         || null,
                public_name:        document.getElementById('sp-public-name').value.trim()  || null,
                public_phone:       document.getElementById('sp-public-phone').value.trim() || null,
                roles:              document.getElementById('sp-roles').value.trim()          || null,
                unwanted_roles:     document.getElementById('sp-unwanted-roles').value.trim() || null,
                desired_city:       document.getElementById('sp-city').value.trim()          || null,
                desired_employment,
                desired_workplace,
                desired_domains,
                unwanted_domains,
                personal_qualities:  [..._spQualities],
                willing_to_commute: document.getElementById('sp-commute').checked,
                searchable:         document.getElementById('sp-searchable').checked,
                available_from:     document.getElementById('sp-available-from').value || null,
            }),
        });
        if (!res.ok) throw new Error('Kunde inte spara');
        const saved = await res.json();
        if (saved.profile_uuid) document.getElementById('sp-profile-uuid').value = saved.profile_uuid;
        showSokprofilStatus(t('sp.saved'), 'success');
        touchOwnKandidat();
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
    ['basinfo', 'kompetenser', 'erfarenheter', 'utbildning', 'certifikat', 'cv', 'portratt'].forEach(t => {
        document.getElementById(`sp-tab-${t}`).style.display       = t === tab ? '' : 'none';
        document.getElementById(`sp-tab-btn-${t}`).classList.toggle('active', t === tab);
    });
    if (tab === 'kompetenser')  loadSpKompetenser();
    if (tab === 'erfarenheter') loadSpErfarenheter();
    if (tab === 'utbildning')   loadSpEducation();
    if (tab === 'certifikat')   loadSpCertifications();
    if (tab === 'cv')           { setupSpCVUpload(); loadSpCandidateCVs(); }
    if (tab === 'portratt')     loadSpPortrait();
}

async function loadSpPortrait() {
    const own = await cvDb.kandidater.getOwn().catch(() => null);
    const ta = document.getElementById('sp-portrait-text');
    if (ta) ta.value = own?.portrait || '';
}

async function generateSpPortrait() {
    const btn = document.getElementById('sp-portrait-gen-btn');
    const status = document.getElementById('sp-portrait-status');
    if (btn) { btn.disabled = true; btn.textContent = t('portrait.generating'); }
    try {
        const own = await cvDb.kandidater.getOwn();
        if (!own) throw new Error('Ingen profil hittades');
        const portrait = await _generateKandidatPortrait(own.id);
        const ta = document.getElementById('sp-portrait-text');
        if (ta) ta.value = portrait;
        if (status) status.textContent = t('portrait.saved');
    } catch (err) {
        if (status) status.textContent = err.message || t('sp.error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = t('portrait.generate_btn'); }
    }
}

async function saveSpPortrait() {
    const own = await cvDb.kandidater.getOwn().catch(() => null);
    if (!own) return;
    const ta = document.getElementById('sp-portrait-text');
    if (!ta) return;
    await cvDb.kandidater.update(own.id, { portrait: ta.value }).catch(() => {});
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

// ── Personliga egenskaper (sökprofil) ────────────────────────────────────────

function renderSpQualities() {
    const container = document.getElementById('sp-qualities-pills');
    if (!container) return;
    if (_spQualities.length === 0) {
        container.innerHTML = `<span class="empty-hint" style="padding:0;text-align:left">${t('qualities.empty')}</span>`;
        return;
    }
    container.innerHTML = _spQualities.map((q, i) => `
        <span class="bank-skill-chip chip-personal">
            ${esc(q)}
            <button class="chip-delete" onclick="removeSpQuality(${i})" title="Ta bort"><span class="material-icons">close</span></button>
        </span>
    `).join('');
}

async function _saveSpQualities() {
    const ownId = await _getOwnKandidatId();
    await apiFetch(`${API_BASE_URL}/kandidater/${ownId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personal_qualities: [..._spQualities] }),
    });
    touchOwnKandidat();
}

async function addSpQuality(name) {
    const trimmed = name.trim();
    if (!trimmed || _spQualities.includes(trimmed)) return;
    _spQualities.push(trimmed);
    renderSpQualities();
    await _saveSpQualities();
}

async function removeSpQuality(index) {
    _spQualities.splice(index, 1);
    renderSpQualities();
    await _saveSpQualities();
}

function handleSpQualityKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addSpQualityFromInput();
    }
}

async function addSpQualityFromInput() {
    const input = document.getElementById('sp-quality-input');
    if (!input) return;
    const val = input.value.trim();
    if (val) {
        await addSpQuality(val);
        input.value = '';
    }
}

async function addSpSkill() {
    const nameEl = document.getElementById('sp-skill-name');
    const catEl  = document.getElementById('sp-skill-category');
    const name   = nameEl.value.trim();
    if (!name) { showSpSkillStatus(t('sp.skill_name_required'), 'error'); return; }

    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/skills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                skill_name:  name,
                category:    catEl.value.trim() || 'Övrigt',
                skill_level: document.getElementById('sp-skill-level').value || null,
            }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        nameEl.value = '';
        catEl.value  = '';
        document.getElementById('sp-skill-level').value = '';
        showSpSkillStatus(t('sp.skill_added'), 'success');
        await loadSpKompetenser();
        touchOwnKandidat();
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
        container.innerHTML = `<div class="empty-hint">${t('sp.no_skills')}</div>`;
        return;
    }
    const byCategory = {};
    skills.forEach(s => {
        const cat = s.category || 'Övrigt';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(s);
    });
    const clearBarSkills = `<div class="list-clear-bar"><span>${skills.length} ${skills.length !== 1 ? t('sp.skill_plural') : t('sp.skill_singular')}</span><button class="btn btn-danger btn-sm" onclick="clearSpSkills()">${t('sp.clear_all')}</button></div>`;
    const sortedEntries = Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b, currentLang));
    container.innerHTML = clearBarSkills + sortedEntries.map(([cat, items]) => { items = items.slice().sort((a, b) => a.skill_name.localeCompare(b.skill_name, currentLang)); return `
        <div style="margin-bottom:1rem">
            <div style="font-size:0.8125rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;
                        letter-spacing:0.05em;margin-bottom:0.5rem">${cat}</div>
            <div class="bank-skills-wrap skill-drop-zone" data-cat-drop-zone="${esc(cat)}">
                ${items.map(s => {
                    if (s.id === spEditingSkillId) {
                        return `<div class="skill-edit-row">
                            <input class="form-input" id="sp-edit-skill-name" value="${esc(s.skill_name)}" placeholder="${t('bank.label_skill')}" style="flex:1;min-width:120px">
                            <input class="form-input" id="sp-edit-skill-cat"  value="${esc(s.category)}"   placeholder="${t('bank.label_category')}" style="flex:1;min-width:100px" data-cat-combo>
                            <select class="form-input" id="sp-edit-skill-level" style="min-width:130px">
                                <option value=""               ${!s.skill_level                    ?'selected':''}>${t('skill.level_ph')}</option>
                                <option value="Känner till"    ${s.skill_level==='Känner till'    ?'selected':''}>${t('skill.level_1')}</option>
                                <option value="Erfaren"        ${s.skill_level==='Erfaren'        ?'selected':''}>${t('skill.level_2')}</option>
                                <option value="Mycket erfaren" ${s.skill_level==='Mycket erfaren' ?'selected':''}>${t('skill.level_3')}</option>
                            </select>
                            <button class="btn btn-primary btn-small" onclick="saveSpSkill(${s.id})">${t('common.save')}</button>
                            <button class="btn btn-secondary btn-small" onclick="spEditingSkillId=null;renderSpSkills(cachedSpSkills)">${t('common.cancel')}</button>
                        </div>`;
                    }
                    return `<span class="bank-skill-chip ${skillLevelClass(s.skill_level)}" draggable="true" data-skill-id="${s.id}" data-skill-cat="${esc(cat)}">
                        ${esc(s.skill_name)}
                        <button class="chip-delete" style="font-size:0.85em;padding:0 1px 0 3px" onclick="spEditingSkillId=${s.id};renderSpSkills(cachedSpSkills)" title="${t('action.edit')}"><span class="material-icons">edit</span></button>
                        <button class="chip-delete" onclick="deleteSpSkill(${s.id})" title="${t('action.delete')}"><span class="material-icons">close</span></button>
                    </span>`;
                }).join('')}
            </div>
        </div>
    `; }).join('');
    setupSkillDragDrop(container, async (skillId, newCat) => {
        const skill = cachedSpSkills.find(s => s.id === skillId);
        if (!skill) return;
        await apiFetch(`${API_BASE_URL}/competence/skills/${skillId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skill_name: skill.skill_name, category: newCat, skill_level: skill.skill_level }),
        });
        await loadSpKompetenser();
    });
}

async function saveSpSkill(id) {
    const body = {
        skill_name: document.getElementById('sp-edit-skill-name').value.trim(),
        category:   document.getElementById('sp-edit-skill-cat').value.trim()  || 'Övrigt',
        skill_level: document.getElementById('sp-edit-skill-level').value || null,
    };
    if (!body.skill_name) { alert(t('sp.skill_name_required2')); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/skills/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        spEditingSkillId = null;
        await loadSpKompetenser();
        touchOwnKandidat();
    } catch (err) { alert(err.message); }
}

async function deleteSpSkill(id) {
    if (!confirm(t('sp.confirm_delete_skill'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/skills/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadSpKompetenser();
        touchOwnKandidat();
    } catch (err) { alert(err.message); }
}

async function clearSpSkills() {
    if (!confirm(t('sp.confirm_clear_skills'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/skills`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadSpKompetenser();
        touchOwnKandidat();
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
        container.innerHTML = `<div class="empty-hint">${t('sp.no_exps')}</div>`;
        return;
    }
    experiences = experiences.slice().sort((a, b) => {
        const sa = normDate(a.start_date) || '', sb = normDate(b.start_date) || '';
        if (sa !== sb) return sb.localeCompare(sa);
        const ea = a.is_current ? '9999-99' : (normDate(a.end_date) || '');
        const eb = b.is_current ? '9999-99' : (normDate(b.end_date) || '');
        return eb.localeCompare(ea);
    });
    const typeLabel = { work: t('sp.type_work'), education: t('bank.type_opt_edu'), certification: t('bank.type_opt_cert'), project: t('sp.type_project') };
    const sel = (val, opt) => opt === val ? 'selected' : '';
    const mergeBar = `
        <div class="bank-merge-bar ${spSelectedExpIds.size >= 2 ? 'visible' : ''}" id="sp-merge-bar">
            <span>${spSelectedExpIds.size} ${t('bank.selected')}</span>
            <button class="btn btn-primary btn-small" onclick="mergeSpExperiences()"
                    ${spSelectedExpIds.size < 2 ? 'disabled' : ''}>${t('bank.merge_selected')}</button>
            <button class="btn btn-ghost btn-small" onclick="spSelectedExpIds.clear();renderSpExperiences(cachedSpExps)">${t('bank.deselect')}</button>
        </div>`;
    const clearBarExp = `<div class="list-clear-bar"><span>${experiences.length} ${experiences.length !== 1 ? t('sp.exp_plural') : t('sp.exp_singular')}</span><button class="btn btn-danger btn-sm" onclick="clearSpExperiences()">${t('sp.clear_all')}</button></div>`;
    container.innerHTML = mergeBar + clearBarExp + experiences.map(e => {
        if (e.id === spEditingExpId) {
            const achText = (e.achievements || []).join('\n');
            return `<div style="border:1px solid var(--blue);border-radius:var(--radius);padding:0.875rem 1rem;margin-bottom:0.75rem">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem">
                    <input class="form-input" id="sp-edit-exp-title" value="${esc(e.title)}" placeholder="Titel" style="grid-column:span 2">
                    <input class="form-input" id="sp-edit-exp-org"   value="${esc(e.organization)}" placeholder="Organisation">
                    <select class="form-input" id="sp-edit-exp-type">
                        <option value="work"    ${sel(e.experience_type,'work')}   >${t('sp.type_work')}</option>
                        <option value="project" ${sel(e.experience_type,'project')}>${t('sp.type_project')}</option>
                    </select>
                    <input class="form-input" id="sp-edit-exp-start" value="${esc(e.start_date)}" placeholder="Från (ÅÅÅÅ-MM)">
                    <input class="form-input" id="sp-edit-exp-end"   value="${esc(e.end_date)}"   placeholder="Till (ÅÅÅÅ-MM)">
                </div>
                <label style="font-size:0.8125rem;display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem">
                    <input type="checkbox" id="sp-edit-exp-current" ${e.is_current?'checked':''}> ${t('sp.ongoing')}
                </label>
                <textarea class="form-input" id="sp-edit-exp-desc" placeholder="${t('bank.label_desc')}" rows="3" style="margin-bottom:0.5rem;width:100%;box-sizing:border-box">${esc(e.description)}</textarea>
                <label style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.25rem;display:block">${t('sp.achievements_label')}</label>
                <textarea class="form-input" id="sp-edit-exp-ach" placeholder="${t('bank.new_ach_ph')}" rows="3" style="margin-bottom:0.5rem;width:100%;box-sizing:border-box">${esc(achText)}</textarea>
                <div style="display:flex;gap:0.5rem">
                    <button class="btn btn-primary btn-small" onclick="saveSpExperience(${e.id})">${t('common.save')}</button>
                    <button class="btn btn-secondary btn-small" onclick="spEditingExpId=null;renderSpExperiences(cachedSpExps)">${t('common.cancel')}</button>
                </div>
            </div>`;
        }
        const period = [normDate(e.start_date), e.is_current ? 'nu' : normDate(e.end_date)].filter(Boolean).join(' – ');
        const achHtml = (e.achievements || []).length
            ? `<ul class="exp-card-ach">${(e.achievements).map(a=>`<li>${esc(a)}</li>`).join('')}</ul>` : '';
        const checked = spSelectedExpIds.has(e.id);
        return `<div class="exp-card ${checked ? 'exp-card--selected' : ''}">
            <div class="exp-card-header">
                <div style="display:flex;align-items:flex-start;gap:10px">
                    <label class="bank-exp-checkbox" style="margin-top:4px">
                        <input type="checkbox" ${checked ? 'checked' : ''}
                               onchange="spToggleExpSelection(${e.id})">
                        <span class="bank-exp-checkmark"></span>
                    </label>
                    <div>
                        <span class="exp-card-type">${typeLabel[e.experience_type]||e.experience_type}</span>
                        <div class="exp-card-title">${esc(e.title)}</div>
                        ${e.organization ? `<div class="exp-card-org">${esc(e.organization)}</div>` : ''}
                        ${period ? `<div class="exp-card-period">${period}</div>` : ''}
                    </div>
                </div>
                <div class="exp-card-actions">
                    <button class="btn-icon" onclick="spEditingExpId=${e.id};renderSpExperiences(cachedSpExps)" title="${t('action.edit')}"><span class="material-icons">edit</span></button>
                    <button class="btn-icon btn-icon-danger" onclick="deleteSpExperience(${e.id})" title="${t('action.delete')}"><span class="material-icons">delete</span></button>
                </div>
            </div>
            ${e.description ? `<div class="exp-card-desc">${esc(e.description)}</div>` : ''}
            ${achHtml}
        </div>`;
    }).join('');
}

function spToggleExpSelection(id) {
    if (spSelectedExpIds.has(id)) {
        spSelectedExpIds.delete(id);
    } else {
        spSelectedExpIds.add(id);
    }
    renderSpExperiences(cachedSpExps);
}

async function mergeSpExperiences() {
    if (spSelectedExpIds.size < 2) return;
    const ids = Array.from(spSelectedExpIds);

    const mergeBar = document.getElementById('sp-merge-bar');
    if (mergeBar) mergeBar.innerHTML = `<span class="spinner-small"></span> ${t('sp.merge_ai')}`;

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
        spSelectedExpIds.clear();
        await loadSpErfarenheter();
        alert(`✅ ${data.merged_count} ${t('sp.exp_plural')} → "${data.title}"`);
    } catch (err) {
        alert('❌ ' + err.message);
        renderSpExperiences(cachedSpExps);
    }
}

async function saveSpExperience(id) {
    const body = {
        title:           document.getElementById('sp-edit-exp-title').value.trim(),
        organization:    document.getElementById('sp-edit-exp-org').value.trim()   || null,
        experience_type: document.getElementById('sp-edit-exp-type').value,
        start_date:      normDate(document.getElementById('sp-edit-exp-start').value.trim()),
        end_date:        normDate(document.getElementById('sp-edit-exp-end').value.trim()),
        is_current:      document.getElementById('sp-edit-exp-current').checked,
        description:     document.getElementById('sp-edit-exp-desc').value.trim() || null,
        achievements:    document.getElementById('sp-edit-exp-ach').value.split('\n').map(s=>s.trim()).filter(Boolean),
    };
    if (!body.title) { alert(t('sp.title_required')); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        spEditingExpId = null;
        await loadSpErfarenheter();
        touchOwnKandidat();
    } catch (err) { alert(err.message); }
}

async function deleteSpExperience(id) {
    if (!confirm(t('sp.confirm_delete_exp'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadSpErfarenheter();
        touchOwnKandidat();
    } catch (err) { alert(err.message); }
}

async function clearSpExperiences() {
    if (!confirm(t('sp.confirm_clear_exps'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadSpErfarenheter();
        touchOwnKandidat();
    } catch (err) { alert(err.message); }
}

async function addSpExperience() {
    const title = document.getElementById('sp-exp-title').value.trim();
    if (!title) { showSpExpStatus(t('sp.title_required'), 'error'); return; }
    const body = {
        title,
        organization:    document.getElementById('sp-exp-org').value.trim()   || null,
        experience_type: document.getElementById('sp-exp-type').value,
        start_date:      normDate(document.getElementById('sp-exp-start').value.trim()),
        end_date:        normDate(document.getElementById('sp-exp-end').value.trim()),
        is_current:      document.getElementById('sp-exp-current').checked,
        description:     document.getElementById('sp-exp-desc').value.trim() || null,
        achievements:    document.getElementById('sp-exp-ach').value.split('\n').map(s => s.trim()).filter(Boolean),
    };
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/experiences`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        ['sp-exp-title','sp-exp-org','sp-exp-start','sp-exp-end','sp-exp-desc','sp-exp-ach'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('sp-exp-current').checked = false;
        showSpExpStatus(t('sp.exp_added'), 'success');
        await loadSpErfarenheter();
        touchOwnKandidat();
    } catch (err) { showSpExpStatus(err.message, 'error'); }
}

function showSpExpStatus(msg, type) {
    const el = document.getElementById('sp-exp-status');
    if (!el) return;
    el.textContent = msg;
    el.className = type === 'error' ? 'form-error' : 'form-success';
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 3000);
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
        container.innerHTML = `<div class="empty-hint">${t('sp.no_edu')}</div>`;
        return;
    }
    const clearBarEdu = `<div class="list-clear-bar"><span>${items.length} ${items.length !== 1 ? t('sp.edu_plural') : t('sp.edu_singular')}</span><button class="btn btn-danger btn-sm" onclick="clearSpEducation()">${t('sp.clear_all')}</button></div>`;
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
                    <button class="btn btn-primary btn-small" onclick="saveSpEducation(${e.id})">${t('common.save')}</button>
                    <button class="btn btn-secondary btn-small" onclick="spEditingEduId=null;renderSpEducation(cachedSpEdu)">${t('common.cancel')}</button>
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
                <button class="btn-icon" onclick="spEditingEduId=${e.id};renderSpEducation(cachedSpEdu)" title="${t('action.edit')}"><span class="material-icons">edit</span></button>
                <button class="btn-icon btn-icon-danger" onclick="deleteSpEducation(${e.id})" title="${t('action.delete')}"><span class="material-icons">delete</span></button>
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
    if (!body.degree) { showSpEduStatus(t('sp.degree_required'), 'error'); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/education/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        spEditingEduId = null;
        showSpEduStatus(t('sp.edu_saved'), 'success');
        await loadSpEducation();
        touchOwnKandidat();
    } catch (err) { showSpEduStatus(err.message, 'error'); }
}

async function addSpEducation() {
    const degree = document.getElementById('sp-edu-degree').value.trim();
    if (!degree) { showSpEduStatus(t('sp.degree_required'), 'error'); return; }
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
        showSpEduStatus(t('sp.edu_added'), 'success');
        await loadSpEducation();
        touchOwnKandidat();
    } catch (err) { showSpEduStatus(err.message, 'error'); }
}

async function deleteSpEducation(id) {
    if (!confirm(t('sp.confirm_delete_edu'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/education/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadSpEducation();
        touchOwnKandidat();
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
    if (!confirm(t('sp.confirm_clear_edu'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/education`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadSpEducation();
        touchOwnKandidat();
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
        container.innerHTML = `<div class="empty-hint">${t('sp.no_cert')}</div>`;
        return;
    }
    const clearBarCert = `<div class="list-clear-bar"><span>${items.length} ${t('sp.cert_word')}</span><button class="btn btn-danger btn-sm" onclick="clearSpCertifications()">${t('sp.clear_all')}</button></div>`;
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
                    <button class="btn btn-primary btn-small" onclick="saveSpCertification(${c.id})">${t('common.save')}</button>
                    <button class="btn btn-secondary btn-small" onclick="spEditingCertId=null;renderSpCertifications(cachedSpCerts)">${t('common.cancel')}</button>
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
                <button class="btn-icon" onclick="spEditingCertId=${c.id};renderSpCertifications(cachedSpCerts)" title="${t('action.edit')}"><span class="material-icons">edit</span></button>
                <button class="btn-icon btn-icon-danger" onclick="deleteSpCertification(${c.id})" title="${t('action.delete')}"><span class="material-icons">delete</span></button>
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
    if (!body.name) { showSpCertStatus(t('sp.cert_name_required'), 'error'); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/certifications/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        spEditingCertId = null;
        showSpCertStatus(t('sp.cert_saved'), 'success');
        await loadSpCertifications();
        touchOwnKandidat();
    } catch (err) { showSpCertStatus(err.message, 'error'); }
}

async function addSpCertification() {
    const name = document.getElementById('sp-cert-name').value.trim();
    if (!name) { showSpCertStatus(t('sp.cert_name_required'), 'error'); return; }
    const body = {
        name,
        issuer:      document.getElementById('sp-cert-issuer').value.trim() || null,
        date:        document.getElementById('sp-cert-date').value.trim()   || null,
        description: document.getElementById('sp-cert-desc').value.trim()  || null,
    };
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/certifications`, {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        ['sp-cert-name','sp-cert-issuer','sp-cert-date','sp-cert-desc'].forEach(id => document.getElementById(id).value = '');
        showSpCertStatus(t('sp.cert_added'), 'success');
        await loadSpCertifications();
        touchOwnKandidat();
    } catch (err) { showSpCertStatus(err.message, 'error'); }
}

async function deleteSpCertification(id) {
    if (!confirm(t('sp.confirm_delete_cert'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/certifications/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadSpCertifications();
        touchOwnKandidat();
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
    if (!confirm(t('sp.confirm_clear_certs'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/certifications`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadSpCertifications();
        touchOwnKandidat();
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
        container.innerHTML = `<div class="empty-hint">${t('cv.no_cvs')}</div>`;
        return;
    }
    container.innerHTML = cvs.map(cv => {
        const date = cv.upload_date
            ? new Date(cv.upload_date).toLocaleDateString('sv-SE', { year:'numeric', month:'short', day:'numeric' })
            : '—';
        const processedBadge = cv.is_processed
            ? `<span class="cv-badge cv-badge--green">${t('cv.badge_processed')}</span>`
            : `<span class="cv-badge cv-badge--blue">${t('cv.badge_unprocessed')}</span>`;
        const safeName = cv.filename.replace(/'/g, "\\'");
        return `
            <div class="cv-item">
                <div class="cv-item-header">
                    <div class="cv-item-info">
                        <h3>${cv.filename}</h3>
                        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.25rem">
                            ${processedBadge}
                        </div>
                    </div>
                    <div style="display:flex;gap:0.5rem;align-items:center;margin-left:auto">
                        <button class="btn btn-secondary btn-sm" onclick="downloadCVFile(${cv.id})">${t('cv.download')}</button>
                        <button class="btn btn-icon btn-danger btn-sm" title="${t('cv.btn_delete')}" onclick="deleteSpCV(${cv.id}, '${safeName}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                    </div>
                </div>
                <div class="cv-item-details">
                    <div class="cv-item-detail"><span class="material-icons cv-detail-icon">calendar_today</span>${date}</div>
                    <div class="cv-item-detail"><span class="material-icons cv-detail-icon">psychology</span>${cv.skill_count} ${t('cv.section_skills').toLowerCase()}</div>
                    <div class="cv-item-detail"><span class="material-icons cv-detail-icon">work_history</span>${cv.experience_count} ${t('cv.section_experience').toLowerCase()}</div>
                    <div class="cv-item-detail"><span class="material-icons cv-detail-icon">school</span>${cv.education_count} ${t('cv.section_education').toLowerCase()}</div>
                    <div class="cv-item-detail"><span class="material-icons cv-detail-icon">workspace_premium</span>${cv.certification_count} ${t('cv.section_certifications').toLowerCase()}</div>
                </div>
            </div>`;
    }).join('');
}



async function deleteSpCV(cvId, filename) {
    if (!confirm(t('sp.confirm_delete_cv').replace('%n', filename))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/competence/cvs/${cvId}`, { method:'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadSpCandidateCVs();
        touchOwnKandidat();
    } catch (err) {
        alert(`❌ ${err.message}`);
    }
}
