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
        container.innerHTML = '<div class="empty-hint">Inga kandidater ännu. Klicka "+ Lägg till kandidat" för att komma igång.</div>';
        return;
    }

    const countBar = `<div class="list-clear-bar"><span>${kandidater.length} kandidat${kandidater.length !== 1 ? 'er' : ''}</span></div>`;
    container.innerHTML = countBar + kandidater.map(k => {
        const meta = [
            k.roles                     ? k.roles                            : null,
            k.desired_city              ? k.desired_city                     : null,
            k.desired_employment.length ? k.desired_employment.join(', ')    : null,
            k.desired_workplace.length  ? k.desired_workplace.join(', ')     : null,
        ].filter(Boolean).join(' · ');
        const safeName = esc(k.public_name || '(Inget namn)');

        return `
        <div class="cv-item" onclick="editKandidatById(${k.id})" style="cursor:pointer">
            <div class="cv-item-info">
                <div class="cv-item-name">${safeName}</div>
                ${meta ? `<div class="cv-item-meta">${meta}</div>` : ''}
            </div>
            <div class="cv-item-actions">
                ${k.searchable ? '<span class="cv-item-badge" style="background:var(--success-bg);color:var(--success)">Sökbar</span>' : ''}
                <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); editKandidatById(${k.id})">Redigera</button>
                <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteKandidatFromList(${k.id}, '${safeName}')">Ta bort</button>
            </div>
        </div>`;
    }).join('');
}

function editKandidatById(id) {
    const kandidat = kandidaterCache.find(k => k.id === id);
    if (kandidat) showKandidatForm(kandidat);
}

async function deleteKandidatFromList(id, name) {
    if (!confirm(`Ta bort "${name}"? All data för kandidaten raderas och kan inte återställas.`)) return;
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
        kandidat ? `Kandidat: ${kandidat.public_name}` : 'Lägg till kandidat';

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

    document.getElementById('kand-commute').checked    = kandidat?.willing_to_commute || false;
    document.getElementById('kand-searchable').checked = kandidat?.searchable         || false;
    document.getElementById('kand-available-from').value = kandidat?.available_from   || '';

    document.getElementById('kand-delete-btn').style.display = kandidat ? '' : 'none';
    document.getElementById('kand-status').textContent = '';

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

async function loadMatchKandidatView() {
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/`);
        if (!res.ok) return;
        const data = await res.json();
        const sel = document.getElementById('mk-kandidat-select');
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">– Välj kandidat –</option>' +
            (data.kandidater || []).map(k => {
                const name  = k.public_name || '(Inget namn)';
                const label = k.roles ? `${name} (${k.roles})` : name;
                return `<option value="${k.id}"${k.id == current ? ' selected' : ''}>${label}</option>`;
            }).join('');
        updateMatchKandidatBtn();
    } catch (err) {
        if (err.message !== 'Inte inloggad') console.error(err);
    }
}

function updateMatchKandidatBtn() {
    const sel  = document.getElementById('mk-kandidat-select');
    const txt  = document.getElementById('mk-job-description');
    const btn  = document.getElementById('mk-match-btn');
    if (btn) btn.disabled = !sel?.value || !txt?.value.trim();
}

async function matchKandidatJob() {
    const sel  = document.getElementById('mk-kandidat-select');
    const txt  = document.getElementById('mk-job-description');
    const btn  = document.getElementById('mk-match-btn');
    const res  = document.getElementById('mk-result');

    const kandidatId = sel?.value;
    const jobDesc    = txt?.value.trim();
    if (!kandidatId || !jobDesc) return;

    btn.disabled = true;
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.btn-loading').classList.remove('hidden');
    res.classList.add('hidden');

    try {
        const response = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/match-job`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_title: '', job_description: jobDesc }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Matchning misslyckades');
        }

        const result = await response.json();
        lastMatchResult     = result;
        lastJobDesc         = jobDesc;
        lastMatchKandidatId = Number(kandidatId);
        displayMatchResult(result, res);
        setTimeout(() => res.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    } catch (err) {
        res.innerHTML = `<div class="status-message status-error">❌ Fel: ${err.message}</div>`;
        res.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.querySelector('.btn-text').style.display = 'inline';
        btn.querySelector('.btn-loading').classList.add('hidden');
        updateMatchKandidatBtn();
    }
}

// ── Save / delete kandidat ────────────────────────────────────────────────────

