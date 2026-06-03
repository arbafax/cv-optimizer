// ── MATCH / OPTIMIZE / CV-GENERATION / TIPS ───────────────────────────────────
// Depends on: app-state.js (apiFetch, API_BASE_URL, optimizeBtn, jobDescription,
//             charCount, optimizeResult, lastMatchResult, lastJobDesc,
//             lastMatchKandidatId, scoreColor, displayMatchResult)

// ── Update character count ────────────────────────────────────────────────────
function updateCharCount() {
    const count = jobDescription.value.length;
    charCount.textContent = `${count}${t('match.chars')}`;
}

// ── Show/hide warnings and gate button on match view ─────────────────────────
let _matchLlmReady = false;

function _bankIsEmpty() {
    return (!bankSkills || bankSkills.length === 0) &&
           (!bankExperiences || bankExperiences.length === 0);
}

async function _llmIsConfigured() {
    try {
        const s = await cvDb.settings.getAll();
        if (!s.ai_provider) return false;
        if (s.ai_provider === 'ollama') return Boolean(s.ollama_url);
        const key = { openai: s.openai_key, anthropic: s.anthropic_key, gemini: s.gemini_key }[s.ai_provider];
        return Boolean(key);
    } catch { return false; }
}

async function updateMatchWarning() {
    const bankEl = document.getElementById('match-empty-bank-warning');
    const llmEl  = document.getElementById('match-no-llm-warning');
    if (!bankEl || !llmEl) return;

    const bankEmpty = _bankIsEmpty();
    _matchLlmReady  = await _llmIsConfigured();

    bankEl.textContent = bankEmpty ? t('match.empty_bank') : '';
    bankEl.classList.toggle('hidden', !bankEmpty);

    llmEl.textContent = !_matchLlmReady ? t('match.no_llm') : '';
    llmEl.classList.toggle('hidden', _matchLlmReady);

    updateOptimizeButton();
}

// ── Update optimize button state ─────────────────────────────────────────────
function updateOptimizeButton() {
    optimizeBtn.disabled = jobDescription.value.trim().length === 0 || _bankIsEmpty() || !_matchLlmReady;
}

// ── Match competences against job ─────────────────────────────────────────────
async function handleOptimize() {
    if (!jobDescription.value.trim()) {
        alert(t('match.paste_alert'));
        return;
    }

    optimizeBtn.disabled = true;
    optimizeBtn.querySelector('.btn-text').style.display = 'none';
    const loadingEl = optimizeBtn.querySelector('.btn-loading');
    const loadingTextEl = loadingEl.querySelector('[data-i18n]') || loadingEl.querySelector('span:last-child');
    loadingEl.classList.remove('hidden');
    optimizeResult.classList.add('hidden');

    if (loadingTextEl) loadingTextEl.textContent = ' Analyserar annons…';

    try {
        // Step 1: analyze the job posting (result is cached for the match call)
        await _getStructuredJob('', jobDescription.value.trim());
        if (loadingTextEl) loadingTextEl.textContent = ' Matchar kompetenser…';

        const response = await apiFetch(`${API_BASE_URL}/competence/match-job`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_title: '',
                job_description: jobDescription.value.trim(),
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || t('match.failed'));
        }

        const result = await response.json();
        lastMatchResult     = result;
        lastJobDesc         = jobDescription.value.trim();
        lastMatchKandidatId = null;
        displayMatchResult(result);

        setTimeout(() => {
            optimizeResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);

    } catch (error) {
        optimizeResult.innerHTML = `
            <div class="status-message status-error">❌ Fel: ${error.message}</div>
        `;
        optimizeResult.classList.remove('hidden');
    } finally {
        optimizeBtn.disabled = false;
        optimizeBtn.querySelector('.btn-text').style.display = 'inline';
        optimizeBtn.querySelector('.btn-loading').classList.add('hidden');
        if (loadingTextEl) loadingTextEl.textContent = t('match.analysing') || ' Analyserar...';
        updateOptimizeButton();
    }
}

// ── Generate Log House CV ────────────────────────────────────────────────────
let lastLHCV = null;

async function handleGenerateLHCV() {
    if (!lastMatchResult) return;
    const btn = document.getElementById('gen-lh-cv-btn');
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-small"></span> ${t('match.generating')}`;

    const expIds = (lastMatchResult.experiences ?? []).filter(e => e.score > 0).map(e => e.id);
    const skills = (lastMatchResult.skills ?? []).filter(s => s.score > 0).map(s => s.skill_name);

    try {
        const response = await apiFetch(`${API_BASE_URL}/competence/generate-loghouse-cv`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_description: lastJobDesc,
                matched_experience_ids: expIds,
                skills,
            }),
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Kunde inte generera CV');
        }
        lastLHCV = await response.json();
        displayLHCV(lastLHCV);
    } catch (err) {
        alert('Fel: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = t('match.gen_lh_btn');
    }
}

