// ── MATCH / OPTIMIZE / CV-GENERATION / TIPS ───────────────────────────────────
// Depends on: app-state.js (apiFetch, API_BASE_URL, optimizeBtn, jobDescription,
//             charCount, optimizeResult, lastMatchResult, lastJobDesc,
//             lastGeneratedCV, lastMatchKandidatId, scoreColor, displayMatchResult)
// Also uses: CV_TEMPLATE (cv-template.js)

// ── Update character count ────────────────────────────────────────────────────
function updateCharCount() {
    const count = jobDescription.value.length;
    charCount.textContent = `${count}${t('match.chars')}`;
}

// ── Update optimize button state ─────────────────────────────────────────────
function updateOptimizeButton() {
    optimizeBtn.disabled = jobDescription.value.trim().length === 0;
}

// ── Match competences against job ─────────────────────────────────────────────
async function handleOptimize() {
    if (!jobDescription.value.trim()) {
        alert(t('match.paste_alert'));
        return;
    }

    optimizeBtn.disabled = true;
    optimizeBtn.querySelector('.btn-text').style.display = 'none';
    optimizeBtn.querySelector('.btn-loading').classList.remove('hidden');
    optimizeResult.classList.add('hidden');

    try {
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
        updateOptimizeButton();
    }
}

// ── Generate CV ───────────────────────────────────────────────────────────────
async function handleGenerateCV() {
    if (!lastMatchResult) return;
    const genBtn = document.getElementById('gen-cv-btn');
    genBtn.disabled = true;
    genBtn.innerHTML = `<span class="spinner-small"></span> ${t('match.generating')}`;

    const expIds = (lastMatchResult.experiences ?? [])
        .filter(e => e.score > 0)
        .map(e => e.id);
    const skills = (lastMatchResult.skills ?? [])
        .filter(s => s.score > 0)
        .map(s => s.skill_name);

    const url = lastMatchKandidatId
        ? `${API_BASE_URL}/kandidater/${lastMatchKandidatId}/generate-cv`
        : `${API_BASE_URL}/competence/generate-cv`;

    try {
        const response = await apiFetch(url, {
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

        const data = await response.json();
        displayGeneratedCV(data);

    } catch (err) {
        genBtn.disabled = false;
        genBtn.innerHTML = t('match.gen_btn');
        alert('Fel: ' + err.message);
    }
}

function displayGeneratedCV(data) {
    const body = document.getElementById('cv-generate-body');

    const expHtml = (data.experiences || []).map(e => {
        const start = e.start_date || '';
        const end   = e.is_current ? 'nu' : (e.end_date || '');
        const dates = start ? `${start}–${end}` : '';
        const achievements = (e.highlighted_achievements || [])
            .map(a => `<li>${a}</li>`).join('');
        const matchedClass = e.is_matched ? ' gen-cv-exp--matched' : '';
        return `
            <div class="gen-cv-exp${matchedClass}">
                <div class="gen-cv-exp-header">
                    <div>
                        <span class="gen-cv-exp-title">${e.title}</span>
                        ${e.organization ? `<span class="gen-cv-exp-org"> · ${e.organization}</span>` : ''}
                        ${e.is_matched ? '<span class="gen-cv-match-badge">✦ Matchar jobbet</span>' : ''}
                    </div>
                    ${dates ? `<span class="gen-cv-exp-date">${dates}</span>` : ''}
                </div>
                ${achievements ? `<ul class="gen-cv-achievements">${achievements}</ul>` : ''}
            </div>
        `;
    }).join('');

    const skillsHtml = (data.skills || [])
        .map(s => `<span class="cv-skill-tag">${s}</span>`).join('');

    body.innerHTML = `
        <div class="gen-cv-pitch">
            <h3 class="gen-cv-section-title">Profil</h3>
            <p>${data.pitch || ''}</p>
        </div>

        <div class="gen-cv-section">
            <h3 class="gen-cv-section-title">Erfarenheter</h3>
            ${expHtml || '<p>Inga matchande erfarenheter</p>'}
        </div>

        ${skillsHtml ? `
        <div class="gen-cv-section">
            <h3 class="gen-cv-section-title">Relevanta kompetenser</h3>
            <div class="cv-skills-grid">${skillsHtml}</div>
        </div>` : ''}
    `;

    lastGeneratedCV = data;
    document.getElementById('cv-generate-modal').classList.remove('hidden');
}

function renderCVMarkdown(d) {
    // Render {{experiences}}
    const experiencesBlock = (d.experiences || []).map(e => {
        const start = e.start_date || '';
        const end   = e.is_current ? 'nu' : (e.end_date || '');
        const dates = start ? ` *(${start}–${end})*` : '';
        const org   = e.organization ? ` · ${e.organization}` : '';
        const achievements = (e.highlighted_achievements || [])
            .map(a => `- ${a}`)
            .join('\n');
        return `### ${e.title}${org}${dates}${achievements ? '\n' + achievements : ''}`;
    }).join('\n\n');

    // Render {{skills}}
    const skillsBlock = (d.skills || []).join(' · ');

    return CV_TEMPLATE
        .replace('{{pitch}}',       d.pitch || '')
        .replace('{{experiences}}', experiencesBlock)
        .replace('{{skills}}',      skillsBlock);
}

function downloadCVAsMarkdown() {
    if (!lastGeneratedCV) return;

    const markdown = renderCVMarkdown(lastGeneratedCV);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'cv-utkast.md';
    a.click();
    URL.revokeObjectURL(url);
}

function closeCVGenerateModal() {
    document.getElementById('cv-generate-modal').classList.add('hidden');
    const genBtn = document.getElementById('gen-cv-btn');
    if (genBtn) {
        genBtn.disabled = false;
        genBtn.innerHTML = t('match.gen_btn');
    }
}

// ── Generate Log House CV ────────────────────────────────────────────────────
let lastLHCV = null;

async function handleGenerateLHCV() {
    if (!lastMatchResult) return;
    const btn = document.getElementById('gen-lh-cv-btn');
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

    const pitch           = data.pitch ?? '';
    const suggestedSkills = data.suggested_skills ?? [];
    const tips            = data.tips ?? [];

    const impactLabel = { high: 'Hög effekt', medium: 'Medel', low: 'Lägre' };
    const impactClass = { high: 'tip-impact--high', medium: 'tip-impact--medium', low: 'tip-impact--low' };

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

function closeTipsModal() {
    document.getElementById('tips-modal').classList.add('hidden');
}
