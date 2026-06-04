// ── MINA KANDIDATER ───────────────────────────────────────────────────────────
// Depends on: app-state.js (apiFetch, API_BASE_URL, esc, currentUser,
//             cachedKandSkills, cachedKandExps, cachedKandEdu, cachedKandCerts,
//             kandEditingSkillId, kandEditingExpId, kandEditingEduId, kandEditingCertId,
//             lastMatchResult, lastJobDesc, lastMatchKandidatId, displayMatchResult)

// ── State ─────────────────────────────────────────────────────────────────────
let currentKandidatId = null;
let kandidaterCache   = [];
let kandUploadSetup   = false;
let kandCandidateCVs  = [];
let _kandQualities    = [];

// ── Timestamps ────────────────────────────────────────────────────────────────

function _fmtDateTime(iso) {
    if (!iso) return '–';
    return new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });
}

function _showKandTimestamps(kandidat) {
    const el = document.getElementById('kand-timestamps');
    if (!el || !kandidat) { el && el.classList.add('hidden'); return; }
    el.innerHTML =
        `<span>${t('kand.created_at')} ${_fmtDateTime(kandidat.created_at)}</span>` +
        `<span>${t('kand.updated_at')} ${_fmtDateTime(kandidat.updated_at)}</span>`;
    el.classList.remove('hidden');
}

async function touchKandidat() {
    if (!currentKandidatId) return;
    try {
        await cvDb.kandidater.update(currentKandidatId, {});
        const fresh = await cvDb.kandidater.get(currentKandidatId);
        _showKandTimestamps(fresh);
    } catch { /* silent */ }
}

// ── Kandidat list ─────────────────────────────────────────────────────────────

async function loadDashKandidaterCount() {
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/`);
        if (!res.ok) return;
        const data = await res.json();
        const el = document.getElementById('dash-kandidater-count');
        if (el) el.textContent = (data.kandidater || []).length;
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

async function loadKandidaterView() {
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/`);
        if (!res.ok) return;
        const data = await res.json();
        kandidaterCache = data.kandidater;
        renderKandidatList(kandidaterCache);
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function renderKandidatList(kandidater) {
    const container = document.getElementById('kandidater-list');
    if (!container) return;
    const dashEl = document.getElementById('dash-kandidater-count');
    if (dashEl) dashEl.textContent = kandidater.length;

    if (!kandidater.length) {
        container.innerHTML = `<div class="empty-hint">${t('kand.empty_list')}</div>`;
        return;
    }

    const countBar = `<div class="list-clear-bar"><span>${kandidater.length} ${kandidater.length !== 1 ? t('kand.candidate_plural') : t('kand.candidate_singular')}</span></div>`;
    container.innerHTML = countBar + kandidater.map(k => {
        const meta = [
            k.roles                     ? k.roles                            : null,
            k.desired_city              ? k.desired_city                     : null,
            k.desired_employment.length ? k.desired_employment.join(', ')    : null,
            k.desired_workplace.length  ? k.desired_workplace.join(', ')     : null,
        ].filter(Boolean).join(' · ');
        const safeName = esc(k.public_name || t('kand.no_name'));

        const c = k._counts || {};
        const statsHtml = `<div class="kand-card-stats">
            <span class="kand-card-stat"><span class="material-icons">description</span>${c.cvs ?? 0}</span>
            <span class="kand-card-stat"><span class="material-icons">psychology</span>${c.skills ?? 0}</span>
            <span class="kand-card-stat"><span class="material-icons">work_history</span>${c.experiences ?? 0}</span>
            <span class="kand-card-stat"><span class="material-icons">school</span>${c.education ?? 0}</span>
            <span class="kand-card-stat"><span class="material-icons">workspace_premium</span>${c.certifications ?? 0}</span>
        </div>`;

        return `
        <div class="cv-item" onclick="editKandidatById(${k.id})" style="cursor:pointer">
            <div class="cv-item-info">
                <div class="cv-item-name">${safeName}</div>
                ${meta ? `<div class="cv-item-meta">${meta}</div>` : ''}
                ${statsHtml}
            </div>
            <div class="cv-item-actions">
                ${k.searchable ? `<span class="cv-item-badge" style="background:var(--success-bg);color:var(--success)">${t('kand.searchable_badge')}</span>` : ''}
                <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); editKandidatById(${k.id})">${t('action.edit')}</button>
                <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteKandidatFromList(${k.id}, '${safeName}')">${t('common.delete')}</button>
            </div>
        </div>`;
    }).join('');
}

function editKandidatById(id) {
    const kandidat = kandidaterCache.find(k => k.id === id);
    if (kandidat) showKandidatForm(kandidat);
}