async function saveKandidat() {
    const public_name = document.getElementById('kand-public-name').value.trim();
    if (!public_name) {
        showKandidatStatus('Namn är obligatoriskt', 'error');
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
        document.getElementById('kandidat-form-title').textContent = `Kandidat: ${saved.public_name}`;
        document.getElementById('kand-delete-btn').style.display = '';
        ['kand-tab-btn-kompetenser', 'kand-tab-btn-erfarenheter',
         'kand-tab-btn-utbildning', 'kand-tab-btn-certifikat', 'kand-tab-btn-cv']
            .forEach(id => { document.getElementById(id).disabled = false; });
        if (isNew) loadDashKandidaterCount();
        showKandidatStatus('Kandidat sparad', 'success');
    } catch (err) {
        showKandidatStatus(err.message, 'error');
    }
}

async function deleteKandidat() {
    if (!currentKandidatId) return;
    const name = document.getElementById('kand-public-name').value.trim() || 'kandidaten';
    if (!confirm(`Ta bort "${name}"? Detta kan inte ångras.`)) return;

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

function renderKandidatSkills(skills) {
    const container = document.getElementById('kand-skills-list');
    if (!container) return;

    if (!skills.length) {
        container.innerHTML = '<div class="empty-hint">Inga kompetenser tillagda ännu.</div>';
        return;
    }

    const byCategory = {};
    skills.forEach(s => {
        const cat = s.category || 'Övrigt';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(s);
    });

    const typeClass = t => t === 'soft' ? 'chip-soft' : t === 'language' ? 'chip-language' : 'chip-technical';
    const clearBarKandSkills = `<div class="list-clear-bar"><span>${skills.length} kompetens${skills.length !== 1 ? 'er' : ''}</span><button class="btn btn-danger btn-sm" onclick="clearKandSkills(${currentKandidatId})">Rensa alla</button></div>`;
    container.innerHTML = clearBarKandSkills + Object.entries(byCategory).map(([cat, items]) => `
        <div style="margin-bottom:1rem">
            <div style="font-size:0.8125rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;
                        letter-spacing:0.05em;margin-bottom:0.5rem">${cat}</div>
            <div class="bank-skills-wrap">
                ${items.map(s => {
                    if (s.id === kandEditingSkillId) {
                        return `<div class="skill-edit-row">
                            <input class="form-input" id="kand-edit-skill-name" value="${esc(s.skill_name)}" placeholder="Kompetensnamn" style="flex:1;min-width:120px">
                            <input class="form-input" id="kand-edit-skill-cat"  value="${esc(s.category)}"   placeholder="Kategori"      style="flex:1;min-width:100px">
                            <select class="form-input" id="kand-edit-skill-type" style="min-width:110px">
                                <option value="technical" ${s.skill_type==='technical'?'selected':''}>Teknisk</option>
                                <option value="soft"      ${s.skill_type==='soft'     ?'selected':''}>Mjuk</option>
                                <option value="language"  ${s.skill_type==='language' ?'selected':''}>Språk</option>
                                <option value="tool"      ${s.skill_type==='tool'     ?'selected':''}>Verktyg</option>
                            </select>
                            <button class="btn btn-primary btn-small" onclick="saveKandSkill(${s.id})">Spara</button>
                            <button class="btn btn-secondary btn-small" onclick="kandEditingSkillId=null;renderKandidatSkills(cachedKandSkills)">Avbryt</button>
                        </div>`;
                    }
                    return `<span class="bank-skill-chip ${typeClass(s.skill_type)}">
                        ${esc(s.skill_name)}
                        <button class="chip-delete" style="font-size:0.85em;padding:0 1px 0 3px" onclick="kandEditingSkillId=${s.id};renderKandidatSkills(cachedKandSkills)" title="Redigera">✎</button>
                        <button class="chip-delete" onclick="deleteKandidatSkill(${s.id})" title="Ta bort">×</button>
                    </span>`;
                }).join('')}
            </div>
        </div>
    `).join('');
}

async function saveKandSkill(id) {
    if (!currentKandidatId) return;
    const body = {
        skill_name: document.getElementById('kand-edit-skill-name').value.trim(),
        category:   document.getElementById('kand-edit-skill-cat').value.trim()  || 'Övrigt',
        skill_type: document.getElementById('kand-edit-skill-type').value,
    };
    if (!body.skill_name) { alert('Kompetensnamn krävs'); return; }
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
    if (!name) { showKandidatBankStatus('Ange ett kompetensnamn', 'error'); return; }

    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentKandidatId}/bank/skills`, {
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
        showKandidatBankStatus('Kompetens tillagd', 'success');
        loadKandidatBank(currentKandidatId);
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

    const area  = document.getElementById('kand-upload-area');
    const input = document.getElementById('kand-cv-upload');
    if (!area || !input) return;

    area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', ()  => area.classList.remove('drag-over'));
    area.addEventListener('drop', e => {
        e.preventDefault();
        area.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleKandidatCVUpload(file);
    });
    input.addEventListener('change', () => {
        if (input.files[0]) handleKandidatCVUpload(input.files[0]);
        input.value = '';
    });
}

async function handleKandidatCVUpload(file) {
    if (!currentKandidatId) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        showKandidatUploadStatus('Endast PDF-filer är tillåtna', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showKandidatUploadStatus('Filen är för stor (max 10 MB)', 'error');
        return;
    }

    showKandidatUploadStatus('⏳ Analyserar CV...', 'loading');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await apiFetch(
            `${API_BASE_URL}/kandidater/${currentKandidatId}/bank/upload-cv`,
            { method: 'POST', body: formData }
        );
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel vid uppladdning'); }
        const data = await res.json();
        showKandidatUploadStatus(
            `✅ ${data.filename || file.name} — ${data.skill_count} kompetenser, ${data.experience_count} erfarenheter tillagda`,
            'success'
        );
        loadKandidatBank(currentKandidatId);
        loadKandidatCVs(currentKandidatId);
    } catch (err) {
        showKandidatUploadStatus(`❌ ${err.message}`, 'error');
    }
}

// ── Kandidat erfarenheter ─────────────────────────────────────────────────────

function renderKandidatExperiences(experiences) {
    const container = document.getElementById('kand-experiences-list');
    if (!container) return;

    if (!experiences || !experiences.length) {
        container.innerHTML = '<div class="empty-hint">Inga erfarenheter tillagda ännu.</div>';
        return;
    }

    const typeLabel = { work: 'Arbete', education: 'Utbildning', certification: 'Certifiering', project: 'Projekt' };
    const sel = (val, opt) => opt === val ? 'selected' : '';
    const clearBarKandExp = `<div class="list-clear-bar"><span>${experiences.length} erfarenhet${experiences.length !== 1 ? 'er' : ''}</span><button class="btn btn-danger btn-sm" onclick="clearKandExperiences(${currentKandidatId})">Rensa alla</button></div>`;
    container.innerHTML = clearBarKandExp + experiences.map(e => {
        if (e.id === kandEditingExpId) {
            const achText = (e.achievements || []).join('\n');
            return `<div style="border:1px solid var(--blue);border-radius:var(--radius);padding:0.875rem 1rem;margin-bottom:0.75rem">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:0.5rem">
                    <input class="form-input" id="kand-edit-exp-title" value="${esc(e.title)}" placeholder="Titel" style="grid-column:span 2">
                    <input class="form-input" id="kand-edit-exp-org"   value="${esc(e.organization)}" placeholder="Organisation">
                    <select class="form-input" id="kand-edit-exp-type">
                        <option value="work"    ${sel(e.experience_type,'work')}   >Arbete</option>
                        <option value="project" ${sel(e.experience_type,'project')}>Projekt</option>
                    </select>
                    <input class="form-input" id="kand-edit-exp-start" value="${esc(e.start_date)}" placeholder="Från (ÅÅÅÅ-MM)">
                    <input class="form-input" id="kand-edit-exp-end"   value="${esc(e.end_date)}"   placeholder="Till (ÅÅÅÅ-MM)">
                </div>
                <label style="font-size:0.8125rem;display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem">
                    <input type="checkbox" id="kand-edit-exp-current" ${e.is_current?'checked':''}> Pågående
                </label>
                <textarea class="form-input" id="kand-edit-exp-desc" placeholder="Beskrivning" rows="3" style="margin-bottom:0.5rem;width:100%;box-sizing:border-box">${esc(e.description)}</textarea>
                <label style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.25rem;display:block">Prestationer (en per rad)</label>
                <textarea class="form-input" id="kand-edit-exp-ach" placeholder="En prestation per rad" rows="3" style="margin-bottom:0.5rem;width:100%;box-sizing:border-box">${esc(achText)}</textarea>
                <div style="display:flex;gap:0.5rem">
                    <button class="btn btn-primary btn-small" onclick="saveKandExperience(${e.id})">Spara</button>
                    <button class="btn btn-secondary btn-small" onclick="kandEditingExpId=null;renderKandidatExperiences(cachedKandExps)">Avbryt</button>
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
                    <button class="btn-icon" onclick="kandEditingExpId=${e.id};renderKandidatExperiences(cachedKandExps)" title="Redigera">✎</button>
                    <button class="btn-icon btn-icon-danger" onclick="deleteKandExperience(${e.id})" title="Ta bort">&times;</button>
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
        start_date:      document.getElementById('kand-edit-exp-start').value.trim() || null,
        end_date:        document.getElementById('kand-edit-exp-end').value.trim()   || null,
        is_current:      document.getElementById('kand-edit-exp-current').checked,
        description:     document.getElementById('kand-edit-exp-desc').value.trim() || null,
        achievements:    document.getElementById('kand-edit-exp-ach').value.split('\n').map(s=>s.trim()).filter(Boolean),
    };
    if (!body.title) { alert('Titel krävs'); return; }
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
    if (!currentKandidatId || !confirm('Ta bort erfarenheten?')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentKandidatId}/bank/experiences/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadKandidatBank(currentKandidatId);
    } catch (err) { alert(err.message); }
}