function displayLHCV(data) {
    const p1 = data.page_1 || {};
    const p2 = data.page_2 || {};

    const ingressHtml = (p1.ingress || []).map(s => `<p>${s}</p>`).join('');

    const kompHtml = (p1.kompetenser || []).map(k => `
        <tr>
            <td class="lh-cv-komp-title">${k.rubrik}</td>
            <td class="lh-cv-komp-desc">${k.beskrivning}</td>
        </tr>`).join('');

    const summHtml = (p2.sammanfattning || []).map(s => `
        <p><strong>${s.rubrik}</strong> ${s.text}</p>`).join('');

    const verktygHtml = (p2.verktyg || []).map(v =>
        `<div class="lh-cv-tool-row"><span class="lh-cv-tool-cat">${v.kategori}:</span> ${(v.items || []).join(', ')}</div>`
    ).join('');

    const uppdragHtml = (p2.uppdrag || []).map(u => `
        <div class="lh-cv-uppdrag">
            <div class="lh-cv-uppdrag-title">${u.rubrik}</div>
            <ul>${(u.punkter || []).map(p => `<li>${p}</li>`).join('')}</ul>
        </div>`).join('');

    const eduHtml = (p2.utbildning || []).map(e =>
        `<tr><td class="lh-cv-edu-period">${e.period}</td><td>${e.utbildning}</td><td class="lh-cv-edu-org">${e.anordnare}</td></tr>`
    ).join('');

    document.getElementById('lh-cv-body').innerHTML = `
        <div class="lh-cv-page">
            <div class="lh-cv-section">
                <h3 class="lh-cv-section-title">Profil</h3>
                ${ingressHtml}
            </div>
            ${kompHtml ? `
            <div class="lh-cv-section">
                <h3 class="lh-cv-section-title lh-cv-accent">Kompetenser</h3>
                <table class="lh-cv-komp-table">${kompHtml}</table>
            </div>` : ''}
        </div>

        <div class="lh-cv-page lh-cv-page--2">
            ${p2.branscher ? `<div class="lh-cv-branscher"><strong>Branscher:</strong> ${p2.branscher}</div>` : ''}

            ${summHtml ? `
            <div class="lh-cv-section">
                <h3 class="lh-cv-section-title lh-cv-accent">Sammanfattning</h3>
                ${summHtml}
            </div>` : ''}

            ${verktygHtml ? `
            <div class="lh-cv-section">
                <h3 class="lh-cv-section-title lh-cv-accent">Verktyg o dyl.</h3>
                ${verktygHtml}
            </div>` : ''}

            ${uppdragHtml ? `
            <div class="lh-cv-section">
                <h3 class="lh-cv-section-title lh-cv-accent">Beskrivning av uppdragen</h3>
                ${uppdragHtml}
            </div>` : ''}

            ${eduHtml ? `
            <div class="lh-cv-section">
                <h3 class="lh-cv-section-title lh-cv-accent">Utbildning</h3>
                <table class="lh-cv-edu-table">${eduHtml}</table>
            </div>` : ''}
        </div>
    `;
    document.getElementById('lh-cv-modal').classList.remove('hidden');
}

function closeLHCVModal() {
    document.getElementById('lh-cv-modal').classList.add('hidden');
}