async function deleteKandidatFromList(id, name) {
    if (!confirm(t('kand.confirm_delete').replace('%n', name))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${id}`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel vid borttagning'); }
        kandidaterCache = kandidaterCache.filter(k => k.id !== id);
        renderKandidatList(kandidaterCache);
    } catch (err) {
        alert(err.message);
    }
}

// ── Kandidat form ─────────────────────────────────────────────────────────────

function showKandidatForm(kandidat) {
    currentKandidatId = kandidat ? kandidat.id : null;

    document.getElementById('kandidater-list-panel').style.display = 'none';
    document.getElementById('kandidat-form-panel').style.display   = '';

    document.getElementById('kandidat-form-title').textContent =
        kandidat ? t('kand.form_title_candidate').replace('{name}', kandidat.public_name) : t('kand.form_title_add');

    document.getElementById('kand-public-name').value  = kandidat?.public_name  || '';
    document.getElementById('kand-email').value        = kandidat?.email        || '';
    document.getElementById('kand-public-phone').value = kandidat?.public_phone || '';
    document.getElementById('kand-roles').value        = kandidat?.roles        || '';
    document.getElementById('kand-city').value         = kandidat?.desired_city || '';

    ['kand-emp-heltid', 'kand-emp-deltid', 'kand-emp-timmar', 'kand-emp-fast', 'kand-emp-konsult'].forEach(id => {
        const el = document.getElementById(id);
        el.checked = (kandidat?.desired_employment || []).includes(el.value);
    });

    ['kand-wp-plats', 'kand-wp-hybrid', 'kand-wp-distans'].forEach(id => {
        const el = document.getElementById(id);
        el.checked = (kandidat?.desired_workplace || []).includes(el.value);
    });

    _kandQualities = Array.isArray(kandidat?.personal_qualities) ? [...kandidat.personal_qualities] : [];
    renderKandQualities();
    document.getElementById('kand-commute').checked    = kandidat?.willing_to_commute || false;
    document.getElementById('kand-searchable').checked = kandidat?.searchable         || false;
    document.getElementById('kand-available-from').value = kandidat?.available_from   || '';

    document.getElementById('kand-profile-uuid').value = kandidat?.profile_uuid || '';
    document.getElementById('kand-delete-btn').style.display = kandidat ? '' : 'none';
    document.getElementById('kand-status').textContent = '';
    _showKandTimestamps(kandidat || null);

    // Dessa flikar aktiveras bara vid redigering av befintlig kandidat
    ['kand-tab-btn-kompetenser', 'kand-tab-btn-erfarenheter',
     'kand-tab-btn-utbildning', 'kand-tab-btn-certifikat', 'kand-tab-btn-cv'].forEach(id => {
        document.getElementById(id).disabled = !kandidat;
    });
    switchKandidatTab('basinfo');
}

function showKandidatListPanel() {
    document.getElementById('kandidat-form-panel').style.display   = 'none';
    document.getElementById('kandidater-list-panel').style.display = '';
    switchKandidatTab('basinfo');
    loadKandidaterView();
}

// ── Matcha mot kandidater ─────────────────────────────────────────────────────

// Cache för fullständiga matchresultat från senaste ranknings-körning.
// Nyckel: kandidat-ID (number), värde: match_result-objekt från BE.
let mkResultCache = {};

async function loadMatchKandidatView() {
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/`);
        if (!res.ok) return;
        const data = await res.json();
        const list = document.getElementById('mk-kandidat-list');
        if (!list) return;
        const kandidater = data.kandidater || [];
        if (kandidater.length === 0) {
            list.innerHTML = `<span class="mk-kandidat-empty">${t('matchk.empty_candidates')}</span>`;
        } else {
            list.innerHTML =
                `<label class="mk-kandidat-item mk-select-all-item">
                    <input type="checkbox" id="mk-select-all" onchange="toggleSelectAllKandidater(this)">
                    <strong>${t('matchk.select_all')}</strong>
                    <span class="mk-kandidat-count">${kandidater.length}</span>
                </label>
                <hr class="mk-kandidat-divider">` +
                kandidater.map(k => {
                    const name  = k.public_name || t('kand.no_name');
                    const label = k.roles ? `${name} <span class="mk-kandidat-role">(${k.roles})</span>` : name;
                    return `<label class="mk-kandidat-item">
                    <input type="checkbox" value="${k.id}" data-name="${name}" onchange="updateMatchKandidatBtn()">
                    ${label}
                </label>`;
                }).join('');
        }
        updateMatchKandidatBtn();
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function toggleSelectAllKandidater(selectAllCheckbox) {
    const list = document.getElementById('mk-kandidat-list');
    if (!list) return;
    list.querySelectorAll('input[type="checkbox"]:not(#mk-select-all)')
        .forEach(cb => { cb.checked = selectAllCheckbox.checked; });
    updateMatchKandidatBtn();
}

function updateMatchKandidatBtn() {
    const list       = document.getElementById('mk-kandidat-list');
    const txt        = document.getElementById('mk-job-description');
    const rankBtn    = document.getElementById('mk-rank-btn');
    const hint       = document.getElementById('mk-match-hint');
    const hasText    = !!txt?.value.trim();
    const boxes      = list ? [...list.querySelectorAll('input[type="checkbox"]:not(#mk-select-all)')] : [];
    const anyChecked = boxes.some(cb => cb.checked);
    const allChecked = boxes.length > 0 && boxes.every(cb => cb.checked);
    const selectAll  = document.getElementById('mk-select-all');
    if (selectAll) {
        selectAll.checked       = allChecked;
        selectAll.indeterminate = anyChecked && !allChecked;
    }
    if (rankBtn) rankBtn.disabled = !anyChecked || !hasText;
    if (hint) {
        if (!hasText && !anyChecked) hint.textContent = t('matchk.hint_both');
        else if (!hasText)           hint.textContent = t('matchk.hint_no_text');
        else if (!anyChecked)        hint.textContent = t('matchk.hint_no_candidate');
        else                         hint.textContent = '';
    }
}

// ── Ranka alla kandidater (parallell LLM-analys) ─────────────────────────────

async function rankAllKandidater() {
    const txt     = document.getElementById('mk-job-description');
    const rankBtn = document.getElementById('mk-rank-btn');
    const ranking = document.getElementById('mk-ranking');
    const result  = document.getElementById('mk-result');
    const jobDesc = txt?.value.trim();
    if (!jobDesc) return;

    rankBtn.disabled = true;
    rankBtn.querySelector('.btn-text').style.display = 'none';
    rankBtn.querySelector('.btn-loading').classList.remove('hidden');
    ranking.classList.add('hidden');
    result.classList.add('hidden');

    const list = document.getElementById('mk-kandidat-list');
    const selectedIds = list
        ? [...list.querySelectorAll('input[type="checkbox"]:not(#mk-select-all):checked')]
            .map(cb => Number(cb.value))
        : [];

    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/multi-match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_description: jobDesc, kandidat_ids: selectedIds }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || t('matchk.ranking_failed'));
        }
        const data = await res.json();
        // Bygg cache: id → fullständigt matchresultat
        mkResultCache = {};
        (data.candidates || []).forEach(c => {
            if (c.match_result) mkResultCache[c.id] = c.match_result;
        });
        renderRankingList(data.candidates || []);
    } catch (err) {
        ranking.innerHTML = `<div class="status-message status-error">❌ Fel: ${err.message}</div>`;
        ranking.classList.remove('hidden');
    } finally {
        rankBtn.disabled = false;
        rankBtn.querySelector('.btn-text').style.display = 'inline';
        rankBtn.querySelector('.btn-loading').classList.add('hidden');
        updateMatchKandidatBtn();
    }
}