// ── Clear all (bulk delete) ───────────────────────────────────────────────────

async function clearKandSkills(kandidatId) {
    if (!confirm('Radera alla kompetenser för kandidaten? Detta kan inte ångras.')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/bank/skills`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadKandidatBank(kandidatId);
    } catch (err) { alert(err.message); }
}

async function clearKandExperiences(kandidatId) {
    if (!confirm('Radera alla erfarenheter för kandidaten? Detta kan inte ångras.')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/bank/experiences`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadKandidatBank(kandidatId);
    } catch (err) { alert(err.message); }
}

async function clearKandEducation(kandidatId) {
    if (!confirm('Radera all utbildning för kandidaten? Detta kan inte ångras.')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/education`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadKandidatEducation(kandidatId);
    } catch (err) { alert(err.message); }
}

async function clearKandCertifications(kandidatId) {
    if (!confirm('Radera alla certifikat för kandidaten? Detta kan inte ångras.')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/certifications`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadKandidatCertifications(kandidatId);
    } catch (err) { alert(err.message); }
}

// ── Kandidat CV list ──────────────────────────────────────────────────────────

async function loadKandidatCVs(kandidatId) {
    const detail = document.getElementById('kand-cv-detail');
    if (detail) {
        detail.style.display = 'none';
        const body = document.getElementById('kand-cv-detail-body');
        if (body) body.innerHTML = '';
    }
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
            <div class="cv-item" onclick="openKandidatCVDetail(${cv.id}, ${kandidatId})" style="cursor:pointer">
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

function openKandidatCVDetail(cvId, kandidatId) {
    const cv = kandCandidateCVs.find(c => c.id === cvId);
    if (!cv) return;
    const detail = document.getElementById('kand-cv-detail');
    const title  = document.getElementById('kand-cv-detail-title');
    const body   = document.getElementById('kand-cv-detail-body');
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
        <div id="kand-cv-action-status"></div>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
            ${!cv.is_vectorized && cv.is_processed
                ? `<button class="btn btn-primary" onclick="vectorizeKandidatCV(${cv.id}, ${kandidatId})">⚡ Vektorisera</button>`
                : ''}
            <a class="btn btn-secondary" href="${API_BASE_URL}/kandidater/${kandidatId}/cvs/${cv.id}/file" target="_blank">⬇ Ladda ner PDF</a>
            <button class="btn btn-danger btn-sm" onclick="deleteKandidatCV(${cv.id}, ${kandidatId}, '${cv.filename.replace(/'/g, "\\'")}')">🗑 Ta bort</button>
        </div>`;
    detail.style.display = '';
    detail.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function closeKandidatCVDetail() {
    const detail = document.getElementById('kand-cv-detail');
    if (detail) detail.style.display = 'none';
}

async function vectorizeKandidatCV(cvId, kandidatId) {
    const statusEl = document.getElementById('kand-cv-action-status');
    if (statusEl) { statusEl.className = 'status-message status-loading'; statusEl.textContent = '⏳ Vektoriserar...'; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/cvs/${cvId}/vectorize`, { method:'POST' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        await loadKandidatCVs(kandidatId);
        closeKandidatCVDetail();
    } catch (err) {
        if (statusEl) { statusEl.className = 'status-message status-error'; statusEl.textContent = `❌ ${err.message}`; }
    }
}