function downloadLHCVAsMarkdown() {
    if (!lastLHCV) return;
    const p1 = lastLHCV.page_1 || {};
    const p2 = lastLHCV.page_2 || {};

    const lines = [];

    (p1.ingress || []).forEach(s => lines.push(s, ''));

    if ((p1.kompetenser || []).length) {
        lines.push('## Kompetenser', '');
        p1.kompetenser.forEach(k => lines.push(`**${k.rubrik}**`, k.beskrivning, ''));
    }

    if (p2.branscher) lines.push(`**Branscher:** ${p2.branscher}`, '');

    if ((p2.sammanfattning || []).length) {
        lines.push('## Sammanfattning', '');
        p2.sammanfattning.forEach(s => lines.push(`**${s.rubrik}** ${s.text}`, ''));
    }

    if ((p2.verktyg || []).length) {
        lines.push('## Verktyg', '');
        p2.verktyg.forEach(v => lines.push(`**${v.kategori}:** ${(v.items || []).join(', ')}`, ''));
    }

    if ((p2.uppdrag || []).length) {
        lines.push('## Uppdrag', '');
        p2.uppdrag.forEach(u => {
            lines.push(`### ${u.rubrik}`, '');
            (u.punkter || []).forEach(p => lines.push(`- ${p}`));
            lines.push('');
        });
    }

    if ((p2.utbildning || []).length) {
        lines.push('## Utbildning', '');
        p2.utbildning.forEach(e => lines.push(`- ${e.period} — ${e.utbildning}, ${e.anordnare}`));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'loghouse-cv.md';
    a.click();
    URL.revokeObjectURL(url);
}

// ── Henrik CV ─────────────────────────────────────────────────────────────────

let lastHenrikCV = null;

async function handleGenerateHenrikCV() {
    if (!lastMatchResult) return;
    const btn = document.getElementById('gen-hc-cv-btn');
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-small"></span> ${t('match.generating')}`;

    const expIds = (lastMatchResult.experiences ?? []).filter(e => e.score > 0).map(e => e.id);
    const skills = (lastMatchResult.skills ?? []).filter(s => s.score > 0).map(s => s.skill_name);

    const url = lastMatchKandidatId
        ? `${API_BASE_URL}/kandidater/${lastMatchKandidatId}/generate-henrik-cv`
        : `${API_BASE_URL}/competence/generate-henrik-cv`;

    try {
        const response = await apiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_description: lastJobDesc, matched_experience_ids: expIds, skills }),
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Kunde inte generera CV');
        }
        lastHenrikCV = await response.json();
        displayHenrikCV(lastHenrikCV);
    } catch (err) {
        alert('Fel: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = t('match.gen_hc_btn');
    }
}

function displayHenrikCV(d) {
    const expertiseHtml = (d.expertise || []).map(g => `
        <div class="hc-cv-group">
            <div class="hc-cv-group-title">${g.subheading}</div>
            <ul>${(g.bullets || []).map(b => `<li>${b}</li>`).join('')}</ul>
        </div>`).join('');

    const expHtml = (d.experience || []).map(e => `
        <div class="hc-cv-exp">
            <div class="hc-cv-exp-heading">${e.heading_line}</div>
            <p>${e.description}</p>
        </div>`).join('');

    const techHtml = (d.technical_skills || []).map(t =>
        `<div class="hc-cv-tech-row"><span class="hc-cv-tech-cat">${t.category}:</span> ${(t.items || []).join(', ')}</div>`
    ).join('');

    const eduHtml = (d.education || []).map(e => `<li>${e}</li>`).join('');
    const trainHtml = (d.training || []).map(e => `<li>${e}</li>`).join('');
    const persHtml  = (d.personality || []).map(e => `<li>${e}</li>`).join('');
    const langHtml  = (d.languages || []).map(e => `<li>${e}</li>`).join('');
    const kwHtml    = (d.personal_keywords || []).join(' | ');

    document.getElementById('hc-cv-body').innerHTML = `
        <div class="hc-cv-section">
            <h3 class="hc-cv-heading">${d.profile_heading || 'Min profil'}</h3>
            <p>${(d.profile_text || '').replace(/\n\n/g, '</p><p>')}</p>
        </div>
        ${expertiseHtml ? `
        <div class="hc-cv-section">
            <h3 class="hc-cv-heading">Kärnkompetenser</h3>
            ${expertiseHtml}
        </div>` : ''}
        ${expHtml ? `
        <div class="hc-cv-section">
            <h3 class="hc-cv-heading">Yrkeserfarenhet</h3>
            ${expHtml}
        </div>` : ''}
        ${eduHtml ? `
        <div class="hc-cv-section">
            <h3 class="hc-cv-heading">Utbildning</h3>
            <ul class="hc-cv-list">${eduHtml}</ul>
        </div>` : ''}
        ${trainHtml ? `
        <div class="hc-cv-section">
            <h3 class="hc-cv-heading">Kompetensutveckling</h3>
            <ul class="hc-cv-list">${trainHtml}</ul>
        </div>` : ''}
        ${techHtml ? `
        <div class="hc-cv-section">
            <h3 class="hc-cv-heading">Digital & teknisk kompetens</h3>
            ${techHtml}
        </div>` : ''}
        ${persHtml ? `
        <div class="hc-cv-section">
            <h3 class="hc-cv-heading">Personlighet</h3>
            <ul class="hc-cv-list">${persHtml}</ul>
        </div>` : ''}
        ${langHtml ? `
        <div class="hc-cv-section">
            <h3 class="hc-cv-heading">Språk</h3>
            <ul class="hc-cv-list">${langHtml}</ul>
        </div>` : ''}
        ${kwHtml ? `
        <div class="hc-cv-section">
            <h3 class="hc-cv-heading">Personliga ledord</h3>
            <p class="hc-cv-keywords">${kwHtml}</p>
        </div>` : ''}
    `;
    document.getElementById('hc-cv-modal').classList.remove('hidden');
}