function renderRankingList(candidates) {
    const ranking = document.getElementById('mk-ranking');
    if (!ranking) return;

    if (candidates.length === 0) {
        ranking.innerHTML = `<p class="mk-ranking-empty">${t('matchk.empty_ranking')}</p>`;
        ranking.classList.remove('hidden');
        return;
    }

    const cards = candidates.map((c, i) => {
        if (c.score === null) {
            return `<div class="mk-rank-card mk-rank-card--nodata">
                <span class="mk-rank-num">${i + 1}</span>
                <div class="mk-rank-info">
                    <div class="mk-rank-name">${esc(c.name)}</div>
                    ${c.roles ? `<div class="mk-rank-roles">${esc(c.roles)}</div>` : ''}
                </div>
                <span class="mk-rank-nodata-label">${t('matchk.insufficient_data')}</span>
            </div>`;
        }
        const barClass = c.score >= 75 ? 'mk-bar--green' : c.score >= 45 ? 'mk-bar--amber' : 'mk-bar--red';
        return `<div class="mk-rank-card" onclick="matchKandidatJob(${c.id}, '${esc(c.name)}')">
            <span class="mk-rank-num">${i + 1}</span>
            <div class="mk-rank-info">
                <div class="mk-rank-name">${esc(c.name)}</div>
                ${c.roles ? `<div class="mk-rank-roles">${esc(c.roles)}</div>` : ''}
            </div>
            <div class="mk-rank-score">
                <div class="mk-bar-track"><div class="mk-bar-fill ${barClass}" style="width:${c.score}%"></div></div>
            </div>
        </div>`;
    }).join('');

    ranking.innerHTML = `
        <h2 class="mk-result-header">${t('matchk.ranking_title')} — ${candidates.filter(c => c.score !== null).length} ${t('matchk.candidates_suffix')}</h2>
        <p class="mk-ranking-note">${t('matchk.ranking_note')}</p>
        <div class="mk-rank-list">${cards}</div>
    `;
    ranking.classList.remove('hidden');
}

// ── Detaljerad analys (LLM) ───────────────────────────────────────────────────

