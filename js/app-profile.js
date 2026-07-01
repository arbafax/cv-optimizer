// ════════════════════════════════════════════════════
// PROFIL — gemensam modul (egenprofil + kandidater)
// ════════════════════════════════════════════════════

let currentProfileId   = null;
let currentProfileType = null;
let profSelectedExpIds = new Set();
let _profQualities     = [];
let profUploadSetup    = false;
let profCandidateCVs   = [];
let profEditingSkillId = null;
let profEditingExpId   = null;
let profEditingEduId   = null;
let profEditingCertId  = null;
let cachedProfSkills   = [];
let cachedProfExps     = [];
let cachedProfEdu      = [];
let cachedProfCerts    = [];

function _profRoute(path) {
    if (currentProfileType === 'egenprofil') {
        const compPath = {
            'skills':         'competence/skills',
            'experiences':    'competence/experiences',
            'education':      'competence/education',
            'certifications': 'competence/certifications',
            'cvs':            'competence/cvs',
        }[path] || `competence/${path}`;
        return `${API_BASE_URL}/${compPath}`;
    }
    return `${API_BASE_URL}/kandidater/${currentProfileId}/${path}`;
}

function _profSkillRoute(skillId) {
    if (currentProfileType === 'egenprofil') {
        return skillId
            ? `${API_BASE_URL}/competence/skills/${skillId}`
            : `${API_BASE_URL}/competence/skills`;
    }
    return skillId
        ? `${API_BASE_URL}/kandidater/${currentProfileId}/bank/skills/${skillId}`
        : `${API_BASE_URL}/kandidater/${currentProfileId}/bank/skills`;
}

function _profExpRoute(expId) {
    if (currentProfileType === 'egenprofil') {
        return expId
            ? `${API_BASE_URL}/competence/experiences/${expId}`
            : `${API_BASE_URL}/competence/experiences`;
    }
    return expId
        ? `${API_BASE_URL}/kandidater/${currentProfileId}/bank/experiences/${expId}`
        : `${API_BASE_URL}/kandidater/${currentProfileId}/bank/experiences`;
}

function _fmtProfDateTime(iso) {
    if (!iso) return '–';
    return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });
}

function _showProfTimestamps(profil) {
    const el = document.getElementById('prof-timestamps');
    if (!el) return;
    if (!profil) { el.classList.add('hidden'); return; }
    el.innerHTML =
        `<span>${t('kand.created_at')} ${_fmtProfDateTime(profil.created_at)}</span>` +
        `<span>${t('kand.updated_at')} ${_fmtProfDateTime(profil.updated_at)}</span>`;
    el.classList.remove('hidden');
}

async function touchProfile() {
    if (!currentProfileId) return;
    try {
        await cvDb.kandidater.update(currentProfileId, {});
        const fresh = await cvDb.kandidater.get(currentProfileId);
        _showProfTimestamps(fresh);
        refreshProfilePublishStatus().catch(() => {});
    } catch { /* silent */ }
}

async function refreshProfilePublishStatus() {
    const row = document.getElementById('prof-publish-row');
    if (!row || !currentProfileId) { row?.classList.add('hidden'); return; }
    const kand = await cvDb.kandidater.get(currentProfileId).catch(() => null);
    if (!kand) { row.classList.add('hidden'); return; }
    row.classList.remove('hidden');

    const uuid  = kand.profile_uuid;
    const pubAt = uuid ? await cvDb.settings.get(`pub_at_${uuid}`).catch(() => null) : null;

    if (!pubAt) {
        _setProfilePublishUi('never', t('publish.never'), true);
        return;
    }
    const synced = new Date(pubAt) >= new Date(kand.updated_at);
    if (synced) {
        _setProfilePublishUi('synced', `${t('publish.synced')} ${_fmtProfDateTime(pubAt)}`, false);
    } else {
        _setProfilePublishUi('stale', t('publish.stale'), true);
    }
}

function _setProfilePublishUi(dotClass, tsText, btnEnabled) {
    const dot   = document.getElementById('prof-publish-dot');
    const ts    = document.getElementById('prof-publish-ts');
    const btn   = document.getElementById('prof-publish-btn');
    const unbtn = document.getElementById('prof-unpublish-btn');
    if (dot)   dot.className  = `publish-dot publish-dot--${dotClass}`;
    if (ts)    ts.textContent = tsText;
    if (btn)   btn.disabled   = !btnEnabled;
    if (unbtn) unbtn.disabled = dotClass === 'never';
}

async function publishProfile() {
    const btn = document.getElementById('prof-publish-btn');
    if (btn) { btn.disabled = true; btn.textContent = t('publish.publishing'); }
    try {
        let kand = await cvDb.kandidater.get(currentProfileId);
        if (!kand) throw new Error('Ingen profil hittades');
        if (!kand.portrait) {
            if (btn) btn.textContent = t('portrait.publish_generating');
            await _generateKandidatPortrait(currentProfileId);
            kand = await cvDb.kandidater.get(currentProfileId);
            const ta = document.getElementById('prof-portrait-text');
            if (ta) ta.value = kand?.portrait || '';
        } else {
            const pubAt = kand.profile_uuid
                ? await cvDb.settings.get(`pub_at_${kand.profile_uuid}`).catch(() => null)
                : null;
            const isStale = pubAt && new Date(pubAt) < new Date(kand.updated_at);
            if (isStale && confirm(t('portrait.confirm_update'))) {
                if (btn) btn.textContent = t('portrait.publish_generating');
                await _generateKandidatPortrait(currentProfileId);
                kand = await cvDb.kandidater.get(currentProfileId);
                const ta = document.getElementById('prof-portrait-text');
                if (ta) ta.value = kand?.portrait || '';
            }
        }
        const payload = await _buildKandidatPayload(currentProfileId);
        const uuid = await _backendPublish(kand.profile_uuid, payload);
        if (!kand.profile_uuid) {
            await cvDb.kandidater.update(currentProfileId, { profile_uuid: uuid });
            document.getElementById('prof-profile-uuid').value = uuid;
        }
        await cvDb.settings.set(`pub_at_${uuid}`, new Date().toISOString());
        showProfileStatus(t('publish.synced'), 'success');
    } catch (err) {
        showProfileStatus(err.message || t('publish.error'), 'error');
    } finally {
        if (btn) btn.textContent = t('publish.btn');
        refreshProfilePublishStatus().catch(() => {});
    }
}