function closeHenrikCVModal() {
    document.getElementById('hc-cv-modal').classList.add('hidden');
}

function downloadHenrikCVAsMarkdown() {
    if (!lastHenrikCV) return;
    const d = lastHenrikCV;
    const lines = [];

    lines.push(`# ${d.profile_heading || 'Min profil'}`, '');
    lines.push(d.profile_text || '', '');

    if ((d.expertise || []).length) {
        lines.push('## Kärnkompetenser', '');
        d.expertise.forEach(g => {
            lines.push(`### ${g.subheading}`, '');
            (g.bullets || []).forEach(b => lines.push(`- ${b}`));
            lines.push('');
        });
    }

    if ((d.experience || []).length) {
        lines.push('## Yrkeserfarenhet', '');
        d.experience.forEach(e => {
            lines.push(`### ${e.heading_line}`, '');
            lines.push(e.description, '');
        });
    }

    if ((d.education || []).length) {
        lines.push('## Utbildning', '');
        d.education.forEach(e => lines.push(`- ${e}`));
        lines.push('');
    }

    if ((d.training || []).length) {
        lines.push('## Kompetensutveckling', '');
        d.training.forEach(e => lines.push(`- ${e}`));
        lines.push('');
    }

    if ((d.technical_skills || []).length) {
        lines.push('## Digital & teknisk kompetens', '');
        d.technical_skills.forEach(t => lines.push(`- **${t.category}:** ${(t.items || []).join(', ')}`));
        lines.push('');
    }

    if ((d.personality || []).length) {
        lines.push('## Personlighet', '');
        d.personality.forEach(e => lines.push(`- ${e}`));
        lines.push('');
    }

    if ((d.languages || []).length) {
        lines.push('## Språk', '');
        d.languages.forEach(e => lines.push(`- ${e}`));
        lines.push('');
    }

    if ((d.personal_keywords || []).length) {
        lines.push('## Personliga ledord', '');
        lines.push(d.personal_keywords.join(' | '), '');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'cv-utkast.md';
    a.click();
    URL.revokeObjectURL(url);
}

// ── Tips ──────────────────────────────────────────────────────────────────────

async function handleTips() {
    const tipsBtn = document.getElementById('tips-btn');
    tipsBtn.disabled = true;
    tipsBtn.innerHTML = '<span class="spinner-small"></span> Analyserar...';

    const currentSkills  = (lastMatchResult.skills ?? []).filter(s => s.score > 0).map(s => s.skill_name);
    const missingSkills  = lastMatchResult.missing_skills ?? [];
    const matchedExpIds  = (lastMatchResult.experiences ?? []).filter(e => e.score > 0).map(e => e.id);
    const overallScore   = lastMatchResult.overall_score ?? 0;

    try {
        const response = await apiFetch(`${API_BASE_URL}/competence/improvement-tips`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_description:        lastJobDesc,
                overall_score:          overallScore,
                current_skills:         currentSkills,
                missing_skills:         missingSkills,
                matched_experience_ids: matchedExpIds,
            }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Kunde inte generera tips');
        }

        const data = await response.json();
        displayTips(data, overallScore);

    } catch (err) {
        alert('Fel: ' + err.message);
    } finally {
        tipsBtn.disabled = false;
        tipsBtn.innerHTML = t('match.tips_btn');
    }
}