async function matchKandidatJob(overrideId = null, overrideName = null) {
    const list = document.getElementById('mk-kandidat-list');
    const txt  = document.getElementById('mk-job-description');
    const btn  = document.getElementById('mk-match-btn');
    const res  = document.getElementById('mk-result');

    let kandidatId, kandidatName;
    if (overrideId !== null) {
        kandidatId   = overrideId;
        kandidatName = overrideName || '';
    } else {
        const checked  = list ? [...list.querySelectorAll('input[type="checkbox"]:checked')] : [];
        const first    = checked[0];
        kandidatId     = first?.value;
        kandidatName   = first?.dataset.name || '';
    }

    const jobDesc = txt?.value.trim();
    if (!kandidatId || !jobDesc) return;

    // Visa laddning på rätt knapp beroende på hur funktionen anropades
    const activeBtn = overrideId !== null ? null : btn;
    if (activeBtn) {
        activeBtn.disabled = true;
        activeBtn.querySelector('.btn-text').style.display = 'none';
        activeBtn.querySelector('.btn-loading').classList.remove('hidden');
    }
    res.classList.add('hidden');

    try {
        let result = mkResultCache[Number(kandidatId)] || null;

        if (!result) {
            // Ingen cachad data — gör ett nytt API-anrop
            const response = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/match-job`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job_title: '', job_description: jobDesc }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || t('match.failed'));
            }
            result = await response.json();
        }

        lastMatchResult     = result;
        lastJobDesc         = jobDesc;
        lastMatchKandidatId = Number(kandidatId);

        displayMatchResult(result, res);
        if (kandidatName) {
            res.insertAdjacentHTML('afterbegin', `<h2 class="mk-result-header">${esc(kandidatName)}</h2>`);
        }
        // Om vi kom från rankning, lägg till en "tillbaka"-länk
        const ranking = document.getElementById('mk-ranking');
        if (overrideId !== null && ranking && !ranking.classList.contains('hidden')) {
            res.insertAdjacentHTML('afterbegin',
                `<button class="mk-back-btn" onclick="document.getElementById('mk-result').classList.add('hidden')">${t('matchk.back_to_ranking')}</button>`);
        }
        res.classList.remove('hidden');
        setTimeout(() => res.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    } catch (err) {
        res.innerHTML = `<div class="status-message status-error">❌ Fel: ${err.message}</div>`;
        res.classList.remove('hidden');
    } finally {
        if (activeBtn) {
            activeBtn.disabled = false;
            activeBtn.querySelector('.btn-text').style.display = 'inline';
            activeBtn.querySelector('.btn-loading').classList.add('hidden');
        }
        updateMatchKandidatBtn();
    }
}

// ── Save / delete kandidat ────────────────────────────────────────────────────

function autoSaveKandidat() {
    if (!currentKandidatId && !document.getElementById('kand-public-name').value.trim()) return;
    saveKandidat();
}

async function saveKandidat() {
    const public_name = document.getElementById('kand-public-name').value.trim();
    if (!public_name) {
        showKandidatStatus(t('kand.name_required'), 'error');
        return;
    }

    const desired_employment = ['kand-emp-heltid', 'kand-emp-deltid', 'kand-emp-timmar', 'kand-emp-fast', 'kand-emp-konsult']
        .filter(id => document.getElementById(id).checked)
        .map(id => document.getElementById(id).value);

    const desired_workplace = ['kand-wp-plats', 'kand-wp-hybrid', 'kand-wp-distans']
        .filter(id => document.getElementById(id).checked)
        .map(id => document.getElementById(id).value);

    const body = {
        public_name,
        email:              document.getElementById('kand-email').value.trim()         || null,
        public_phone:       document.getElementById('kand-public-phone').value.trim() || null,
        roles:              document.getElementById('kand-roles').value.trim()         || null,
        desired_city:       document.getElementById('kand-city').value.trim()          || null,
        desired_employment,
        desired_workplace,
        personal_qualities:  [..._kandQualities],
        willing_to_commute: document.getElementById('kand-commute').checked,
        searchable:         document.getElementById('kand-searchable').checked,
        available_from:     document.getElementById('kand-available-from').value || null,
    };

    try {
        const url    = currentKandidatId
            ? `${API_BASE_URL}/kandidater/${currentKandidatId}`
            : `${API_BASE_URL}/kandidater/`;
        const method = currentKandidatId ? 'PUT' : 'POST';

        const res = await apiFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }

        const saved = await res.json();
        const isNew = !currentKandidatId;
        currentKandidatId = saved.id;
        document.getElementById('kandidat-form-title').textContent = t('kand.form_title_candidate').replace('{name}', saved.public_name);
        document.getElementById('kand-delete-btn').style.display = '';
        if (saved.profile_uuid) document.getElementById('kand-profile-uuid').value = saved.profile_uuid;
        ['kand-tab-btn-kompetenser', 'kand-tab-btn-erfarenheter',
         'kand-tab-btn-utbildning', 'kand-tab-btn-certifikat', 'kand-tab-btn-cv']
            .forEach(id => { document.getElementById(id).disabled = false; });
        if (isNew) loadDashKandidaterCount();
        showKandidatStatus(t('kand.saved_msg'), 'success');
        const fresh = await cvDb.kandidater.get(currentKandidatId);
        _showKandTimestamps(fresh);
    } catch (err) {
        showKandidatStatus(err.message, 'error');
    }
}

async function deleteKandidat() {
    if (!currentKandidatId) return;
    const name = document.getElementById('kand-public-name').value.trim() || 'kandidaten';
    if (!confirm(t('kand.confirm_delete').replace('%n', name))) return;

    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentKandidatId}`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        showKandidatListPanel();
    } catch (err) {
        showKandidatStatus(err.message, 'error');
    }
}

function showKandidatStatus(msg, type) {
    const el = document.getElementById('kand-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

// ── Kandidat tabs ─────────────────────────────────────────────────────────────

function switchKandidatTab(tab) {
    ['basinfo', 'kompetenser', 'erfarenheter', 'utbildning', 'certifikat', 'cv'].forEach(t => {
        document.getElementById(`kand-tab-${t}`).style.display       = t === tab ? '' : 'none';
        document.getElementById(`kand-tab-btn-${t}`).classList.toggle('active', t === tab);
    });
    if (currentKandidatId) {
        if (tab === 'kompetenser')  loadKandidatBank(currentKandidatId);
        if (tab === 'erfarenheter') loadKandidatBank(currentKandidatId);
        if (tab === 'utbildning')   loadKandidatEducation(currentKandidatId);
        if (tab === 'certifikat')   loadKandidatCertifications(currentKandidatId);
        if (tab === 'cv')           { setupKandidatUpload(); loadKandidatCVs(currentKandidatId); }
    }
}

// ── Kandidat kompetensbank ────────────────────────────────────────────────────

async function loadKandidatBank(kandidatId) {
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/bank`);
        if (!res.ok) return;
        const data = await res.json();
        cachedKandSkills = data.skills || [];
        cachedKandExps   = data.experiences || [];
        kandEditingSkillId = null;
        kandEditingExpId   = null;
        renderKandidatSkills(cachedKandSkills);
        renderKandidatExperiences(cachedKandExps);
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

// ── Personliga egenskaper (kandidat) ─────────────────────────────────────────

function renderKandQualities() {
    const container = document.getElementById('kand-qualities-pills');
    if (!container) return;
    if (_kandQualities.length === 0) {
        container.innerHTML = `<span class="empty-hint" style="padding:0;text-align:left">${t('qualities.empty')}</span>`;
        return;
    }
    container.innerHTML = _kandQualities.map((q, i) => `
        <span class="bank-skill-chip chip-personal">
            ${esc(q)}
            <button class="chip-delete" onclick="removeKandQuality(${i})" title="Ta bort">×</button>
        </span>
    `).join('');
}

async function _saveKandQualities() {
    if (!currentKandidatId) return;
    await apiFetch(`${API_BASE_URL}/kandidater/${currentKandidatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personal_qualities: [..._kandQualities] }),
    });
}

async function addKandQuality(name) {
    const trimmed = name.trim();
    if (!trimmed || _kandQualities.includes(trimmed)) return;
    _kandQualities.push(trimmed);
    renderKandQualities();
    await _saveKandQualities();
}

async function removeKandQuality(index) {
    _kandQualities.splice(index, 1);
    renderKandQualities();
    await _saveKandQualities();
}

function handleKandQualityKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addKandQualityFromInput();
    }
}

async function addKandQualityFromInput() {
    const input = document.getElementById('kand-quality-input');
    if (!input) return;
    const val = input.value.trim();
    if (val) {
        await addKandQuality(val);
        input.value = '';
    }
}