async function unpublishProfile() {
    const unbtn = document.getElementById('prof-unpublish-btn');
    if (unbtn) { unbtn.disabled = true; unbtn.textContent = t('publish.unpublishing'); }
    try {
        const kand = await cvDb.kandidater.get(currentProfileId);
        if (!kand) throw new Error('Ingen profil hittades');
        await _backendUnpublish(kand.profile_uuid);
        if (kand.profile_uuid) {
            await cvDb.settings.set(`pub_at_${kand.profile_uuid}`, null);
            await cvDb.kandidater.update(currentProfileId, { profile_uuid: null });
            document.getElementById('prof-profile-uuid').value = '';
        }
        showProfileStatus(t('publish.never'), 'success');
    } catch (err) {
        showProfileStatus(err.message || t('publish.error'), 'error');
    } finally {
        if (unbtn) unbtn.textContent = t('publish.unpublish');
        refreshProfilePublishStatus().catch(() => {});
    }
}

async function loadProfile() {
    if (!currentProfileId) return;
    try {
        const kand = await cvDb.kandidater.get(currentProfileId);
        if (!kand) return;

        document.getElementById('prof-public-name').value  = kand.public_name  || '';
        document.getElementById('prof-email').value        = kand.email        || '';
        document.getElementById('prof-phone').value        = kand.public_phone || '';
        document.getElementById('prof-roles').value        = kand.roles        || '';
        document.getElementById('prof-city').value         = kand.desired_city || '';

        ['prof-emp-heltid', 'prof-emp-deltid', 'prof-emp-timmar', 'prof-emp-fast', 'prof-emp-konsult'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = (kand.desired_employment || []).includes(el.value);
        });

        ['prof-wp-plats', 'prof-wp-hybrid', 'prof-wp-distans'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = (kand.desired_workplace || []).includes(el.value);
        });

        _profQualities = Array.isArray(kand.personal_qualities) ? [...kand.personal_qualities] : [];
        renderProfQualities();

        const commuteEl = document.getElementById('prof-commute');
        if (commuteEl) commuteEl.checked = kand.willing_to_commute || false;

        const searchableEl = document.getElementById('prof-searchable');
        if (searchableEl) searchableEl.checked = kand.searchable || false;

        const availableEl = document.getElementById('prof-available-from');
        if (availableEl) availableEl.value = kand.available_from || '';

        const descEl = document.getElementById('prof-description');
        if (descEl) descEl.value = kand.description || '';

        const uuidEl = document.getElementById('prof-profile-uuid');
        if (uuidEl) uuidEl.value = kand.profile_uuid || '';

        _showProfTimestamps(kand);
        refreshProfilePublishStatus().catch(() => {});
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

async function saveProfile() {
    const public_name = document.getElementById('prof-public-name')?.value.trim();
    if (!public_name) {
        showProfileStatus(t('kand.name_required'), 'error');
        return;
    }

    const desired_employment = ['prof-emp-heltid', 'prof-emp-deltid', 'prof-emp-timmar', 'prof-emp-fast', 'prof-emp-konsult']
        .filter(id => document.getElementById(id)?.checked)
        .map(id => document.getElementById(id).value);

    const desired_workplace = ['prof-wp-plats', 'prof-wp-hybrid', 'prof-wp-distans']
        .filter(id => document.getElementById(id)?.checked)
        .map(id => document.getElementById(id).value);

    const body = {
        public_name,
        email:              document.getElementById('prof-email')?.value.trim()         || null,
        public_phone:       document.getElementById('prof-phone')?.value.trim()         || null,
        roles:              document.getElementById('prof-roles')?.value.trim()         || null,
        desired_city:       document.getElementById('prof-city')?.value.trim()          || null,
        desired_employment,
        desired_workplace,
        personal_qualities:  [..._profQualities],
        willing_to_commute: document.getElementById('prof-commute')?.checked || false,
        searchable:         document.getElementById('prof-searchable')?.checked || false,
        available_from:     document.getElementById('prof-available-from')?.value || null,
        description:        document.getElementById('prof-description')?.value.trim() || null,
    };

    try {
        const url    = currentProfileId
            ? `${API_BASE_URL}/kandidater/${currentProfileId}`
            : `${API_BASE_URL}/kandidater/`;
        const method = currentProfileId ? 'PUT' : 'POST';

        const res = await apiFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }

        const saved = await res.json();
        const isNew = !currentProfileId;
        currentProfileId = saved.id;

        const titleEl = document.getElementById('prof-form-title');
        if (titleEl) {
            titleEl.textContent = currentProfileType === 'egenprofil'
                ? t('profile.title_own')
                : t('profile.title_candidate');
        }

        const uuidEl = document.getElementById('prof-profile-uuid');
        if (uuidEl && saved.profile_uuid) uuidEl.value = saved.profile_uuid;

        ['prof-tab-btn-kompetenser', 'prof-tab-btn-erfarenheter',
         'prof-tab-btn-utbildning', 'prof-tab-btn-certifikat', 'prof-tab-btn-cv', 'prof-tab-btn-portratt']
            .forEach(id => { const el = document.getElementById(id); if (el) el.disabled = false; });

        if (isNew) loadDashKandidaterCount();
        showProfileStatus(t('profile.saved'), 'success');
        const fresh = await cvDb.kandidater.get(currentProfileId);
        _showProfTimestamps(fresh);
        refreshProfilePublishStatus().catch(() => {});
    } catch (err) {
        showProfileStatus(err.message, 'error');
    }
}

function autoSaveProfile() {
    if (!currentProfileId && !document.getElementById('prof-public-name')?.value.trim()) return;
    saveProfile();
}