function displayTips(data, overallScore) {
    const body = document.getElementById('tips-body');

    const pitch              = data.pitch ?? '';
    const suggestedSkills    = data.suggested_skills ?? [];
    const tips               = data.tips ?? [];
    const missingQualities   = lastMatchResult?.missing_personal_qualities ?? [];

    const impactLabel = { high: 'Hög effekt', medium: 'Medel', low: 'Lägre' };
    const impactClass = { high: 'tip-impact--high', medium: 'tip-impact--medium', low: 'tip-impact--low' };

    const qualitiesRowHtml = missingQualities.map((q, i) => `
        <div class="tip-skill-row" id="tip-quality-${i}">
            <div class="tip-skill-info">
                <span class="tip-skill-name">${esc(q)}</span>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="addSuggestedQuality('${q.replace(/'/g, "\\'")}', ${i})">
                + Lägg till
            </button>
        </div>
    `).join('');

    const skillsHtml = suggestedSkills.map((s, i) => `
        <div class="tip-skill-row" id="tip-skill-${i}">
            <div class="tip-skill-info">
                <span class="tip-skill-name">${s.skill_name}</span>
                ${s.category ? `<span class="tip-skill-cat">${s.category}</span>` : ''}
                <span class="tip-skill-reason">${s.reason}</span>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="addSuggestedSkill('${s.skill_name.replace(/'/g, "\\'")}', '${(s.category || '').replace(/'/g, "\\'")}', ${i})">
                + Lägg till
            </button>
        </div>
    `).join('');

    const tipsHtml = tips.map(t => `
        <li class="tip-item">
            <span class="tip-impact ${impactClass[t.impact] || ''}">${impactLabel[t.impact] || ''}</span>
            ${t.tip}
        </li>
    `).join('');

    body.innerHTML = `
        ${pitch ? `
        <div class="tips-section tips-section--pitch">
            <h3 class="tips-section-title">Pitch</h3>
            <p class="tips-pitch-text">${esc(pitch)}</p>
        </div>` : ''}

        <div class="tips-score-row">
            <span class="tips-score-label">Nuvarande matchning</span>
            <span class="tips-score-value ${scoreColor(overallScore)}">${overallScore} / 100</span>
        </div>

        ${suggestedSkills.length ? `
        <div class="tips-section">
            <h3 class="tips-section-title">Skills att lägga till</h3>
            <p class="tips-section-desc">Dessa kompetenser nämns i annonsen och saknas i ${lastMatchKandidatId ? 'kandidatens' : 'din'} bank. Klicka "+ Lägg till" för att direkt lägga till dem.</p>
            <div class="tip-skills-list">${skillsHtml}</div>
        </div>` : ''}

        ${missingQualities.length ? `
        <div class="tips-section">
            <h3 class="tips-section-title">Personliga egenskaper att lägga till</h3>
            <p class="tips-section-desc">Dessa egenskaper efterfrågas i annonsen. Klicka "+ Lägg till" för att spara dem i ${lastMatchKandidatId ? 'kandidatens' : 'din'} profil.</p>
            <div class="tip-skills-list">${qualitiesRowHtml}</div>
        </div>` : ''}

        ${tipsHtml ? `
        <div class="tips-section">
            <h3 class="tips-section-title">Förbättringstips</h3>
            <ul class="tips-list">${tipsHtml}</ul>
        </div>` : ''}
    `;

    document.getElementById('tips-modal').classList.remove('hidden');
}

async function addSuggestedSkill(skillName, category, rowIndex) {
    const row = document.getElementById(`tip-skill-${rowIndex}`);
    const btn = row.querySelector('button');
    btn.disabled = true;
    btn.textContent = '…';

    try {
        const url = lastMatchKandidatId
            ? `${API_BASE_URL}/kandidater/${lastMatchKandidatId}/bank/skills`
            : `${API_BASE_URL}/competence/skills`;
        const response = await apiFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skill_name: skillName, category: category || null }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Kunde inte lägga till skill');
        }

        row.classList.add('tip-skill-row--added');
        btn.textContent = '✓ Tillagd';

    } catch (err) {
        btn.disabled = false;
        btn.textContent = '+ Lägg till';
        alert('Fel: ' + err.message);
    }
}

async function addSuggestedQuality(qualityName, rowIndex) {
    const row = document.getElementById(`tip-quality-${rowIndex}`);
    const btn = row.querySelector('button');
    btn.disabled = true;
    btn.textContent = '…';

    try {
        if (lastMatchKandidatId) {
            const res = await apiFetch(`${API_BASE_URL}/kandidater/${lastMatchKandidatId}`);
            if (!res.ok) throw new Error('Kunde inte hämta kandidat');
            const kand = await res.json();
            const existing = kand.personal_qualities || [];
            if (!existing.includes(qualityName)) {
                const putRes = await apiFetch(`${API_BASE_URL}/kandidater/${lastMatchKandidatId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ personal_qualities: [...existing, qualityName] }),
                });
                if (!putRes.ok) throw new Error('Kunde inte spara');
            }
        } else {
            await addSpQuality(qualityName);
        }
        row.classList.add('tip-skill-row--added');
        btn.textContent = '✓ Tillagd';
    } catch (err) {
        btn.disabled = false;
        btn.textContent = '+ Lägg till';
        alert('Fel: ' + err.message);
    }
}

function closeTipsModal() {
    document.getElementById('tips-modal').classList.add('hidden');
}