function renderKandidatSkills(skills) {
    const container = document.getElementById('kand-skills-list');
    if (!container) return;

    if (!skills.length) {
        container.innerHTML = `<div class="empty-hint">${t('kand.no_skills')}</div>`;
        return;
    }

    const byCategory = {};
    skills.forEach(s => {
        const cat = s.category || 'Övrigt';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(s);
    });

    const clearBarKandSkills = `<div class="list-clear-bar"><span>${skills.length} ${skills.length !== 1 ? t('kand.skill_plural') : t('kand.skill_singular')}</span><button class="btn btn-danger btn-sm" onclick="clearKandSkills(${currentKandidatId})">${t('sp.clear_all')}</button></div>`;
    const sortedEntries = Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b, currentLang));
    container.innerHTML = clearBarKandSkills + sortedEntries.map(([cat, items]) => { items = items.slice().sort((a, b) => a.skill_name.localeCompare(b.skill_name, currentLang)); return `
        <div style="margin-bottom:1rem">
            <div style="font-size:0.8125rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;
                        letter-spacing:0.05em;margin-bottom:0.5rem">${cat}</div>
            <div class="bank-skills-wrap skill-drop-zone" data-cat-drop-zone="${esc(cat)}">
                ${items.map(s => {
                    if (s.id === kandEditingSkillId) {
                        return `<div class="skill-edit-row">
                            <input class="form-input" id="kand-edit-skill-name" value="${esc(s.skill_name)}" placeholder="${t('bank.label_skill')}" style="flex:1;min-width:120px">
                            <input class="form-input" id="kand-edit-skill-cat"  value="${esc(s.category)}"   placeholder="${t('bank.label_category')}" style="flex:1;min-width:100px" data-cat-combo>
                            <select class="form-input" id="kand-edit-skill-level" style="min-width:130px">
                                <option value=""               ${!s.skill_level                    ?'selected':''}>${t('skill.level_ph')}</option>
                                <option value="Känner till"    ${s.skill_level==='Känner till'    ?'selected':''}>${t('skill.level_1')}</option>
                                <option value="Erfaren"        ${s.skill_level==='Erfaren'        ?'selected':''}>${t('skill.level_2')}</option>
                                <option value="Mycket erfaren" ${s.skill_level==='Mycket erfaren' ?'selected':''}>${t('skill.level_3')}</option>
                            </select>
                            <button class="btn btn-primary btn-small" onclick="saveKandSkill(${s.id})">${t('common.save')}</button>
                            <button class="btn btn-secondary btn-small" onclick="kandEditingSkillId=null;renderKandidatSkills(cachedKandSkills)">${t('common.cancel')}</button>
                        </div>`;
                    }
                    return `<span class="bank-skill-chip ${skillLevelClass(s.skill_level)}" draggable="true" data-skill-id="${s.id}" data-skill-cat="${esc(cat)}">
                        ${esc(s.skill_name)}
                        <button class="chip-delete" style="font-size:0.85em;padding:0 1px 0 3px" onclick="kandEditingSkillId=${s.id};renderKandidatSkills(cachedKandSkills)" title="${t('action.edit')}">✎</button>
                        <button class="chip-delete" onclick="deleteKandidatSkill(${s.id})" title="${t('action.delete')}">×</button>
                    </span>`;
                }).join('')}
            </div>
        </div>
    `; }).join('');
    setupSkillDragDrop(container, async (skillId, newCat) => {
        const skill = cachedKandSkills.find(s => s.id === skillId);
        if (!skill) return;
        await apiFetch(`${API_BASE_URL}/kandidater/${currentKandidatId}/skills/${skillId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skill_name: skill.skill_name, category: newCat, skill_level: skill.skill_level }),
        });
        await loadKandidatBank(currentKandidatId);
    });
}

async function saveKandSkill(id) {
    if (!currentKandidatId) return;
    const body = {
        skill_name: document.getElementById('kand-edit-skill-name').value.trim(),
        category:   document.getElementById('kand-edit-skill-cat').value.trim()  || 'Övrigt',
        skill_level: document.getElementById('kand-edit-skill-level').value || null,
    };
    if (!body.skill_name) { alert(t('kand.skill_name_required2')); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentKandidatId}/bank/skills/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        kandEditingSkillId = null;
        await loadKandidatBank(currentKandidatId);
    } catch (err) { alert(err.message); }
}

async function addKandidatSkill() {
    if (!currentKandidatId) return;
    const nameEl = document.getElementById('kand-skill-name');
    const catEl  = document.getElementById('kand-skill-category');
    const name   = nameEl.value.trim();
    if (!name) { showKandidatBankStatus(t('kand.skill_name_required'), 'error'); return; }

    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentKandidatId}/bank/skills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                skill_name:  name,
                category:    catEl.value.trim() || 'Övrigt',
                skill_level: document.getElementById('kand-skill-level').value || null,
            }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        nameEl.value = '';
        catEl.value  = '';
        document.getElementById('kand-skill-level').value = '';
        showKandidatBankStatus(t('kand.skill_added'), 'success');
        loadKandidatBank(currentKandidatId);
        touchKandidat();
    } catch (err) {
        showKandidatBankStatus(err.message, 'error');
    }
}

async function deleteKandidatSkill(skillId) {
    if (!currentKandidatId) return;
    try {
        const res = await apiFetch(
            `${API_BASE_URL}/kandidater/${currentKandidatId}/bank/skills/${skillId}`,
            { method: 'DELETE' }
        );
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        loadKandidatBank(currentKandidatId);
        touchKandidat();
    } catch (err) {
        showKandidatBankStatus(err.message, 'error');
    }
}

function showKandidatBankStatus(msg, type) {
    const el = document.getElementById('kand-bank-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

function showKandidatUploadStatus(msg, type) {
    const el = document.getElementById('kand-upload-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    if (type !== 'loading') setTimeout(() => { el.textContent = ''; el.className = ''; }, 5000);
}

// ── Kandidat CV upload ────────────────────────────────────────────────────────

function setupKandidatUpload() {
    if (kandUploadSetup) return;
    kandUploadSetup = true;
    setupUploadZone({
        areaId:   'kand-upload-area',
        inputId:  'kand-cv-upload',
        onFile:   handleKandidatCVUpload,
        statusFn: showKandidatUploadStatus,
    });
}

async function handleKandidatCVUpload(file) {
    if (!currentKandidatId) return;

    showKandidatUploadStatus(`⏳ ${t('cv.loading')}`, 'loading');

    try {
        const raw = await cvPdf.extractText(file);
        const stripped = stripContactInfo(raw);
        showKandidatUploadStatus('', '');

        showCVReviewModal(stripped, file.name, async (reviewedText) => {
            showKandidatUploadStatus(`⏳ ${t('cv.analysing_ai')}`, 'loading');
            const formData = new FormData();
            formData.append('file', file);
            formData.append('reviewed_text', reviewedText);
            try {
                const res = await apiFetch(
                    `${API_BASE_URL}/kandidater/${currentKandidatId}/bank/upload-cv`,
                    { method: 'POST', body: formData }
                );
                if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel vid uppladdning'); }
                const data = await res.json();
                showKandidatUploadStatus(
                    `✅ ${t('kand.cv_upload_result').replace('{filename}', data.filename || file.name).replace('{skills}', data.skill_count).replace('{exps}', data.experience_count)}`,
                    'success'
                );
                await loadKandidatBank(currentKandidatId);
                await loadKandidatEducation(currentKandidatId);
                await loadKandidatCertifications(currentKandidatId);
                loadKandidatCVs(currentKandidatId);
                touchKandidat();
            } catch (err) {
                showKandidatUploadStatus(`❌ ${err.message}`, 'error');
            }
        });
    } catch (err) {
        showKandidatUploadStatus(`❌ ${err.message}`, 'error');
    }
}

// ── Kandidat erfarenheter ─────────────────────────────────────────────────────

function renderKandidatExperiences(experiences) {
    const container = document.getElementById('kand-experiences-list');
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
    const clearBarKandExp = `<div class="list-clear-bar"><span>${experiences.length} ${experiences.length !== 1 ? t('kand.exp_plural') : t('kand.exp_singular')}</span><button class="btn btn-danger btn-sm" onclick="clearKandExperiences(${currentKandidatId})">${t('sp.clear_all')}</button></div>`;
    container.innerHTML = clearBarKandExp + experiences.map(e => {
        if (e.id === kandEditingExpId) {
            const achText = (e.achievements || []).join('\n');
            return `<div style="border:1px solid var(--blue);border-radius:var(--radius);padding:0.875rem 1rem;margin-bottom:0.75rem">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem">
                    <input class="form-input" id="kand-edit-exp-title" value="${esc(e.title)}" placeholder="${t('bank.label_title')}" style="grid-column:span 2">
                    <input class="form-input" id="kand-edit-exp-org"   value="${esc(e.organization)}" placeholder="${t('bank.label_org')}">
                    <select class="form-input" id="kand-edit-exp-type">
                        <option value="work"    ${sel(e.experience_type,'work')}   >${t('kand.type_work')}</option>
                        <option value="project" ${sel(e.experience_type,'project')}>${t('kand.type_project')}</option>
                    </select>
                    <input class="form-input" id="kand-edit-exp-start" value="${esc(e.start_date)}" placeholder="${t('bank.label_start_date')}">
                    <input class="form-input" id="kand-edit-exp-end"   value="${esc(e.end_date)}"   placeholder="${t('bank.label_end_date')}">
                </div>
                <label style="font-size:0.8125rem;display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem">
                    <input type="checkbox" id="kand-edit-exp-current" ${e.is_current?'checked':''}> ${t('kand.ongoing')}
                </label>
                <textarea class="form-input" id="kand-edit-exp-desc" placeholder="${t('bank.label_desc')}" rows="3" style="margin-bottom:0.5rem;width:100%;box-sizing:border-box">${esc(e.description)}</textarea>
                <label style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.25rem;display:block">${t('kand.achievements_label')}</label>
                <textarea class="form-input" id="kand-edit-exp-ach" placeholder="${t('bank.new_ach_ph')}" rows="3" style="margin-bottom:0.5rem;width:100%;box-sizing:border-box">${esc(achText)}</textarea>
                <div style="display:flex;gap:0.5rem">
                    <button class="btn btn-primary btn-small" onclick="saveKandExperience(${e.id})">${t('common.save')}</button>
                    <button class="btn btn-secondary btn-small" onclick="kandEditingExpId=null;renderKandidatExperiences(cachedKandExps)">${t('common.cancel')}</button>
                </div>
            </div>`;
        }
        const period = [normDate(e.start_date), e.is_current ? t('kand.now') : normDate(e.end_date)].filter(Boolean).join(' – ');
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
                    <button class="btn-icon" onclick="kandEditingExpId=${e.id};renderKandidatExperiences(cachedKandExps)" title="${t('action.edit')}">✎</button>
                    <button class="btn-icon btn-icon-danger" onclick="deleteKandExperience(${e.id})" title="${t('action.delete')}">&times;</button>
                </div>
            </div>
            ${e.description ? `<div class="exp-card-desc">${esc(e.description)}</div>` : ''}
            ${achHtml}
        </div>`;
    }).join('');
}