function showProfileStatus(msg, type) {
    const el = document.getElementById('prof-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

function renderProfQualities() {
    const container = document.getElementById('prof-qualities-pills');
    if (!container) return;
    if (_profQualities.length === 0) {
        container.innerHTML = `<span class="empty-hint" style="padding:0;text-align:left">${t('qualities.empty')}</span>`;
        return;
    }
    container.innerHTML = _profQualities.map((q, i) => `
        <span class="bank-skill-chip chip-personal">
            ${esc(q)}
            <button class="chip-delete" onclick="removeProfQuality(${i})" title="Ta bort"><span class="material-icons" style="font-size:14px">close</span></button>
        </span>
    `).join('');
}

async function _saveProfQualities() {
    if (!currentProfileId) return;
    await apiFetch(`${API_BASE_URL}/kandidater/${currentProfileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personal_qualities: [..._profQualities] }),
    });
    touchProfile();
}

async function addProfQuality(name) {
    const trimmed = name.trim();
    if (!trimmed || _profQualities.includes(trimmed)) return;
    _profQualities.push(trimmed);
    renderProfQualities();
    await _saveProfQualities();
}

async function removeProfQuality(index) {
    _profQualities.splice(index, 1);
    renderProfQualities();
    await _saveProfQualities();
}

function handleProfQualityKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addProfQualityFromInput();
    }
}

async function addProfQualityFromInput() {
    const input = document.getElementById('prof-quality-input');
    if (!input) return;
    const val = input.value.trim();
    if (val) {
        await addProfQuality(val);
        input.value = '';
    }
}

function switchProfileTab(tab) {
    ['basinfo', 'kompetenser', 'erfarenheter', 'utbildning', 'certifikat', 'cv', 'portratt'].forEach(t => {
        const tabEl = document.getElementById(`prof-tab-${t}`);
        const btnEl = document.getElementById(`prof-tab-btn-${t}`);
        if (tabEl) tabEl.style.display = t === tab ? '' : 'none';
        if (btnEl) btnEl.classList.toggle('active', t === tab);
    });
    if (tab === 'kompetenser')  loadProfileSkills();
    if (tab === 'erfarenheter') loadProfileExperiences();
    if (tab === 'utbildning')   loadProfileEducation();
    if (tab === 'certifikat')   loadProfileCertifications();
    if (tab === 'cv')           { setupProfileCVUpload(); loadProfileCVs(); }
    if (tab === 'portratt')     loadProfilePortrait();
}

async function loadProfilePortrait() {
    if (!currentProfileId) return;
    const kand = await cvDb.kandidater.get(currentProfileId).catch(() => null);
    const ta = document.getElementById('prof-portrait-text');
    if (ta) ta.value = kand?.portrait || '';
}

async function generateProfilePortrait() {
    if (!currentProfileId) return;
    const btn = document.getElementById('prof-portrait-gen-btn');
    const status = document.getElementById('prof-portrait-status');
    if (btn) { btn.disabled = true; btn.textContent = t('portrait.generating'); }
    try {
        const portrait = await _generateKandidatPortrait(currentProfileId);
        const ta = document.getElementById('prof-portrait-text');
        if (ta) ta.value = portrait;
        if (status) status.textContent = t('portrait.saved');
    } catch (err) {
        if (status) status.textContent = err.message || t('publish.error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = t('portrait.generate_btn'); }
    }
}

async function saveProfilePortrait() {
    if (!currentProfileId) return;
    const ta = document.getElementById('prof-portrait-text');
    if (!ta) return;
    await cvDb.kandidater.update(currentProfileId, { portrait: ta.value }).catch(() => {});
}

async function loadProfileSkills() {
    if (!currentProfileId) return;
    try {
        let skills;
        if (currentProfileType === 'egenprofil') {
            const res = await apiFetch(`${API_BASE_URL}/competence/skills`);
            if (!res.ok) return;
            const data = await res.json();
            skills = data.skills || [];
        } else {
            const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentProfileId}/bank`);
            if (!res.ok) return;
            const data = await res.json();
            skills = data.skills || [];
        }
        cachedProfSkills = skills;
        profEditingSkillId = null;
        renderProfileSkills(cachedProfSkills);
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function renderProfileSkills(skills) {
    const container = document.getElementById('prof-skills-list');
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
    const clearBar = `<div class="list-clear-bar"><span>${skills.length} ${skills.length !== 1 ? t('kand.skill_plural') : t('kand.skill_singular')}</span><button class="btn btn-danger btn-sm" onclick="clearProfileSkills()">${t('sp.clear_all')}</button></div>`;
    const sortedEntries = Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b, currentLang));
    container.innerHTML = clearBar + sortedEntries.map(([cat, items]) => {
        items = items.slice().sort((a, b) => a.skill_name.localeCompare(b.skill_name, currentLang));
        return `
        <div style="margin-bottom:1rem">
            <div style="font-size:0.8125rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;
                        letter-spacing:0.05em;margin-bottom:0.5rem">${cat}</div>
            <div class="bank-skills-wrap skill-drop-zone" data-cat-drop-zone="${esc(cat)}">
                ${items.map(s => {
                    if (s.id === profEditingSkillId) {
                        return `<div class="skill-edit-row">
                            <input class="form-input" id="prof-edit-skill-name" value="${esc(s.skill_name)}" placeholder="${t('bank.label_skill')}" style="flex:1;min-width:120px">
                            <input class="form-input" id="prof-edit-skill-cat"  value="${esc(s.category)}"   placeholder="${t('bank.label_category')}" style="flex:1;min-width:100px" data-cat-combo>
                            <select class="form-input" id="prof-edit-skill-level" style="min-width:130px">
                                <option value=""               ${!s.skill_level                    ?'selected':''}>${t('skill.level_ph')}</option>
                                <option value="Känner till"    ${s.skill_level==='Känner till'    ?'selected':''}>${t('skill.level_1')}</option>
                                <option value="Erfaren"        ${s.skill_level==='Erfaren'        ?'selected':''}>${t('skill.level_2')}</option>
                                <option value="Mycket erfaren" ${s.skill_level==='Mycket erfaren' ?'selected':''}>${t('skill.level_3')}</option>
                            </select>
                            <button class="btn btn-primary btn-small" onclick="saveProfileSkill(${s.id})">${t('common.save')}</button>
                            <button class="btn btn-secondary btn-small" onclick="profEditingSkillId=null;renderProfileSkills(cachedProfSkills)">${t('common.cancel')}</button>
                        </div>`;
                    }
                    return `<span class="bank-skill-chip ${skillLevelClass(s.skill_level)}" draggable="true" data-skill-id="${s.id}" data-skill-cat="${esc(cat)}">
                        ${esc(s.skill_name)}
                        <button class="chip-delete" style="font-size:0.85em;padding:0 1px 0 3px" onclick="profEditingSkillId=${s.id};renderProfileSkills(cachedProfSkills)" title="${t('action.edit')}"><span class="material-icons" style="font-size:14px">edit</span></button>
                        <button class="chip-delete" onclick="deleteProfileSkill(${s.id})" title="${t('action.delete')}"><span class="material-icons" style="font-size:14px">close</span></button>
                    </span>`;
                }).join('')}
            </div>
        </div>`;
    }).join('');
    setupSkillDragDrop(container, async (skillId, newCat) => {
        const skill = cachedProfSkills.find(s => s.id === skillId);
        if (!skill) return;
        await apiFetch(_profSkillRoute(skillId), {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skill_name: skill.skill_name, category: newCat, skill_level: skill.skill_level }),
        });
        await loadProfileSkills();
    });
}

