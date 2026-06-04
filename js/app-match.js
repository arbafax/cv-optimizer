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

    if (loadingTextEl) loadingTextEl.textContent = t('match.loading_ad');

    try {
        // Step 1: analyze the job posting (result is cached for the match call)
        await _getStructuredJob('', jobDescription.value.trim());
        if (loadingTextEl) loadingTextEl.textContent = t('match.loading_skills');

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

    const experienceScores = Object.fromEntries(
        (lastMatchResult.experiences ?? []).map(e => [e.id, e.score ?? 0])
    );
    const skills = (lastMatchResult.skills ?? []).filter(s => s.score > 0).map(s => s.skill_name);
    let candidateName = '';
    try {
        if (lastMatchKandidatId) {
            const kand = await cvDb.kandidater.get(lastMatchKandidatId);
            candidateName = kand?.public_name || '';
        } else {
            const own = await cvDb.kandidater.getOwn();
            candidateName = own?.public_name || currentUser?.name || '';
        }
    } catch { /* silent */ }

    try {
        const response = await apiFetch(`${API_BASE_URL}/competence/generate-loghouse-cv`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job_description: lastJobDesc,
                experience_scores: experienceScores,
                skills,
                kandidat_id: lastMatchKandidatId || undefined,
            }),
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Kunde inte generera CV');
        }
        lastLHCV = await response.json();
        displayLHCV(lastLHCV, candidateName);
    } catch (err) {
        alert('Fel: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = t('match.gen_lh_btn');
    }
}

function displayLHCV(data, candidateName) {
    const p1 = data.page_1 || {};
    const p2 = data.page_2 || {};
    const titleEl = document.getElementById('lh-cv-title');
    if (titleEl) {
        titleEl.textContent = candidateName
            ? t('match.cv_draft_for').replace('{name}', candidateName)
            : t('match.cv_draft');
    }

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

    const uppdragHtml = (p2.uppdrag || []).map(u => {
        const intro = (u.intro && u.intro !== 'null') ? u.intro : null;
        const isCompact = !intro && (!u.punkter || !u.punkter.length);
        if (isCompact) {
            return `<div class="lh-cv-uppdrag lh-cv-uppdrag--compact">
                <div class="lh-cv-uppdrag-title">${u.rubrik}</div>
            </div>`;
        }
        return `<div class="lh-cv-uppdrag">
            <div class="lh-cv-uppdrag-title">${u.rubrik}</div>
            ${intro ? `<p class="lh-cv-uppdrag-intro">${intro}</p>` : ''}
            <ul>${(u.punkter || []).map(p => `<li>${p}</li>`).join('')}</ul>
        </div>`;
    }).join('');

    const eduHtml = (p2.utbildning || []).map(e =>
        `<tr><td class="lh-cv-edu-period">${e.period}</td><td>${e.utbildning}</td><td class="lh-cv-edu-org">${e.anordnare}</td></tr>`
    ).join('');

    document.getElementById('lh-cv-body').innerHTML = `
        <div class="lh-cv-page">
            <div class="lh-cv-section">
                <h3 class="lh-cv-section-title">${t('lhcv.profile')}</h3>
                ${ingressHtml}
            </div>
            ${kompHtml ? `
            <div class="lh-cv-section">
                <h3 class="lh-cv-section-title lh-cv-accent">${t('lhcv.skills')}</h3>
                <table class="lh-cv-komp-table">${kompHtml}</table>
            </div>` : ''}
        </div>

        <div class="lh-cv-page lh-cv-page--2">
            ${p2.branscher ? `<div class="lh-cv-branscher"><strong>${t('lhcv.industries')}</strong> ${p2.branscher}</div>` : ''}

            ${summHtml ? `
            <div class="lh-cv-section">
                <h3 class="lh-cv-section-title lh-cv-accent">${t('lhcv.summary')}</h3>
                ${summHtml}
            </div>` : ''}

            ${verktygHtml ? `
            <div class="lh-cv-section">
                <h3 class="lh-cv-section-title lh-cv-accent">${t('lhcv.tools')}</h3>
                ${verktygHtml}
            </div>` : ''}

            ${uppdragHtml ? `
            <div class="lh-cv-section">
                <h3 class="lh-cv-section-title lh-cv-accent">${t('lhcv.assignments')}</h3>
                ${uppdragHtml}
            </div>` : ''}

            ${eduHtml ? `
            <div class="lh-cv-section">
                <h3 class="lh-cv-section-title lh-cv-accent">${t('lhcv.education')}</h3>
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

// ── Tips ──────────────────────────────────────────────────────────────────────

async function handleTips() {
    const tipsBtn = document.getElementById('tips-btn');
    tipsBtn.disabled = true;
    tipsBtn.innerHTML = `<span class="spinner-small"></span> ${t('match.analysing')}`;

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

    const impactLabel = { high: t('match.impact_high'), medium: t('match.impact_medium'), low: t('match.impact_low') };
    const impactClass = { high: 'tip-impact--high', medium: 'tip-impact--medium', low: 'tip-impact--low' };
    const possessive  = lastMatchKandidatId ? t('match.possessive_kand') : t('match.possessive_own');

    const qualitiesRowHtml = missingQualities.map((q, i) => `
        <div class="tip-skill-row" id="tip-quality-${i}">
            <div class="tip-skill-info">
                <span class="tip-skill-name">${esc(q)}</span>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="addSuggestedQuality('${q.replace(/'/g, "\\'")}', ${i})">
                ${t('match.add_btn')}
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
                ${t('match.add_btn')}
            </button>
        </div>
    `).join('');

    const tipsHtml = tips.map(tip => `
        <li class="tip-item">
            <span class="tip-impact ${impactClass[tip.impact] || ''}">${impactLabel[tip.impact] || ''}</span>
            ${tip.tip}
        </li>
    `).join('');

    body.innerHTML = `
        ${pitch ? `
        <div class="tips-section tips-section--pitch">
            <h3 class="tips-section-title">${t('match.pitch')}</h3>
            <p class="tips-pitch-text">${esc(pitch)}</p>
        </div>` : ''}

        <div class="tips-score-row">
            <span class="tips-score-label">${t('match.current_score')}</span>
            <span class="tips-score-value ${scoreColor(overallScore)}">${overallScore} / 100</span>
        </div>

        ${suggestedSkills.length ? `
        <div class="tips-section">
            <h3 class="tips-section-title">${t('match.skills_to_add')}</h3>
            <p class="tips-section-desc">${t('match.skills_desc').replace('{possessive}', possessive)}</p>
            <div class="tip-skills-list">${skillsHtml}</div>
        </div>` : ''}

        ${missingQualities.length ? `
        <div class="tips-section">
            <h3 class="tips-section-title">${t('match.qualities_to_add')}</h3>
            <p class="tips-section-desc">${t('match.qualities_desc').replace('{possessive}', possessive)}</p>
            <div class="tip-skills-list">${qualitiesRowHtml}</div>
        </div>` : ''}

        ${tipsHtml ? `
        <div class="tips-section">
            <h3 class="tips-section-title">${t('match.improvement_tips')}</h3>
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
        btn.textContent = t('match.added_btn');

    } catch (err) {
        btn.disabled = false;
        btn.textContent = t('match.add_btn');
        alert(err.message);
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
        btn.textContent = t('match.added_btn');
    } catch (err) {
        btn.disabled = false;
        btn.textContent = t('match.add_btn');
        alert(err.message);
    }
}

function closeTipsModal() {
    document.getElementById('tips-modal').classList.add('hidden');
}