async function saveKandExperience(id) {
    if (!currentKandidatId) return;
    const body = {
        title:           document.getElementById('kand-edit-exp-title').value.trim(),
        organization:    document.getElementById('kand-edit-exp-org').value.trim()   || null,
        experience_type: document.getElementById('kand-edit-exp-type').value,
        start_date:      normDate(document.getElementById('kand-edit-exp-start').value.trim()),
        end_date:        normDate(document.getElementById('kand-edit-exp-end').value.trim()),
        is_current:      document.getElementById('kand-edit-exp-current').checked,
        description:     document.getElementById('kand-edit-exp-desc').value.trim() || null,
        achievements:    document.getElementById('kand-edit-exp-ach').value.split('\n').map(s=>s.trim()).filter(Boolean),
    };
    if (!body.title) { alert(t('kand.title_required')); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentKandidatId}/bank/experiences/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        kandEditingExpId = null;
        await loadKandidatBank(currentKandidatId);
    } catch (err) { alert(err.message); }
}

async function deleteKandExperience(id) {
    if (!currentKandidatId || !confirm(t('kand.confirm_delete_exp'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentKandidatId}/bank/experiences/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadKandidatBank(currentKandidatId);
        touchKandidat();
    } catch (err) { alert(err.message); }
}

async function addKandidatExperience() {
    if (!currentKandidatId) return;
    const title = document.getElementById('kand-exp-title').value.trim();
    if (!title) { showKandExpStatus(t('kand.title_required'), 'error'); return; }
    const body = {
        title,
        organization:    document.getElementById('kand-exp-org').value.trim()   || null,
        experience_type: document.getElementById('kand-exp-type').value,
        start_date:      normDate(document.getElementById('kand-exp-start').value.trim()),
        end_date:        normDate(document.getElementById('kand-exp-end').value.trim()),
        is_current:      document.getElementById('kand-exp-current').checked,
        description:     document.getElementById('kand-exp-desc').value.trim() || null,
        achievements:    document.getElementById('kand-exp-ach').value.split('\n').map(s => s.trim()).filter(Boolean),
    };
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentKandidatId}/bank/experiences`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        ['kand-exp-title','kand-exp-org','kand-exp-start','kand-exp-end','kand-exp-desc','kand-exp-ach'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('kand-exp-current').checked = false;
        showKandExpStatus(t('kand.exp_added'), 'success');
        await loadKandidatBank(currentKandidatId);
        touchKandidat();
    } catch (err) { showKandExpStatus(err.message, 'error'); }
}

function showKandExpStatus(msg, type) {
    const el = document.getElementById('kand-exp-status');
    if (!el) return;
    el.textContent = msg;
    el.className = type === 'error' ? 'form-error' : 'form-success';
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 3000);
}

// ── Clear all (bulk delete) ───────────────────────────────────────────────────

async function clearKandSkills(kandidatId) {
    if (!confirm(t('kand.confirm_clear_skills'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/bank/skills`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadKandidatBank(kandidatId);
        touchKandidat();
    } catch (err) { alert(err.message); }
}