async function saveProfileSkill(id) {
    const body = {
        skill_name:  document.getElementById('prof-edit-skill-name').value.trim(),
        category:    document.getElementById('prof-edit-skill-cat').value.trim()  || 'Övrigt',
        skill_level: document.getElementById('prof-edit-skill-level').value || null,
    };
    if (!body.skill_name) { alert(t('kand.skill_name_required2')); return; }
    try {
        const res = await apiFetch(_profSkillRoute(id), {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        profEditingSkillId = null;
        await loadProfileSkills();
        touchProfile();
    } catch (err) { alert(err.message); }
}

async function deleteProfileSkill(id) {
    if (!confirm(t('sp.confirm_delete_skill'))) return;
    try {
        const res = await apiFetch(_profSkillRoute(id), { method: 'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadProfileSkills();
        touchProfile();
    } catch (err) { alert(err.message); }
}

async function clearProfileSkills() {
    if (!confirm(t('kand.confirm_clear_skills'))) return;
    try {
        const res = await apiFetch(_profSkillRoute(null), { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadProfileSkills();
        touchProfile();
    } catch (err) { alert(err.message); }
}

async function addProfileSkill() {
    const nameEl = document.getElementById('prof-skill-name');
    const catEl  = document.getElementById('prof-skill-category');
    const name   = nameEl?.value.trim();
    if (!name) { showProfileSkillStatus(t('kand.skill_name_required'), 'error'); return; }

    try {
        const res = await apiFetch(_profSkillRoute(null), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                skill_name:  name,
                category:    catEl?.value.trim() || 'Övrigt',
                skill_level: document.getElementById('prof-skill-level')?.value || null,
            }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        if (nameEl) nameEl.value = '';
        if (catEl) catEl.value  = '';
        const levelEl = document.getElementById('prof-skill-level');
        if (levelEl) levelEl.value = '';
        showProfileSkillStatus(t('kand.skill_added'), 'success');
        await loadProfileSkills();
        touchProfile();
    } catch (err) {
        showProfileSkillStatus(err.message, 'error');
    }
}

function showProfileSkillStatus(msg, type) {
    const el = document.getElementById('prof-skill-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

async function loadProfileExperiences() {
    if (!currentProfileId) return;
    try {
        let exps;
        if (currentProfileType === 'egenprofil') {
            const res = await apiFetch(`${API_BASE_URL}/competence/experiences`);
            if (!res.ok) return;
            const data = await res.json();
            exps = data.experiences || [];
        } else {
            const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentProfileId}/bank`);
            if (!res.ok) return;
            const data = await res.json();
            exps = data.experiences || [];
        }
        cachedProfExps = exps;
        profEditingExpId = null;
        renderProfileExperiences(cachedProfExps);
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function renderProfileExperiences(experiences) {
    const container = document.getElementById('prof-experiences-list');
    if (!container) return;
    if (!experiences || !experiences.length) {
        container.innerHTML = `<div class="empty-hint">${t('kand.no_exps')}</div>`;
        return;
    }
    experiences = experiences.slice().sort((a, b) => {
        const sa = normDate(a.start_date) || '', sb = normDate(b.start_date) || '';
        if (sa !== sb) return sb.localeCompare(sa);
        const ea = a.is_current ? '9999-99' : (normDate(a.end_date) || '');
        const eb = b.is_current ? '9999-99' : (normDate(b.end_date) || '');
        return eb.localeCompare(ea);
    });
    const typeLabel = { work: t('kand.type_work'), education: t('bank.type_opt_edu'), certification: t('bank.type_opt_cert'), project: t('kand.type_project') };
    const sel = (val, opt) => opt === val ? 'selected' : '';
    const mergeBar = `
        <div class="bank-merge-bar ${profSelectedExpIds.size >= 2 ? 'visible' : ''}" id="prof-merge-bar">
            <span>${profSelectedExpIds.size} ${t('bank.selected')}</span>
            <button class="btn btn-primary btn-small" onclick="mergeProfileExperiences()"
                    ${profSelectedExpIds.size < 2 ? 'disabled' : ''}>${t('bank.merge_selected')}</button>
            <button class="btn btn-ghost btn-small" onclick="profSelectedExpIds.clear();renderProfileExperiences(cachedProfExps)">${t('bank.deselect')}</button>
        </div>`;
    const clearBar = `<div class="list-clear-bar"><span>${experiences.length} ${experiences.length !== 1 ? t('kand.exp_plural') : t('kand.exp_singular')}</span><button class="btn btn-danger btn-sm" onclick="clearProfileExperiences()">${t('sp.clear_all')}</button></div>`;
    container.innerHTML = mergeBar + clearBar + experiences.map(e => {
        if (e.id === profEditingExpId) {
            const achText = (e.achievements || []).join('\n');
            return `<div style="border:1px solid var(--blue);border-radius:var(--radius);padding:0.875rem 1rem;margin-bottom:0.75rem">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem">
                    <input class="form-input" id="prof-edit-exp-title" value="${esc(e.title)}" placeholder="${t('bank.label_title')}" style="grid-column:span 2">
                    <input class="form-input" id="prof-edit-exp-org"   value="${esc(e.organization)}" placeholder="${t('bank.label_org')}">
                    <select class="form-input" id="prof-edit-exp-type">
                        <option value="work"    ${sel(e.experience_type,'work')}   >${t('kand.type_work')}</option>
                        <option value="project" ${sel(e.experience_type,'project')}>${t('kand.type_project')}</option>
                    </select>
                    <input class="form-input" id="prof-edit-exp-start" value="${esc(e.start_date)}" placeholder="${t('bank.label_start_date')}">
                    <input class="form-input" id="prof-edit-exp-end"   value="${esc(e.end_date)}"   placeholder="${t('bank.label_end_date')}">
                </div>
                <label style="font-size:0.8125rem;display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem">
                    <input type="checkbox" id="prof-edit-exp-current" ${e.is_current?'checked':''}> ${t('kand.ongoing')}
                </label>
                <textarea class="form-input" id="prof-edit-exp-desc" placeholder="${t('bank.label_desc')}" rows="3" style="margin-bottom:0.5rem;width:100%;box-sizing:border-box">${esc(e.description)}</textarea>
                <label style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.25rem;display:block">${t('kand.achievements_label')}</label>
                <textarea class="form-input" id="prof-edit-exp-ach" placeholder="${t('bank.new_ach_ph')}" rows="3" style="margin-bottom:0.5rem;width:100%;box-sizing:border-box">${esc(achText)}</textarea>
                <div style="display:flex;gap:0.5rem">
                    <button class="btn btn-primary btn-small" onclick="saveProfileExperience(${e.id})">${t('common.save')}</button>
                    <button class="btn btn-secondary btn-small" onclick="profEditingExpId=null;renderProfileExperiences(cachedProfExps)">${t('common.cancel')}</button>
                </div>
            </div>`;
        }
        const period = [normDate(e.start_date), e.is_current ? t('kand.now') : normDate(e.end_date)].filter(Boolean).join(' – ');
        const achHtml = (e.achievements || []).length
            ? `<ul class="exp-card-ach">${(e.achievements).map(a=>`<li>${esc(a)}</li>`).join('')}</ul>` : '';
        const checked = profSelectedExpIds.has(e.id);
        return `<div class="exp-card ${checked ? 'exp-card--selected' : ''}">
            <div class="exp-card-header">
                <div style="display:flex;align-items:flex-start;gap:10px">
                    <label class="bank-exp-checkbox" style="margin-top:4px">
                        <input type="checkbox" ${checked ? 'checked' : ''}
                               onchange="profToggleExpSelection(${e.id})">
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
                    <button class="btn-icon" onclick="profEditingExpId=${e.id};renderProfileExperiences(cachedProfExps)" title="${t('action.edit')}"><span class="material-icons" style="font-size:1rem">edit</span></button>
                    <button class="btn-icon btn-icon-danger" onclick="deleteProfileExperience(${e.id})" title="${t('action.delete')}"><span class="material-icons" style="font-size:1rem">delete</span></button>
                </div>
            </div>
            ${e.description ? `<div class="exp-card-desc">${esc(e.description)}</div>` : ''}
            ${achHtml}
        </div>`;
    }).join('');
}

function profToggleExpSelection(id) {
    if (profSelectedExpIds.has(id)) {
        profSelectedExpIds.delete(id);
    } else {
        profSelectedExpIds.add(id);
    }
    renderProfileExperiences(cachedProfExps);
}

async function mergeProfileExperiences() {
    if (profSelectedExpIds.size < 2) return;
    const ids = Array.from(profSelectedExpIds);

    const mergeBar = document.getElementById('prof-merge-bar');
    if (mergeBar) mergeBar.innerHTML = `<span class="spinner-small"></span> ${t('sp.merge_ai')}`;

    try {
        const res = await apiFetch(_profExpRoute('merge'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ experience_ids: ids }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || t('bank.merge_exp_failed'));
        }
        const data = await res.json();
        profSelectedExpIds.clear();
        await loadProfileExperiences();
        alert(`✅ ${data.merged_count} ${t('kand.exp_plural')} → "${data.title}"`);
    } catch (err) {
        alert('❌ ' + err.message);
        renderProfileExperiences(cachedProfExps);
    }
}

async function saveProfileExperience(id) {
    const body = {
        title:           document.getElementById('prof-edit-exp-title').value.trim(),
        organization:    document.getElementById('prof-edit-exp-org').value.trim()   || null,
        experience_type: document.getElementById('prof-edit-exp-type').value,
        start_date:      normDate(document.getElementById('prof-edit-exp-start').value.trim()),
        end_date:        normDate(document.getElementById('prof-edit-exp-end').value.trim()),
        is_current:      document.getElementById('prof-edit-exp-current').checked,
        description:     document.getElementById('prof-edit-exp-desc').value.trim() || null,
        achievements:    document.getElementById('prof-edit-exp-ach').value.split('\n').map(s=>s.trim()).filter(Boolean),
    };
    if (!body.title) { alert(t('kand.title_required')); return; }
    try {
        const res = await apiFetch(_profExpRoute(id), {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        profEditingExpId = null;
        await loadProfileExperiences();
        touchProfile();
    } catch (err) { alert(err.message); }
}

async function deleteProfileExperience(id) {
    if (!confirm(t('kand.confirm_delete_exp'))) return;
    try {
        const res = await apiFetch(_profExpRoute(id), { method: 'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadProfileExperiences();
        touchProfile();
    } catch (err) { alert(err.message); }
}

async function clearProfileExperiences() {
    if (!confirm(t('kand.confirm_clear_exps'))) return;
    try {
        const res = await apiFetch(_profExpRoute(null), { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadProfileExperiences();
        touchProfile();
    } catch (err) { alert(err.message); }
}

async function addProfileExperience() {
    const title = document.getElementById('prof-exp-title')?.value.trim();
    if (!title) { showProfileExpStatus(t('kand.title_required'), 'error'); return; }
    const body = {
        title,
        organization:    document.getElementById('prof-exp-org')?.value.trim()   || null,
        experience_type: document.getElementById('prof-exp-type')?.value || 'work',
        start_date:      normDate(document.getElementById('prof-exp-start')?.value.trim()),
        end_date:        normDate(document.getElementById('prof-exp-end')?.value.trim()),
        is_current:      document.getElementById('prof-exp-current')?.checked || false,
        description:     document.getElementById('prof-exp-desc')?.value.trim() || null,
        achievements:    document.getElementById('prof-exp-ach')?.value.split('\n').map(s => s.trim()).filter(Boolean) || [],
    };
    try {
        const res = await apiFetch(_profExpRoute(null), {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        ['prof-exp-title','prof-exp-org','prof-exp-start','prof-exp-end','prof-exp-desc','prof-exp-ach'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const curEl = document.getElementById('prof-exp-current');
        if (curEl) curEl.checked = false;
        showProfileExpStatus(t('kand.exp_added'), 'success');
        await loadProfileExperiences();
        touchProfile();
    } catch (err) { showProfileExpStatus(err.message, 'error'); }
}

function showProfileExpStatus(msg, type) {
    const el = document.getElementById('prof-exp-status');
    if (!el) return;
    el.textContent = msg;
    el.className = type === 'error' ? 'form-error' : 'form-success';
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 3000);
}

async function loadProfileEducation() {
    if (!currentProfileId) return;
    try {
        let url;
        if (currentProfileType === 'egenprofil') {
            url = `${API_BASE_URL}/competence/education`;
        } else {
            url = `${API_BASE_URL}/kandidater/${currentProfileId}/education`;
        }
        const res = await apiFetch(url);
        if (!res.ok) return;
        const data = await res.json();
        cachedProfEdu = data.education || [];
        profEditingEduId = null;
        renderProfileEducation(cachedProfEdu);
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function renderProfileEducation(items) {
    const container = document.getElementById('prof-education-list');
    if (!container) return;
    if (!items.length) {
        container.innerHTML = `<div class="empty-hint">${t('kand.no_edu')}</div>`;
        return;
    }
    const clearBar = `<div class="list-clear-bar"><span>${items.length} ${items.length !== 1 ? t('kand.edu_plural') : t('kand.edu_singular')}</span><button class="btn btn-danger btn-sm" onclick="clearProfileEducation()">${t('sp.clear_all')}</button></div>`;
    container.innerHTML = clearBar + items.map(e => {
        if (e.id === profEditingEduId) {
            return `<div style="border:1px solid var(--blue);border-radius:var(--radius);padding:0.875rem 1rem;margin-bottom:0.75rem">
                <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.5rem">
                    <input class="form-input" id="prof-edit-edu-degree"      value="${esc(e.degree)}"         placeholder="Examen / Utbildning" required>
                    <input class="form-input" id="prof-edit-edu-institution"  value="${esc(e.institution)}"    placeholder="Lärosäte">
                    <input class="form-input" id="prof-edit-edu-field"        value="${esc(e.field_of_study)}" placeholder="Ämne / Inriktning">
                    <div style="display:flex;gap:0.5rem">
                        <input class="form-input" id="prof-edit-edu-start" value="${esc(e.start_date)}" placeholder="Från (ÅÅÅÅ-MM)" style="flex:1">
                        <input class="form-input" id="prof-edit-edu-end"   value="${esc(e.end_date)}"   placeholder="Till (ÅÅÅÅ-MM)" style="flex:1">
                    </div>
                    <textarea class="form-input" id="prof-edit-edu-desc" placeholder="Beskrivning" rows="2">${esc(e.description)}</textarea>
                </div>
                <div style="display:flex;gap:0.5rem">
                    <button class="btn btn-primary btn-small" onclick="saveProfileEducation(${e.id})">${t('common.save')}</button>
                    <button class="btn btn-secondary btn-small" onclick="profEditingEduId=null;renderProfileEducation(cachedProfEdu)">${t('common.cancel')}</button>
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
                <button class="btn-icon" onclick="profEditingEduId=${e.id};renderProfileEducation(cachedProfEdu)" title="${t('action.edit')}"><span class="material-icons" style="font-size:1rem">edit</span></button>
                <button class="btn-icon btn-icon-danger" onclick="deleteProfileEducation(${e.id})" title="${t('action.delete')}"><span class="material-icons" style="font-size:1rem">delete</span></button>
            </div>
        </div>`;
    }).join('');
}

async function saveProfileEducation(id) {
    const body = {
        degree:         document.getElementById('prof-edit-edu-degree').value.trim(),
        institution:    document.getElementById('prof-edit-edu-institution').value.trim() || null,
        field_of_study: document.getElementById('prof-edit-edu-field').value.trim()       || null,
        start_date:     document.getElementById('prof-edit-edu-start').value.trim()       || null,
        end_date:       document.getElementById('prof-edit-edu-end').value.trim()         || null,
        description:    document.getElementById('prof-edit-edu-desc').value.trim()        || null,
    };
    if (!body.degree) { showProfileEduStatus(t('kand.degree_required'), 'error'); return; }
    try {
        let url;
        if (currentProfileType === 'egenprofil') {
            url = `${API_BASE_URL}/competence/education/${id}`;
        } else {
            url = `${API_BASE_URL}/kandidater/${currentProfileId}/education/${id}`;
        }
        const res = await apiFetch(url, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        profEditingEduId = null;
        showProfileEduStatus(t('kand.edu_saved'), 'success');
        await loadProfileEducation();
        touchProfile();
    } catch (err) { showProfileEduStatus(err.message, 'error'); }
}

async function addProfileEducation() {
    const degree = document.getElementById('prof-edu-degree')?.value.trim();
    if (!degree) { showProfileEduStatus(t('kand.degree_required'), 'error'); return; }
    const body = {
        degree,
        institution:    document.getElementById('prof-edu-institution')?.value.trim() || null,
        field_of_study: document.getElementById('prof-edu-field')?.value.trim()       || null,
        start_date:     document.getElementById('prof-edu-start')?.value.trim()       || null,
        end_date:       document.getElementById('prof-edu-end')?.value.trim()         || null,
    };
    try {
        let url;
        if (currentProfileType === 'egenprofil') {
            url = `${API_BASE_URL}/competence/education`;
        } else {
            url = `${API_BASE_URL}/kandidater/${currentProfileId}/education`;
        }
        const res = await apiFetch(url, {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        ['prof-edu-degree','prof-edu-institution','prof-edu-field','prof-edu-start','prof-edu-end']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        showProfileEduStatus(t('kand.edu_added'), 'success');
        await loadProfileEducation();
        touchProfile();
    } catch (err) { showProfileEduStatus(err.message, 'error'); }
}

async function deleteProfileEducation(id) {
    if (!confirm(t('kand.confirm_delete_edu'))) return;
    try {
        let url;
        if (currentProfileType === 'egenprofil') {
            url = `${API_BASE_URL}/competence/education/${id}`;
        } else {
            url = `${API_BASE_URL}/kandidater/${currentProfileId}/education/${id}`;
        }
        const res = await apiFetch(url, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadProfileEducation();
        touchProfile();
    } catch (err) { alert(err.message); }
}

async function clearProfileEducation() {
    if (!confirm(t('kand.confirm_clear_edu'))) return;
    try {
        let url;
        if (currentProfileType === 'egenprofil') {
            url = `${API_BASE_URL}/competence/education`;
        } else {
            url = `${API_BASE_URL}/kandidater/${currentProfileId}/education`;
        }
        const res = await apiFetch(url, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadProfileEducation();
    } catch (err) { alert(err.message); }
}

function showProfileEduStatus(msg, type) {
    const el = document.getElementById('prof-edu-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

async function loadProfileCertifications() {
    if (!currentProfileId) return;
    try {
        let url;
        if (currentProfileType === 'egenprofil') {
            url = `${API_BASE_URL}/competence/certifications`;
        } else {
            url = `${API_BASE_URL}/kandidater/${currentProfileId}/certifications`;
        }
        const res = await apiFetch(url);
        if (!res.ok) return;
        const data = await res.json();
        cachedProfCerts = data.certifications || [];
        profEditingCertId = null;
        renderProfileCertifications(cachedProfCerts);
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function renderProfileCertifications(items) {
    const container = document.getElementById('prof-certifications-list');
    if (!container) return;
    if (!items.length) {
        container.innerHTML = `<div class="empty-hint">${t('kand.no_cert')}</div>`;
        return;
    }
    const clearBar = `<div class="list-clear-bar"><span>${items.length} ${t('kand.cert_word')}</span><button class="btn btn-danger btn-sm" onclick="clearProfileCertifications()">${t('sp.clear_all')}</button></div>`;
    container.innerHTML = clearBar + items.map(c => {
        if (c.id === profEditingCertId) {
            return `<div style="border:1px solid var(--blue);border-radius:var(--radius);padding:0.875rem 1rem;margin-bottom:0.75rem">
                <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.5rem">
                    <input class="form-input" id="prof-edit-cert-name"   value="${esc(c.name)}"   placeholder="Kurs / Certifikat" required>
                    <input class="form-input" id="prof-edit-cert-issuer" value="${esc(c.issuer)}" placeholder="Utfärdare">
                    <input class="form-input" id="prof-edit-cert-date"   value="${esc(c.date)}"   placeholder="Datum (ÅÅÅÅ-MM)">
                    <textarea class="form-input" id="prof-edit-cert-desc" placeholder="Beskrivning" rows="2">${esc(c.description)}</textarea>
                </div>
                <div style="display:flex;gap:0.5rem">
                    <button class="btn btn-primary btn-small" onclick="saveProfileCertification(${c.id})">${t('common.save')}</button>
                    <button class="btn btn-secondary btn-small" onclick="profEditingCertId=null;renderProfileCertifications(cachedProfCerts)">${t('common.cancel')}</button>
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
                <button class="btn-icon" onclick="profEditingCertId=${c.id};renderProfileCertifications(cachedProfCerts)" title="${t('action.edit')}"><span class="material-icons" style="font-size:1rem">edit</span></button>
                <button class="btn-icon btn-icon-danger" onclick="deleteProfileCertification(${c.id})" title="${t('action.delete')}"><span class="material-icons" style="font-size:1rem">delete</span></button>
            </div>
        </div>`;
    }).join('');
}

async function saveProfileCertification(id) {
    const body = {
        name:        document.getElementById('prof-edit-cert-name').value.trim(),
        issuer:      document.getElementById('prof-edit-cert-issuer').value.trim() || null,
        date:        document.getElementById('prof-edit-cert-date').value.trim()   || null,
        description: document.getElementById('prof-edit-cert-desc').value.trim()  || null,
    };
    if (!body.name) { showProfileCertStatus(t('kand.cert_name_required'), 'error'); return; }
    try {
        let url;
        if (currentProfileType === 'egenprofil') {
            url = `${API_BASE_URL}/competence/certifications/${id}`;
        } else {
            url = `${API_BASE_URL}/kandidater/${currentProfileId}/certifications/${id}`;
        }
        const res = await apiFetch(url, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        profEditingCertId = null;
        showProfileCertStatus(t('kand.cert_saved'), 'success');
        await loadProfileCertifications();
        touchProfile();
    } catch (err) { showProfileCertStatus(err.message, 'error'); }
}

async function addProfileCertification() {
    const name = document.getElementById('prof-cert-name')?.value.trim();
    if (!name) { showProfileCertStatus(t('kand.cert_name_required'), 'error'); return; }
    const body = {
        name,
        issuer:      document.getElementById('prof-cert-issuer')?.value.trim() || null,
        date:        document.getElementById('prof-cert-date')?.value.trim()   || null,
        description: document.getElementById('prof-cert-desc')?.value.trim()  || null,
    };
    try {
        let url;
        if (currentProfileType === 'egenprofil') {
            url = `${API_BASE_URL}/competence/certifications`;
        } else {
            url = `${API_BASE_URL}/kandidater/${currentProfileId}/certifications`;
        }
        const res = await apiFetch(url, {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        ['prof-cert-name','prof-cert-issuer','prof-cert-date','prof-cert-desc'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        showProfileCertStatus(t('kand.cert_added'), 'success');
        await loadProfileCertifications();
        touchProfile();
    } catch (err) { showProfileCertStatus(err.message, 'error'); }
}

async function deleteProfileCertification(id) {
    if (!confirm(t('kand.confirm_delete_cert'))) return;
    try {
        let url;
        if (currentProfileType === 'egenprofil') {
            url = `${API_BASE_URL}/competence/certifications/${id}`;
        } else {
            url = `${API_BASE_URL}/kandidater/${currentProfileId}/certifications/${id}`;
        }
        const res = await apiFetch(url, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadProfileCertifications();
        touchProfile();
    } catch (err) { alert(err.message); }
}

async function clearProfileCertifications() {
    if (!confirm(t('kand.confirm_clear_certs'))) return;
    try {
        let url;
        if (currentProfileType === 'egenprofil') {
            url = `${API_BASE_URL}/competence/certifications`;
        } else {
            url = `${API_BASE_URL}/kandidater/${currentProfileId}/certifications`;
        }
        const res = await apiFetch(url, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadProfileCertifications();
    } catch (err) { alert(err.message); }
}

function showProfileCertStatus(msg, type) {
    const el = document.getElementById('prof-cert-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

async function loadProfileCVs() {
    if (!currentProfileId) return;
    try {
        let url;
        if (currentProfileType === 'egenprofil') {
            url = `${API_BASE_URL}/competence/cvs/`;
        } else {
            url = `${API_BASE_URL}/kandidater/${currentProfileId}/cvs`;
        }
        const res = await apiFetch(url);
        if (!res.ok) return;
        profCandidateCVs = await res.json();
        displayProfileCVs(profCandidateCVs);
        if (currentProfileType === 'egenprofil') {
            const dashCvCount = document.getElementById('dash-cv-count');
            if (dashCvCount) dashCvCount.textContent = profCandidateCVs.length;
        }
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function displayProfileCVs(cvs) {
    const container = document.getElementById('prof-cv-list');
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
            ? `<span class="cv-badge cv-badge--green"><span class="material-icons" style="font-size:.85rem;vertical-align:middle">check</span> ${t('cv.badge_processed')}</span>`
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
                        <button class="btn btn-secondary btn-sm" onclick="downloadCVFile(${cv.id})">⬇ ${t('cv.download')}</button>
                        <button class="btn btn-icon btn-danger btn-sm" title="${t('cv.btn_delete')}" onclick="deleteProfileCV(${cv.id}, '${safeName}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                    </div>
                </div>
                <div class="cv-item-details">
                    <div class="cv-item-detail"><span class="material-icons cv-detail-icon">calendar_today</span>${date}</div>
                    <div class="cv-item-detail"><span class="material-icons cv-detail-icon">psychology</span>${cv.skill_count ?? 0} ${t('cv.section_skills').toLowerCase()}</div>
                    <div class="cv-item-detail"><span class="material-icons cv-detail-icon">work_history</span>${cv.experience_count ?? 0} ${t('cv.section_experience').toLowerCase()}</div>
                    <div class="cv-item-detail"><span class="material-icons cv-detail-icon">school</span>${cv.education_count ?? 0} ${t('cv.section_education').toLowerCase()}</div>
                    <div class="cv-item-detail"><span class="material-icons cv-detail-icon">workspace_premium</span>${cv.certification_count ?? 0} ${t('cv.section_certifications').toLowerCase()}</div>
                </div>
            </div>`;
    }).join('');
}

async function deleteProfileCV(cvId, filename) {
    if (!confirm(t('kand.confirm_delete_cv').replace('%n', filename))) return;
    try {
        let url;
        if (currentProfileType === 'egenprofil') {
            url = `${API_BASE_URL}/competence/cvs/${cvId}`;
        } else {
            url = `${API_BASE_URL}/kandidater/${currentProfileId}/cvs/${cvId}`;
        }
        const res = await apiFetch(url, { method:'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadProfileCVs();
        touchProfile();
    } catch (err) {
        alert(`❌ ${err.message}`);
    }
}

function setupProfileCVUpload() {
    if (profUploadSetup) return;
    profUploadSetup = true;
    setupUploadZone({
        areaId:   'prof-upload-area',
        inputId:  'prof-cv-upload',
        onFile:   handleProfileCVUpload,
        statusFn: showProfileUploadStatus,
    });
}

async function handleProfileCVUpload(file) {
    if (!currentProfileId) return;

    showProfileUploadStatus(t('cv.loading'), 'loading');

    try {
        const raw = await cvPdf.extractText(file);
        const stripped = stripContactInfo(raw);
        showProfileUploadStatus('', '');

        showCVReviewModal(stripped, file.name, async (reviewedText) => {
            showProfileUploadStatus(t('cv.analysing_ai'), 'loading');
            const formData = new FormData();
            formData.append('file', file);
            formData.append('reviewed_text', reviewedText);
            try {
                let uploadUrl;
                if (currentProfileType === 'egenprofil') {
                    uploadUrl = `${API_BASE_URL}/competence/cvs/upload`;
                } else {
                    uploadUrl = `${API_BASE_URL}/kandidater/${currentProfileId}/bank/upload-cv`;
                }
                const res = await apiFetch(uploadUrl, { method: 'POST', body: formData });
                if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel vid uppladdning'); }
                const data = await res.json();
                showProfileUploadStatus(
                    `<span class="material-icons" style="font-size:1rem;vertical-align:middle">check_circle</span> ${t('kand.cv_upload_result').replace('{filename}', data.filename || file.name).replace('{skills}', data.skill_count).replace('{exps}', data.experience_count)}`,
                    'success'
                );
                await loadProfileSkills();
                await loadProfileExperiences();
                await loadProfileEducation();
                await loadProfileCertifications();
                loadProfileCVs();
                touchProfile();
            } catch (err) {
                showProfileUploadStatus(`<span class="material-icons" style="font-size:1rem;vertical-align:middle">error</span> ${err.message}`, 'error');
            }
        });
    } catch (err) {
        showProfileUploadStatus(`<span class="material-icons" style="font-size:1rem;vertical-align:middle">error</span> ${err.message}`, 'error');
    }
}

function showProfileUploadStatus(msg, type) {
    const el = document.getElementById('prof-upload-status');
    if (!el) return;
    el.innerHTML = msg;
    el.className = `status-message status-${type}`;
    if (type !== 'loading') setTimeout(() => { el.innerHTML = ''; el.className = ''; }, 5000);
}

async function openProfile(profileId) {
    profUploadSetup = false;
    profSelectedExpIds = new Set();
    cachedProfSkills = [];
    cachedProfExps   = [];
    cachedProfEdu    = [];
    cachedProfCerts  = [];
    profCandidateCVs = [];

    if (profileId === 'own') {
        let own = await cvDb.kandidater.getOwn().catch(() => null);
        if (!own) {
            const ownId = await _getOwnKandidatId();
            own = await cvDb.kandidater.get(ownId).catch(() => null);
        }
        if (own) {
            currentProfileId   = own.id;
            currentProfileType = 'egenprofil';
        } else {
            currentProfileId   = null;
            currentProfileType = 'egenprofil';
        }
    } else if (profileId === null) {
        currentProfileId   = null;
        currentProfileType = 'kandidat';
    } else {
        currentProfileId   = profileId;
        const kand = await cvDb.kandidater.get(profileId).catch(() => null);
        currentProfileType = kand?.profile_type || 'kandidat';
    }

    const titleEl = document.getElementById('prof-form-title');
    const subtitleEl = document.getElementById('prof-form-subtitle');
    const backBtn = document.getElementById('prof-back-btn');
    const deleteBtn = document.getElementById('prof-delete-btn');

    if (titleEl) {
        titleEl.textContent = currentProfileType === 'egenprofil'
            ? t('profile.title_own')
            : t('profile.title_candidate');
    }
    if (subtitleEl) {
        subtitleEl.textContent = currentProfileType === 'egenprofil'
            ? t('profile.subtitle_own')
            : t('profile.subtitle_candidate');
    }

    if (backBtn) {
        backBtn.style.display = currentProfileType === 'egenprofil' ? 'none' : '';
    }

    if (deleteBtn) {
        deleteBtn.style.display = (currentProfileId && currentProfileType !== 'egenprofil') ? '' : 'none';
    }

    const hasProfile = currentProfileId !== null;
    ['prof-tab-btn-kompetenser', 'prof-tab-btn-erfarenheter',
     'prof-tab-btn-utbildning', 'prof-tab-btn-certifikat', 'prof-tab-btn-cv', 'prof-tab-btn-portratt'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !hasProfile;
    });

    document.getElementById('prof-status').textContent = '';

    if (currentProfileType === 'kandidat') {
        document.getElementById('kandidater-list-panel').style.display = 'none';
        document.getElementById('profile-form-panel').style.display   = '';
    } else {
        document.getElementById('profile-form-panel').style.display = '';
    }

    if (hasProfile) {
        await loadProfile();
    }
    switchProfileTab('basinfo');

    if (currentProfileId) {
        refreshProfilePublishStatus().catch(() => {});
    } else {
        document.getElementById('prof-publish-row')?.classList.add('hidden');
        _showProfTimestamps(null);
    }
}

async function deleteProfile() {
    if (!currentProfileId || currentProfileType === 'egenprofil') return;
    const name = document.getElementById('prof-public-name')?.value.trim() || 'kandidaten';
    if (!confirm(t('kand.confirm_delete').replace('%n', name))) return;

    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentProfileId}`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        showKandidatListPanel();
    } catch (err) {
        showProfileStatus(err.message, 'error');
    }
}
