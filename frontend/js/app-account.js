// ── MITT KONTO ────────────────────────────────────────────────────────────────
// Depends on: app-state.js (apiFetch, API_BASE_URL, currentUser,
//             renderSidebarUser, updateRoleBasedNav)

async function loadAccountView() {
    if (!currentUser) return;
    document.getElementById('account-name').value    = currentUser.name    || '';
    document.getElementById('account-email').value   = currentUser.email   || '';
    document.getElementById('account-phone').value   = currentUser.phone   || '';
    document.getElementById('account-address').value = currentUser.address || '';
    document.getElementById('account-status').innerHTML = '';

    const profile = await cvDb.profile.get() || {};
    const identityEl = document.getElementById('account-identity');
    if (identityEl) identityEl.value = profile.identity_uuid || '';
    document.getElementById('account-roles-status').innerHTML = '';

    const roles = currentUser.roles || [];
    document.getElementById('role-kandidat').checked    = roles.includes('Kandidat');
    document.getElementById('role-saljare').checked     = roles.includes('Säljare');
    document.getElementById('role-rekryterare').checked = roles.includes('Rekryterare');
    document.getElementById('role-admin').checked       = roles.includes('Admin');

    const langEl = document.getElementById('account-language');
    if (langEl) langEl.value = currentUser.language || currentLang || 'sv';

    loadAISettings();
}

async function saveAccount() {
    const name    = document.getElementById('account-name').value.trim();
    const email   = document.getElementById('account-email').value.trim();
    const phone   = document.getElementById('account-phone').value.trim();
    const address = document.getElementById('account-address').value.trim();

    if (!name) { showAccountStatus('account-status', 'Namn krävs', 'error'); return; }

    // Generate UUID on first save
    const profile = await cvDb.profile.get() || {};
    if (!profile.identity_uuid) {
        profile.identity_uuid = crypto.randomUUID();
        await cvDb.profile.save(profile);
        const identityEl = document.getElementById('account-identity');
        if (identityEl) identityEl.value = profile.identity_uuid;
    }

    try {
        const res = await apiFetch(`${API_BASE_URL}/auth/me`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email: email || null, phone: phone || null, address: address || null }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Kunde inte spara');
        }
        currentUser = await res.json();
        renderSidebarUser();
        const h1 = document.querySelector('#view-dashboard .view-header h1');
        if (h1) h1.textContent = `${t('dash.welcome')}, ${currentUser.name.split(' ')[0]}!`;
        showAccountStatus('account-status', 'Uppgifterna sparades', 'success');
    } catch (err) {
        showAccountStatus('account-status', err.message, 'error');
    }
}

async function saveAccountLanguage() {
    const lang = document.getElementById('account-language').value;
    try {
        const res = await apiFetch(`${API_BASE_URL}/auth/me`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: lang }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Kunde inte spara');
        }
        currentUser = await res.json();
        setLanguage(lang, false);
        showAccountStatus('account-roles-status', t('account.language_saved') || 'Språk sparat', 'success');
    } catch (err) {
        showAccountStatus('account-roles-status', err.message, 'error');
    }
}

