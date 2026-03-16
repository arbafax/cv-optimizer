// ── MITT KONTO ────────────────────────────────────────────────────────────────
// Depends on: app-state.js (apiFetch, API_BASE_URL, currentUser,
//             renderSidebarUser, updateRoleBasedNav)

function loadAccountView() {
    if (!currentUser) return;
    document.getElementById('account-name').value    = currentUser.name    || '';
    document.getElementById('account-email').value   = currentUser.email   || '';
    document.getElementById('account-phone').value   = currentUser.phone   || '';
    document.getElementById('account-address').value = currentUser.address || '';
    document.getElementById('account-status').innerHTML    = '';
    document.getElementById('account-pw-status').innerHTML = '';
    document.getElementById('account-roles-status').innerHTML = '';
    document.getElementById('account-curr-pw').value = '';
    document.getElementById('account-new-pw').value  = '';

    const roles = currentUser.roles || [];
    document.getElementById('role-kandidat').checked    = roles.includes('Kandidat');
    document.getElementById('role-saljare').checked     = roles.includes('Säljare');
    document.getElementById('role-rekryterare').checked = roles.includes('Rekryterare');

    const langEl = document.getElementById('account-language');
    if (langEl) langEl.value = currentUser.language || currentLang || 'sv';
}

async function saveAccount() {
    const name    = document.getElementById('account-name').value.trim();
    const email   = document.getElementById('account-email').value.trim();
    const phone   = document.getElementById('account-phone').value.trim();
    const address = document.getElementById('account-address').value.trim();
    const langEl  = document.getElementById('account-language');
    const lang    = langEl ? langEl.value : null;

    if (!name) { showAccountStatus('account-status', 'Namn krävs', 'error'); return; }
    if (!email) { showAccountStatus('account-status', 'E-post krävs', 'error'); return; }

    try {
        const res = await apiFetch(`${API_BASE_URL}/auth/me`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone: phone || null, address: address || null, language: lang || null }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Kunde inte spara');
        }
        currentUser = await res.json();
        if (lang) setLanguage(lang, false);
        renderSidebarUser();
        showAccountStatus('account-status', 'Uppgifterna sparades', 'success');
    } catch (err) {
        showAccountStatus('account-status', err.message, 'error');
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
        // Navigate to dashboard so all role-gated elements are immediately visible/hidden
        setTimeout(() => {
            showView('dashboard', document.getElementById('nav-dashboard'));
            window.scrollTo(0, 0);
        }, 800);
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