async function clearKandExperiences(kandidatId) {
    if (!confirm(t('kand.confirm_clear_exps'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/bank/experiences`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadKandidatBank(kandidatId);
        touchKandidat();
    } catch (err) { alert(err.message); }
}

async function clearKandEducation(kandidatId) {
    if (!confirm(t('kand.confirm_clear_edu'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/education`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadKandidatEducation(kandidatId);
    } catch (err) { alert(err.message); }
}

async function clearKandCertifications(kandidatId) {
    if (!confirm(t('kand.confirm_clear_certs'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/certifications`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadKandidatCertifications(kandidatId);
    } catch (err) { alert(err.message); }
}

// ── Kandidat CV list ──────────────────────────────────────────────────────────

async function loadKandidatCVs(kandidatId) {
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/cvs`);
        if (!res.ok) return;
        kandCandidateCVs = await res.json();
        displayKandidatCVs(kandCandidateCVs, kandidatId);
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function displayKandidatCVs(cvs, kandidatId) {
    const container = document.getElementById('kand-cv-list');
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
            ? `<span class="cv-badge cv-badge--green">✓ ${t('cv.badge_processed')}</span>`
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
                        <button class="btn btn-icon btn-danger btn-sm" title="${t('cv.btn_delete')}" onclick="deleteKandidatCV(${cv.id}, ${kandidatId}, '${safeName}')">
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


async function deleteKandidatCV(cvId, kandidatId, filename) {
    if (!confirm(t('kand.confirm_delete_cv').replace('%n', filename))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/cvs/${cvId}`, { method:'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadKandidatCVs(kandidatId);
        touchKandidat();
    } catch (err) { alert(`❌ ${err.message}`); }
}

// ── Kandidat utbildning ───────────────────────────────────────────────────────

async function loadKandidatEducation(kandidatId) {
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/education`);
        if (!res.ok) return;
        const data = await res.json();
        cachedKandEdu = data.education || [];
        kandEditingEduId = null;
        renderKandidatEducation(cachedKandEdu, kandidatId);
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function renderKandidatEducation(items, kandidatId) {
    const container = document.getElementById('kand-education-list');
    if (!container) return;
    if (!items.length) {
        container.innerHTML = `<div class="empty-hint">${t('kand.no_edu')}</div>`;
        return;
    }
    const clearBarKandEdu = `<div class="list-clear-bar"><span>${items.length} ${items.length !== 1 ? t('kand.edu_plural') : t('kand.edu_singular')}</span><button class="btn btn-danger btn-sm" onclick="clearKandEducation(${kandidatId})">${t('sp.clear_all')}</button></div>`;
    container.innerHTML = clearBarKandEdu + items.map(e => {
        if (e.id === kandEditingEduId) {
            return `<div style="border:1px solid var(--blue);border-radius:var(--radius);padding:0.875rem 1rem;margin-bottom:0.75rem">
                <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.5rem">
                    <input class="form-input" id="kand-edit-edu-degree"      value="${esc(e.degree)}"         placeholder="Examen / Utbildning" required>
                    <input class="form-input" id="kand-edit-edu-institution"  value="${esc(e.institution)}"    placeholder="Lärosäte">
                    <input class="form-input" id="kand-edit-edu-field"        value="${esc(e.field_of_study)}" placeholder="Ämne / Inriktning">
                    <div style="display:flex;gap:0.5rem">
                        <input class="form-input" id="kand-edit-edu-start" value="${esc(e.start_date)}" placeholder="Från (ÅÅÅÅ-MM)" style="flex:1">
                        <input class="form-input" id="kand-edit-edu-end"   value="${esc(e.end_date)}"   placeholder="Till (ÅÅÅÅ-MM)" style="flex:1">
                    </div>
                    <textarea class="form-input" id="kand-edit-edu-desc" placeholder="Beskrivning" rows="2">${esc(e.description)}</textarea>
                </div>
                <div style="display:flex;gap:0.5rem">
                    <button class="btn btn-primary btn-small" onclick="saveKandEducation(${e.id},${kandidatId})">${t('common.save')}</button>
                    <button class="btn btn-secondary btn-small" onclick="kandEditingEduId=null;renderKandidatEducation(cachedKandEdu,${kandidatId})">${t('common.cancel')}</button>
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
                <button class="btn-icon" onclick="kandEditingEduId=${e.id};renderKandidatEducation(cachedKandEdu,${kandidatId})" title="${t('action.edit')}">✎</button>
                <button class="btn-icon btn-icon-danger" onclick="deleteKandidatEducation(${e.id},${kandidatId})" title="${t('action.delete')}">&times;</button>
            </div>
        </div>`;
    }).join('');
}

async function saveKandEducation(id, kandidatId) {
    const body = {
        degree:         document.getElementById('kand-edit-edu-degree').value.trim(),
        institution:    document.getElementById('kand-edit-edu-institution').value.trim() || null,
        field_of_study: document.getElementById('kand-edit-edu-field').value.trim()       || null,
        start_date:     document.getElementById('kand-edit-edu-start').value.trim()       || null,
        end_date:       document.getElementById('kand-edit-edu-end').value.trim()         || null,
        description:    document.getElementById('kand-edit-edu-desc').value.trim()        || null,
    };
    if (!body.degree) { showKandEduStatus(t('kand.degree_required'), 'error'); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/education/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        kandEditingEduId = null;
        showKandEduStatus(t('kand.edu_saved'), 'success');
        await loadKandidatEducation(kandidatId);
    } catch (err) { showKandEduStatus(err.message, 'error'); }
}

async function addKandidatEducation() {
    if (!currentKandidatId) return;
    const degree = document.getElementById('kand-edu-degree').value.trim();
    if (!degree) { showKandEduStatus(t('kand.degree_required'), 'error'); return; }
    const body = {
        degree,
        institution:    document.getElementById('kand-edu-institution').value.trim() || null,
        field_of_study: document.getElementById('kand-edu-field').value.trim()       || null,
        start_date:     document.getElementById('kand-edu-start').value.trim()       || null,
        end_date:       document.getElementById('kand-edu-end').value.trim()         || null,
    };
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentKandidatId}/education`, {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        ['kand-edu-degree','kand-edu-institution','kand-edu-field','kand-edu-start','kand-edu-end']
            .forEach(id => document.getElementById(id).value = '');
        showKandEduStatus(t('kand.edu_added'), 'success');
        await loadKandidatEducation(currentKandidatId);
        touchKandidat();
    } catch (err) { showKandEduStatus(err.message, 'error'); }
}

async function deleteKandidatEducation(id, kandidatId) {
    if (!confirm(t('kand.confirm_delete_edu'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/education/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadKandidatEducation(kandidatId);
        touchKandidat();
    } catch (err) { alert(err.message); }
}

function showKandEduStatus(msg, type) {
    const el = document.getElementById('kand-edu-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}

// ── Kandidat certifieringar ───────────────────────────────────────────────────

async function loadKandidatCertifications(kandidatId) {
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/certifications`);
        if (!res.ok) return;
        const data = await res.json();
        cachedKandCerts = data.certifications || [];
        kandEditingCertId = null;
        renderKandidatCertifications(cachedKandCerts, kandidatId);
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function renderKandidatCertifications(items, kandidatId) {
    const container = document.getElementById('kand-certifications-list');
    if (!container) return;
    if (!items.length) {
        container.innerHTML = `<div class="empty-hint">${t('kand.no_cert')}</div>`;
        return;
    }
    const clearBarKandCert = `<div class="list-clear-bar"><span>${items.length} ${t('kand.cert_word')}</span><button class="btn btn-danger btn-sm" onclick="clearKandCertifications(${kandidatId})">${t('sp.clear_all')}</button></div>`;
    container.innerHTML = clearBarKandCert + items.map(c => {
        if (c.id === kandEditingCertId) {
            return `<div style="border:1px solid var(--blue);border-radius:var(--radius);padding:0.875rem 1rem;margin-bottom:0.75rem">
                <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.5rem">
                    <input class="form-input" id="kand-edit-cert-name"   value="${esc(c.name)}"   placeholder="Kurs / Certifikat" required>
                    <input class="form-input" id="kand-edit-cert-issuer" value="${esc(c.issuer)}" placeholder="Utfärdare">
                    <input class="form-input" id="kand-edit-cert-date"   value="${esc(c.date)}"   placeholder="Datum (ÅÅÅÅ-MM)">
                    <textarea class="form-input" id="kand-edit-cert-desc" placeholder="Beskrivning" rows="2">${esc(c.description)}</textarea>
                </div>
                <div style="display:flex;gap:0.5rem">
                    <button class="btn btn-primary btn-small" onclick="saveKandCertification(${c.id},${kandidatId})">${t('common.save')}</button>
                    <button class="btn btn-secondary btn-small" onclick="kandEditingCertId=null;renderKandidatCertifications(cachedKandCerts,${kandidatId})">${t('common.cancel')}</button>
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
                <button class="btn-icon" onclick="kandEditingCertId=${c.id};renderKandidatCertifications(cachedKandCerts,${kandidatId})" title="${t('action.edit')}">✎</button>
                <button class="btn-icon btn-icon-danger" onclick="deleteKandidatCertification(${c.id},${kandidatId})" title="${t('action.delete')}">&times;</button>
            </div>
        </div>`;
    }).join('');
}

async function saveKandCertification(id, kandidatId) {
    const body = {
        name:        document.getElementById('kand-edit-cert-name').value.trim(),
        issuer:      document.getElementById('kand-edit-cert-issuer').value.trim() || null,
        date:        document.getElementById('kand-edit-cert-date').value.trim()   || null,
        description: document.getElementById('kand-edit-cert-desc').value.trim()  || null,
    };
    if (!body.name) { showKandCertStatus(t('kand.cert_name_required'), 'error'); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/certifications/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        kandEditingCertId = null;
        showKandCertStatus(t('kand.cert_saved'), 'success');
        await loadKandidatCertifications(kandidatId);
    } catch (err) { showKandCertStatus(err.message, 'error'); }
}

async function addKandidatCertification() {
    if (!currentKandidatId) return;
    const name = document.getElementById('kand-cert-name').value.trim();
    if (!name) { showKandCertStatus(t('kand.cert_name_required'), 'error'); return; }
    const body = {
        name,
        issuer:      document.getElementById('kand-cert-issuer').value.trim() || null,
        date:        document.getElementById('kand-cert-date').value.trim()   || null,
        description: document.getElementById('kand-cert-desc').value.trim()  || null,
    };
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentKandidatId}/certifications`, {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        ['kand-cert-name','kand-cert-issuer','kand-cert-date','kand-cert-desc'].forEach(id => document.getElementById(id).value = '');
        showKandCertStatus(t('kand.cert_added'), 'success');
        await loadKandidatCertifications(currentKandidatId);
        touchKandidat();
    } catch (err) { showKandCertStatus(err.message, 'error'); }
}

async function deleteKandidatCertification(id, kandidatId) {
    if (!confirm(t('kand.confirm_delete_cert'))) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/certifications/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadKandidatCertifications(kandidatId);
        touchKandidat();
    } catch (err) { alert(err.message); }
}

function showKandCertStatus(msg, type) {
    const el = document.getElementById('kand-cert-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}