async function deleteKandidatCV(cvId, kandidatId, filename) {
    if (!confirm(`Ta bort "${filename}"?`)) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/cvs/${cvId}`, { method:'DELETE' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        closeKandidatCVDetail();
        await loadKandidatCVs(kandidatId);
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
        container.innerHTML = '<div class="empty-hint">Inga utbildningar tillagda ännu.</div>';
        return;
    }
    const clearBarKandEdu = `<div class="list-clear-bar"><span>${items.length} utbildning${items.length !== 1 ? 'ar' : ''}</span><button class="btn btn-danger btn-sm" onclick="clearKandEducation(${kandidatId})">Rensa alla</button></div>`;
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
                    <button class="btn btn-primary btn-small" onclick="saveKandEducation(${e.id},${kandidatId})">Spara</button>
                    <button class="btn btn-secondary btn-small" onclick="kandEditingEduId=null;renderKandidatEducation(cachedKandEdu,${kandidatId})">Avbryt</button>
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
                <button class="btn-icon" onclick="kandEditingEduId=${e.id};renderKandidatEducation(cachedKandEdu,${kandidatId})" title="Redigera">✎</button>
                <button class="btn-icon btn-icon-danger" onclick="deleteKandidatEducation(${e.id},${kandidatId})" title="Ta bort">&times;</button>
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
    if (!body.degree) { showKandEduStatus('Examen / Utbildning krävs', 'error'); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/education/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        kandEditingEduId = null;
        showKandEduStatus('Utbildning sparad', 'success');
        await loadKandidatEducation(kandidatId);
    } catch (err) { showKandEduStatus(err.message, 'error'); }
}

async function addKandidatEducation() {
    if (!currentKandidatId) return;
    const degree = document.getElementById('kand-edu-degree').value.trim();
    if (!degree) { showKandEduStatus('Examen / Utbildning krävs', 'error'); return; }
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
        showKandEduStatus('Utbildning tillagd', 'success');
        await loadKandidatEducation(currentKandidatId);
    } catch (err) { showKandEduStatus(err.message, 'error'); }
}

async function deleteKandidatEducation(id, kandidatId) {
    if (!confirm('Ta bort utbildningen?')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/education/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadKandidatEducation(kandidatId);
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
        container.innerHTML = '<div class="empty-hint">Inga kurser eller certifikat tillagda ännu.</div>';
        return;
    }
    const clearBarKandCert = `<div class="list-clear-bar"><span>${items.length} certifikat</span><button class="btn btn-danger btn-sm" onclick="clearKandCertifications(${kandidatId})">Rensa alla</button></div>`;
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
                    <button class="btn btn-primary btn-small" onclick="saveKandCertification(${c.id},${kandidatId})">Spara</button>
                    <button class="btn btn-secondary btn-small" onclick="kandEditingCertId=null;renderKandidatCertifications(cachedKandCerts,${kandidatId})">Avbryt</button>
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
                <button class="btn-icon" onclick="kandEditingCertId=${c.id};renderKandidatCertifications(cachedKandCerts,${kandidatId})" title="Redigera">✎</button>
                <button class="btn-icon btn-icon-danger" onclick="deleteKandidatCertification(${c.id},${kandidatId})" title="Ta bort">&times;</button>
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
    if (!body.name) { showKandCertStatus('Namn krävs', 'error'); return; }
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/certifications/${id}`, {
            method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        kandEditingCertId = null;
        showKandCertStatus('Certifikat sparat', 'success');
        await loadKandidatCertifications(kandidatId);
    } catch (err) { showKandCertStatus(err.message, 'error'); }
}

async function addKandidatCertification() {
    if (!currentKandidatId) return;
    const name = document.getElementById('kand-cert-name').value.trim();
    if (!name) { showKandCertStatus('Namn krävs', 'error'); return; }
    const body = {
        name,
        issuer: document.getElementById('kand-cert-issuer').value.trim() || null,
        date:   document.getElementById('kand-cert-date').value.trim()   || null,
    };
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${currentKandidatId}/certifications`, {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Fel'); }
        ['kand-cert-name','kand-cert-issuer','kand-cert-date'].forEach(id => document.getElementById(id).value = '');
        showKandCertStatus('Certifikat tillagt', 'success');
        await loadKandidatCertifications(currentKandidatId);
    } catch (err) { showKandCertStatus(err.message, 'error'); }
}

async function deleteKandidatCertification(id, kandidatId) {
    if (!confirm('Ta bort certifikatet?')) return;
    try {
        const res = await apiFetch(`${API_BASE_URL}/kandidater/${kandidatId}/certifications/${id}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Kunde inte ta bort');
        await loadKandidatCertifications(kandidatId);
    } catch (err) { alert(err.message); }
}

function showKandCertStatus(msg, type) {
    const el = document.getElementById('kand-cert-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
}