async function saveAccountPassword() {
    const currPw = document.getElementById('account-curr-pw').value;
    const newPw  = document.getElementById('account-new-pw').value;

    if (!currPw || !newPw) {
        showAccountStatus('account-pw-status', 'Fyll i båda fälten', 'error'); return;
    }
    if (newPw.length < 8) {
        showAccountStatus('account-pw-status', 'Nytt lösenord måste vara minst 8 tecken', 'error'); return;
    }
    try {
        const res = await apiFetch(`${API_BASE_URL}/auth/me/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_password: currPw, new_password: newPw }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Kunde inte byta lösenord');
        }
        document.getElementById('account-curr-pw').value = '';
        document.getElementById('account-new-pw').value  = '';
        showAccountStatus('account-pw-status', 'Lösenordet ändrades', 'success');
    } catch (err) {
        showAccountStatus('account-pw-status', err.message, 'error');
    }
}

async function saveAccountRoles() {
    const roles = [];
    if (document.getElementById('role-kandidat').checked)    roles.push('Kandidat');
    if (document.getElementById('role-saljare').checked)     roles.push('Säljare');
    if (document.getElementById('role-rekryterare').checked) roles.push('Rekryterare');
    if (document.getElementById('role-admin').checked)       roles.push('Admin');

    try {
        const res = await apiFetch(`${API_BASE_URL}/auth/me`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roles }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Kunde inte spara roller');
        }
        currentUser = await res.json();
        updateRoleBasedNav();
        showAccountStatus('account-roles-status', 'Roller sparade', 'success');
    } catch (err) {
        showAccountStatus('account-roles-status', err.message, 'error');
    }
}

function showAccountStatus(elId, msg, type) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.className = `status-message status-${type === 'success' ? 'success' : 'error'}`;
    el.textContent = msg;
    el.style.display = 'flex';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ── AI-inställningar (browser-only) ──────────────────────────────────────────

const AI_PROVIDER_LABELS = {
    openai: 'OpenAI (GPT-4o)',
    anthropic: 'Anthropic (Claude)',
    gemini: 'Google Gemini',
    ollama: 'Ollama (lokal)',
};

function _aiHasConfig(s) {
    if (!s.ai_provider) return false;
    if (s.ai_provider === 'ollama') return Boolean(s.ollama_url);
    const keyMap = { openai: s.openai_key, anthropic: s.anthropic_key, gemini: s.gemini_key };
    return Boolean(keyMap[s.ai_provider]);
}

function _aiViewText(s) {
    const label = AI_PROVIDER_LABELS[s.ai_provider] || s.ai_provider;
    if (s.ai_provider === 'ollama') {
        return (t('account.ai_view_ollama') || 'Du använder {label} lokalt ({url}, modell: {model}).')
            .replace('{label}', label)
            .replace('{url}', s.ollama_url || 'http://localhost:11434')
            .replace('{model}', s.ollama_model || 'llama3');
    }
    return (t('account.ai_view_cloud') || 'Du använder {label} med en sparad API-nyckel.')
        .replace('{label}', label);
}

async function loadAISettings() {
    let s;
    try {
        s = await cvDb.settings.getAll();
    } catch (err) {
        console.error('[loadAISettings] cvDb.settings.getAll() failed:', err);
        s = {};
    }
const provider = s.ai_provider || 'openai';

    const provEl = document.getElementById('ai-provider');
    if (provEl) provEl.value = provider;

    const keyMap = { openai: s.openai_key, anthropic: s.anthropic_key, gemini: s.gemini_key };
    const keyEl = document.getElementById('ai-api-key');
    if (keyEl) keyEl.value = keyMap[provider] || '';

    const ollamaUrl = document.getElementById('ai-ollama-url');
    const ollamaModel = document.getElementById('ai-ollama-model');
    if (ollamaUrl) ollamaUrl.value = s.ollama_url || 'http://localhost:11434';
    if (ollamaModel) ollamaModel.value = s.ollama_model || 'llama3';

    onAIProviderChange();

    if (_aiHasConfig(s)) {
        const viewText = document.getElementById('ai-view-text');
        if (viewText) viewText.textContent = _aiViewText(s);
        document.getElementById('ai-view-mode')?.classList.remove('hidden');
        document.getElementById('ai-edit-mode')?.classList.add('hidden');
        document.getElementById('ai-cancel-btn')?.classList.remove('hidden');
    } else {
        document.getElementById('ai-view-mode')?.classList.add('hidden');
        document.getElementById('ai-edit-mode')?.classList.remove('hidden');
        document.getElementById('ai-cancel-btn')?.classList.add('hidden');
    }
}

function showAIEditMode() {
    document.getElementById('ai-view-mode')?.classList.add('hidden');
    document.getElementById('ai-edit-mode')?.classList.remove('hidden');
}

function hideAIEditMode() {
    document.getElementById('ai-edit-mode')?.classList.add('hidden');
    document.getElementById('ai-view-mode')?.classList.remove('hidden');
}

function onAIProviderChange() {
    const provider = document.getElementById('ai-provider')?.value || 'openai';
    const keyGroup   = document.getElementById('ai-key-group');
    const keyLabel   = document.getElementById('ai-key-label');
    const ollamaGroup = document.getElementById('ai-ollama-group');

    const labels = {
        openai:    t('account.ai_label_key_openai')    || 'OpenAI API-nyckel',
        anthropic: t('account.ai_label_key_anthropic') || 'Anthropic API-nyckel',
        gemini:    t('account.ai_label_key_gemini')    || 'Gemini API-nyckel',
    };
    if (keyLabel) keyLabel.textContent = labels[provider] || 'API-nyckel';
    if (keyGroup)   keyGroup.classList.toggle('hidden', provider === 'ollama');
    if (ollamaGroup) ollamaGroup.classList.toggle('hidden', provider !== 'ollama');
}

function openImportModal() {
    document.getElementById('import-modal')?.classList.remove('hidden');
    document.getElementById('import-status').innerHTML = '';
    document.getElementById('import-file-input').value = '';
    const dz = document.getElementById('import-drop-zone');
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag-over'); };
    dz.ondragleave = () => dz.classList.remove('drag-over');
    dz.ondrop = (e) => {
        e.preventDefault();
        dz.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) _processImportFile(file);
    };
}

function closeImportModal() {
    document.getElementById('import-modal')?.classList.add('hidden');
}

function handleImportFileSelect(event) {
    const file = event.target.files?.[0];
    if (file) _processImportFile(file);
}

async function _processImportFile(file) {
    const statusEl = document.getElementById('import-status');
    statusEl.innerHTML = '';
    let payload;
    try {
        const text = await file.text();
        payload = JSON.parse(text);
    } catch {
        statusEl.className = 'status-message status-error';
        statusEl.textContent = t('account.import_invalid') || 'Filen är inte ett giltigt CVOptimizer-exportformat';
        statusEl.style.display = 'flex';
        return;
    }
    if (!payload.export_version || (!payload.profile && !payload.kandidater)) {
        statusEl.className = 'status-message status-error';
        statusEl.textContent = t('account.import_invalid') || 'Filen är inte ett giltigt CVOptimizer-exportformat';
        statusEl.style.display = 'flex';
        return;
    }
    if (!confirm(t('account.import_confirm') || 'Vill du importera denna fil? All befintlig data ersätts.')) return;

    try {
        await _importPayload(payload);
        statusEl.className = 'status-message status-success';
        statusEl.textContent = t('account.import_success') || 'Import klar – sidan laddas om';
        statusEl.style.display = 'flex';
        setTimeout(() => location.reload(), 1500);
    } catch (err) {
        statusEl.className = 'status-message status-error';
        statusEl.textContent = (t('account.import_error') || 'Import misslyckades') + ': ' + err.message;
        statusEl.style.display = 'flex';
    }
}

async function _importPayload(payload) {
    const stores = ['profile', 'skills', 'experiences', 'cvs', 'education',
                    'certifications', 'search_profiles', 'settings',
                    'kandidater', 'kand_skills', 'kand_experiences',
                    'kand_education', 'kand_certifications', 'kand_cvs'];

    // Preserve AI settings across import
    const savedAI = await cvDb.settings.getAll();

    // Clear all stores
    for (const store of stores) {
        await cvDb._tx(store, 'readwrite', (tx) =>
            new Promise((res, rej) => {
                const req = tx.objectStore(store).clear();
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
            })
        );
    }

    // Re-apply AI settings (user's own keys, not cloned ones)
    const aiKeys = ['ai_provider', 'openai_key', 'anthropic_key', 'gemini_key', 'ollama_url', 'ollama_model'];
    for (const key of aiKeys) {
        if (savedAI[key] != null) await cvDb.settings.set(key, savedAI[key]);
    }

    // Restore user settings from payload (roles, language)
    const userSettings = payload.user_settings || {};
    for (const [key, value] of Object.entries(userSettings)) {
        await cvDb.settings.set(key, value);
    }

    // Import profile (singleton)
    if (payload.profile) {
        await cvDb.profile.save(payload.profile);
    }

    // Import flat autoIncrement stores (strip id so DB assigns new ones)
    const strip = (obj) => { const { id, ...rest } = obj; return rest; };

    for (const skill of (payload.skills || [])) {
        await cvDb._tx('skills', 'readwrite', (tx) =>
            new Promise((res, rej) => {
                const req = tx.objectStore('skills').add(strip(skill));
                req.onsuccess = () => res(); req.onerror = () => rej(req.error);
            })
        );
    }
    for (const exp of (payload.experiences || [])) {
        await cvDb._tx('experiences', 'readwrite', (tx) =>
            new Promise((res, rej) => {
                const req = tx.objectStore('experiences').add(strip(exp));
                req.onsuccess = () => res(); req.onerror = () => rej(req.error);
            })
        );
    }
    for (const ed of (payload.education || [])) {
        await cvDb._tx('education', 'readwrite', (tx) =>
            new Promise((res, rej) => {
                const req = tx.objectStore('education').add(strip(ed));
                req.onsuccess = () => res(); req.onerror = () => rej(req.error);
            })
        );
    }
    for (const cert of (payload.certifications || [])) {
        await cvDb._tx('certifications', 'readwrite', (tx) =>
            new Promise((res, rej) => {
                const req = tx.objectStore('certifications').add(strip(cert));
                req.onsuccess = () => res(); req.onerror = () => rej(req.error);
            })
        );
    }
    for (const sp of (payload.search_profiles || [])) {
        await cvDb._tx('search_profiles', 'readwrite', (tx) =>
            new Promise((res, rej) => {
                const req = tx.objectStore('search_profiles').add(strip(sp));
                req.onsuccess = () => res(); req.onerror = () => rej(req.error);
            })
        );
    }

    // Import kandidater with nested data (need to remap old kandidat id → new id)
    for (const k of (payload.kandidater || [])) {
        const infoToImport = strip(k.info);
        if (!infoToImport.profile_uuid) infoToImport.profile_uuid = crypto.randomUUID();
        const newKandId = await cvDb._tx('kandidater', 'readwrite', (tx) =>
            new Promise((res, rej) => {
                const req = tx.objectStore('kandidater').add(infoToImport);
                req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
            })
        );
        for (const item of (k.skills || [])) {
            const obj = { ...strip(item), kandidat_id: newKandId };
            await cvDb._tx('kand_skills', 'readwrite', (tx) =>
                new Promise((res, rej) => { const req = tx.objectStore('kand_skills').add(obj); req.onsuccess = () => res(); req.onerror = () => rej(req.error); })
            );
        }
        for (const item of (k.experiences || [])) {
            const obj = { ...strip(item), kandidat_id: newKandId };
            await cvDb._tx('kand_experiences', 'readwrite', (tx) =>
                new Promise((res, rej) => { const req = tx.objectStore('kand_experiences').add(obj); req.onsuccess = () => res(); req.onerror = () => rej(req.error); })
            );
        }
        for (const item of (k.education || [])) {
            const obj = { ...strip(item), kandidat_id: newKandId };
            await cvDb._tx('kand_education', 'readwrite', (tx) =>
                new Promise((res, rej) => { const req = tx.objectStore('kand_education').add(obj); req.onsuccess = () => res(); req.onerror = () => rej(req.error); })
            );
        }
        for (const item of (k.certifications || [])) {
            const obj = { ...strip(item), kandidat_id: newKandId };
            await cvDb._tx('kand_certifications', 'readwrite', (tx) =>
                new Promise((res, rej) => { const req = tx.objectStore('kand_certifications').add(obj); req.onsuccess = () => res(); req.onerror = () => rej(req.error); })
            );
        }
    }
}

async function exportAccountData() {
    try {
        const [profile, searchProfilesList, allKandidater, allSettings] = await Promise.all([
            cvDb.profile.get(),
            cvDb.searchProfiles.list(),
            cvDb.kandidater.list(),
            cvDb.settings.getAll(),
        ]);

        const kandidaterWithData = await Promise.all(allKandidater.map(async k => ({
            info:           k,
            skills:         await cvDb.kandSkills.listFor(k.id),
            experiences:    await cvDb.kandExperiences.listFor(k.id),
            education:      await cvDb.kandEducation.listFor(k.id),
            certifications: await cvDb.kandCertifications.listFor(k.id),
        })));

        const userSettings = {};
        for (const key of ['user_roles', 'language']) {
            if (allSettings[key] != null) userSettings[key] = allSettings[key];
        }

        const payload = {
            export_version:  '2.0',
            exported_at:     new Date().toISOString(),
            profile,
            search_profiles: searchProfilesList,
            kandidater:      kandidaterWithData,
            user_settings:   userSettings,
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `cvoptimizer-export-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        alert('Export misslyckades: ' + err.message);
    }
}

async function handleResetAllData() {
    if (!confirm(t('account.reset_confirm') || 'Är du säker? All data på den här enheten raderas permanent.')) return;

    const includeAI = document.getElementById('reset-include-ai-key')?.checked;

    // Spara AI-inställningar innan vi rensar, om användaren vill behålla dem
    let savedAI = {};
    if (!includeAI) {
        savedAI = await cvDb.settings.getAll();
    }

    // Rensa alla stores
    const stores = ['profile', 'skills', 'experiences', 'cvs', 'education',
                    'certifications', 'search_profiles', 'settings',
                    'kandidater', 'kand_skills', 'kand_experiences',
                    'kand_education', 'kand_certifications', 'kand_cvs'];
    for (const store of stores) {
        await cvDb._tx(store, 'readwrite', (tx) =>
            new Promise((res, rej) => {
                const req = tx.objectStore(store).clear();
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
            })
        );
    }

    // Återställ AI-inställningar om de ska behållas
    if (!includeAI) {
        const aiKeys = ['ai_provider', 'openai_key', 'anthropic_key', 'gemini_key', 'ollama_url', 'ollama_model'];
        for (const key of aiKeys) {
            if (savedAI[key] != null) await cvDb.settings.set(key, savedAI[key]);
        }
    }

    location.reload();
}

async function saveAISettings() {
    const provider = document.getElementById('ai-provider')?.value || 'openai';
    try {
        await cvDb.settings.set('ai_provider', provider);

        if (provider !== 'ollama') {
            const key = document.getElementById('ai-api-key')?.value?.trim() || '';
            const keyMap = { openai: 'openai_key', anthropic: 'anthropic_key', gemini: 'gemini_key' };
            if (keyMap[provider]) await cvDb.settings.set(keyMap[provider], key);
        } else {
            const url = document.getElementById('ai-ollama-url')?.value?.trim() || 'http://localhost:11434';
            const model = document.getElementById('ai-ollama-model')?.value?.trim() || 'llama3';
            await cvDb.settings.set('ollama_url', url);
            await cvDb.settings.set('ollama_model', model);
        }

        showAccountStatus('ai-settings-status', t('account.ai_saved') || 'AI-inställningar sparade', 'success');
        await loadAISettings();
        if (typeof updateMatchWarning === 'function') updateMatchWarning();
    } catch (err) {
        console.error('[saveAISettings] failed:', err);
        showAccountStatus('ai-settings-status', err.message || 'Fel vid sparande', 'error');
    }
}
