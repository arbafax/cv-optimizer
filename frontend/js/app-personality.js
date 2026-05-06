// ── PERSONALITY MODULE ────────────────────────────────────────────────────────
// Depends on: app-state.js (apiFetch, API_BASE_URL, currentUser, t, esc)

// ── State ─────────────────────────────────────────────────────────────────────
let _padminEditingId = null;   // question id being edited in admin form


// ════════════════════════════════════════════════════════════════════════════
// KANDIDAT — "Min person" view
// ════════════════════════════════════════════════════════════════════════════

// Cache: questionId → { question, answer | null }
let _pqData = {};

async function loadMyPerson() {
    const [qRes, aRes] = await Promise.all([
        apiFetch(`${API_BASE_URL}/personality/questions`),
        apiFetch(`${API_BASE_URL}/personality/answers`),
    ]);
    if (!qRes.ok || !aRes.ok) return;

    const questions              = await qRes.json();
    const { answered, total, answers } = await aRes.json();

    // Build answer map keyed by question_id
    const answerMap = {};
    for (const a of answers) answerMap[a.question_id] = a;

    // Build merged cache
    _pqData = {};
    for (const q of questions) {
        _pqData[q.id] = { question: q, answer: answerMap[q.id] || null };
    }

    _renderPersonProgress(answered, total);
    _renderAllQuestions(questions, answerMap);
}

function _renderPersonProgress(answered, total) {
    const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
    const bar = document.getElementById('person-progress-bar');
    const txt = document.getElementById('person-progress-text');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = `${answered} / ${total}`;
}

function _renderAllQuestions(questions, answerMap) {
    const el = document.getElementById('person-answers-list');
    if (!el) return;
    if (!questions.length) {
        el.innerHTML = `<p class="text-muted" style="text-align:center;padding:24px">${t('person.no_questions_yet')}</p>`;
        return;
    }

    // Group by category, preserving order
    const groups = {};
    for (const q of questions) {
        const cat = q.category || '–';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(q);
    }

    el.innerHTML = Object.entries(groups).map(([cat, qs]) => `
        <div class="card" style="margin-bottom:16px">
            <h3 class="card-title" style="margin-bottom:4px">${esc(cat)}</h3>
            ${qs.map(q => _pqRowHtml(q, answerMap[q.id] || null)).join('')}
        </div>
    `).join('');
}

function _pqRowHtml(q, answer) {
    const answered  = !!answer;
    const likertBadge = answered && answer.likert_score
        ? `<span class="pq-likert-badge">${answer.likert_score}/5</span>`
        : '';
    const answerInner = answered
        ? (answer.answer_text ? esc(answer.answer_text) : '') + likertBadge
        : '';
    const answerBlock = answered
        ? `<div class="pq-answer-text" id="pq-ans-${q.id}">${answerInner}</div>`
        : `<div class="pq-unanswered" id="pq-ans-${q.id}">–</div>`;

    return `
        <div class="pq-row${answered ? '' : ' pq-row--unanswered'}" id="pq-row-${q.id}">
            <div class="pq-row-body">
                <div class="pq-question">${esc(q.question_text)}</div>
                ${q.context ? `<div class="pq-context">${esc(q.context)}</div>` : ''}
                ${answerBlock}
            </div>
            <div class="pq-row-actions" id="pq-actions-${q.id}">
                <button class="btn-icon" onclick="editPQ(${q.id})"
                    title="${t(answered ? 'person.edit_answer' : 'person.add_answer')}">&#9998;</button>
            </div>
            <div class="pq-edit-form hidden" id="pq-edit-${q.id}"></div>
        </div>`;
}

function editPQ(questionId) {
    const entry = _pqData[questionId];
    if (!entry) return;
    const { question: q, answer } = entry;

    // Hide edit button while form is open
    document.getElementById(`pq-actions-${questionId}`)?.classList.add('hidden');

    const currentText   = answer?.answer_text || '';
    const currentLikert = answer?.likert_score || null;
    const hasLikert     = !!q.big_five_trait;

    const likertHtml = hasLikert ? `
        <div style="margin-bottom:8px">
            <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px" data-i18n="person.likert_label">${t('person.likert_label')}</p>
            <div style="display:flex;gap:8px">
                ${[1,2,3,4,5].map(v => `
                    <label class="likert-btn">
                        <input type="radio" name="pq-likert-${questionId}" value="${v}"${currentLikert === v ? ' checked' : ''}> ${v}
                    </label>`).join('')}
            </div>
        </div>` : '';

    const textareaHtml = hasLikert ? '' : `
        <textarea class="form-input" id="pq-ta-${questionId}" rows="3"
            style="width:100%;resize:vertical;margin-bottom:8px"
            maxlength="500">${esc(currentText)}</textarea>`;

    const formEl = document.getElementById(`pq-edit-${questionId}`);
    formEl.innerHTML = `
        ${likertHtml}
        ${textareaHtml}
        <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-secondary btn-sm" onclick="cancelPQ(${questionId})">${t('person.cancel')}</button>
            <button class="btn btn-primary btn-sm" onclick="savePQ(${questionId})">${t('person.save_answer')}</button>
        </div>`;
    formEl.classList.remove('hidden');
    document.getElementById(`pq-ta-${questionId}`)?.focus();
}

function cancelPQ(questionId) {
    document.getElementById(`pq-edit-${questionId}`)?.classList.add('hidden');
    document.getElementById(`pq-edit-${questionId}`).innerHTML = '';
    document.getElementById(`pq-actions-${questionId}`)?.classList.remove('hidden');
}

async function savePQ(questionId) {
    const ta = document.getElementById(`pq-ta-${questionId}`);
    const likertInput = document.querySelector(`input[name="pq-likert-${questionId}"]:checked`);
    const likert = likertInput ? parseInt(likertInput.value) : null;

    // Likert-only question: textarea absent — require a number to be selected
    if (!ta) {
        if (!likert) return;
    }
    const text = ta ? ta.value.trim() : '';
    if (!ta && !text && !likert) return;  // nothing to save
    if (ta && !text) return;              // free-text question: text required

    const res = await apiFetch(`${API_BASE_URL}/personality/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: questionId, answer_text: text, likert_score: likert }),
    });
    if (!res.ok) return;

    const saved = await res.json();

    // Update cache
    if (_pqData[questionId]) _pqData[questionId].answer = saved;

    // Update answer display inline (no full reload)
    const ansEl = document.getElementById(`pq-ans-${questionId}`);
    if (ansEl) {
        const likertBadge = saved.likert_score
            ? `<span class="pq-likert-badge">${saved.likert_score}/5</span>` : '';
        ansEl.className   = 'pq-answer-text';
        ansEl.innerHTML   = (saved.answer_text ? esc(saved.answer_text) : '') + likertBadge;
    }
    const row = document.getElementById(`pq-row-${questionId}`);
    if (row) row.classList.remove('pq-row--unanswered');

    // Update progress bar (re-count from cache)
    const totalQ    = Object.keys(_pqData).length;
    const answeredQ = Object.values(_pqData).filter(e => e.answer).length;
    _renderPersonProgress(answeredQ, totalQ);

    cancelPQ(questionId);
}


// ════════════════════════════════════════════════════════════════════════════
// ADMIN — "Personlighetsfrågor" view
// ════════════════════════════════════════════════════════════════════════════

async function backfillQuestionEmbeddings() {
    const btn = document.getElementById('padmin-backfill-btn');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    const res = await apiFetch(`${API_BASE_URL}/personality/questions/backfill-embeddings`, { method: 'POST' });
    if (btn) { btn.disabled = false; btn.textContent = 'Backfill embeddings'; }
    if (!res.ok) { alert('Backfill misslyckades'); return; }
    const { backfilled, skipped } = await res.json();
    alert(`Backfill klar: ${backfilled} frågor fick embeddings, ${skipped} hoppades över.`);
}

async function loadPersonalityAdmin() {
    const res = await apiFetch(`${API_BASE_URL}/personality/questions?include_inactive=true`);
    if (!res.ok) return;
    const questions = await res.json();
    _renderAdminQuestions(questions);
}

function _renderAdminQuestions(questions) {
    const el = document.getElementById('padmin-questions-list');
    if (!el) return;

    if (!questions.length) {
        el.innerHTML = `<p class="text-muted" style="text-align:center;padding:24px">${t('padmin.no_questions')}</p>`;
        return;
    }

    const traitColors = { O: '#7c5cbf', C: '#2563eb', E: '#f59e0b', A: '#10b981', N: '#ef4444' };

    el.innerHTML = `
        <div class="card" style="padding:0;overflow:hidden">
            <table style="width:100%;border-collapse:collapse;font-size:0.875rem">
                <thead>
                    <tr style="background:var(--bg-secondary);border-bottom:1px solid var(--border)">
                        <th style="padding:10px 14px;text-align:left;font-weight:600">#</th>
                        <th style="padding:10px 14px;text-align:left;font-weight:600" data-i18n="padmin.label_question">Fråga</th>
                        <th style="padding:10px 14px;text-align:left;font-weight:600" data-i18n="padmin.label_category">Kategori</th>
                        <th style="padding:10px 14px;text-align:center;font-weight:600" data-i18n="padmin.label_trait">Trait</th>
                        <th style="padding:10px 14px;text-align:center;font-weight:600" data-i18n="padmin.label_active">Aktiv</th>
                        <th style="padding:10px 14px"></th>
                    </tr>
                </thead>
                <tbody>
                    ${questions.map(q => {
                        const tc = traitColors[q.big_five_trait] || 'var(--text-muted)';
                        const active = q.is_active
                            ? '<span style="color:var(--green)">✓</span>'
                            : '<span style="color:var(--text-muted)">–</span>';
                        return `
                        <tr style="border-bottom:1px solid var(--border)">
                            <td style="padding:10px 14px;color:var(--text-muted)">${q.order_index}</td>
                            <td style="padding:10px 14px;max-width:380px">${esc(q.question_text)}</td>
                            <td style="padding:10px 14px;color:var(--text-muted)">${esc(q.category || '–')}</td>
                            <td style="padding:10px 14px;text-align:center">
                                ${q.big_five_trait
                                    ? `<span style="font-weight:700;color:${tc}">${q.big_five_trait}</span>`
                                    : '–'}
                            </td>
                            <td style="padding:10px 14px;text-align:center">${active}</td>
                            <td style="padding:10px 14px;text-align:right;white-space:nowrap">
                                <button class="btn-icon" onclick="editAdminQuestion(${q.id})"
                                    title="${t('action.edit')}">&#9998;</button>
                                <button class="btn-icon btn-icon-danger" onclick="deleteAdminQuestion(${q.id})"
                                    title="${t('action.delete')}">&times;</button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

function showAddQuestionForm() {
    _padminEditingId = null;
    _renderAdminForm(null);
}

async function editAdminQuestion(id) {
    _padminEditingId = id;
    const res = await apiFetch(`${API_BASE_URL}/personality/questions?include_inactive=true`);
    if (!res.ok) return;
    const all = await res.json();
    const q = all.find(x => x.id === id);
    if (q) _renderAdminForm(q);
}

function _renderAdminForm(q) {
    const container = document.getElementById('padmin-form-container');
    if (!container) return;

    container.innerHTML = `
        <div class="card" style="margin-bottom:20px">
            <h3 class="card-title">${q ? t('action.edit') : t('padmin.add_question')}</h3>
            <div class="form-group">
                <label class="form-label">${t('padmin.label_question')} *</label>
                <textarea id="pf-question" class="form-input" rows="3" style="resize:vertical">${esc(q?.question_text || '')}</textarea>
            </div>
            <div class="form-group">
                <label class="form-label">${t('padmin.label_context')}</label>
                <textarea id="pf-context" class="form-input" rows="2" style="resize:vertical">${esc(q?.context || '')}</textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px">
                <div class="form-group">
                    <label class="form-label">${t('padmin.label_category')}</label>
                    <input type="text" id="pf-category" class="form-input" value="${esc(q?.category || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">${t('padmin.label_trait')}</label>
                    <select id="pf-trait" class="form-input">
                        <option value="">–</option>
                        ${['O','C','E','A','N'].map(tr =>
                            `<option value="${tr}" ${q?.big_five_trait === tr ? 'selected' : ''}>${tr}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">${t('padmin.label_direction')}</label>
                    <select id="pf-dir" class="form-input">
                        <option value="">–</option>
                        <option value="1"  ${q?.big_five_dir ===  1 ? 'selected' : ''}>+1</option>
                        <option value="-1" ${q?.big_five_dir === -1 ? 'selected' : ''}>–1</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">${t('padmin.label_order')}</label>
                    <input type="number" id="pf-order" class="form-input" value="${q?.order_index ?? 0}" min="0">
                </div>
            </div>
            <div class="form-group" style="display:flex;align-items:center;gap:8px">
                <input type="checkbox" id="pf-active" ${(!q || q.is_active) ? 'checked' : ''}>
                <label for="pf-active">${t('padmin.label_active')}</label>
            </div>
            <div id="pf-similar-warning"></div>
            <div style="display:flex;gap:10px;margin-top:4px">
                <button class="btn btn-secondary" onclick="cancelAdminForm()">${t('padmin.cancel')}</button>
                <button class="btn btn-primary" onclick="saveAdminQuestion()">${t('padmin.save')}</button>
            </div>
        </div>`;
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelAdminForm() {
    const container = document.getElementById('padmin-form-container');
    if (container) container.innerHTML = '';
    _padminEditingId = null;
}

async function saveAdminQuestion(force = false) {
    const questionText = document.getElementById('pf-question')?.value.trim();
    if (!questionText) return;

    // Duplicate check for both new and edited questions, unless forced
    if (!force) {
        const checkRes = await apiFetch(`${API_BASE_URL}/personality/questions/check-similar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question_text: questionText }),
        });
        if (checkRes.ok) {
            const { matches } = await checkRes.json();
            // When editing, exclude the question itself from matches
            const filtered = matches.filter(m => m.id !== _padminEditingId);
            if (filtered.length > 0) {
                const top = filtered[0];
                const pct = Math.round(top.similarity * 100);
                const warnEl = document.getElementById('pf-similar-warning');
                if (warnEl) {
                    warnEl.innerHTML = `
                        <div style="background:var(--warning-bg,#fff8e1);border:1px solid var(--warning-border,#ffe082);border-radius:6px;padding:12px;margin-bottom:10px">
                            <strong style="color:#b45309">${t('padmin.similar_warning') || 'Liknande fråga finns redan'} (${pct}%)</strong>
                            <p style="margin:6px 0 10px;font-size:0.88rem;color:var(--text)">"${esc(top.question_text)}"</p>
                            <div style="display:flex;gap:8px">
                                <button class="btn btn-secondary btn-sm" onclick="document.getElementById('pf-similar-warning').innerHTML=''">${t('padmin.cancel') || 'Avbryt'}</button>
                                <button class="btn btn-primary btn-sm" onclick="saveAdminQuestion(true)">${t('padmin.save_anyway') || 'Spara ändå'}</button>
                            </div>
                        </div>`;
                    warnEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                return;
            }
        }
    }

    // Clear any warning
    const warnEl = document.getElementById('pf-similar-warning');
    if (warnEl) warnEl.innerHTML = '';

    const dirRaw = document.getElementById('pf-dir')?.value;
    const body = {
        question_text:  questionText,
        context:        document.getElementById('pf-context')?.value.trim() || null,
        category:       document.getElementById('pf-category')?.value.trim() || null,
        big_five_trait: document.getElementById('pf-trait')?.value || null,
        big_five_dir:   dirRaw ? parseInt(dirRaw) : null,
        order_index:    parseInt(document.getElementById('pf-order')?.value || '0'),
        is_active:      document.getElementById('pf-active')?.checked ?? true,
    };

    const url    = _padminEditingId
        ? `${API_BASE_URL}/personality/questions/${_padminEditingId}`
        : `${API_BASE_URL}/personality/questions`;
    const method = _padminEditingId ? 'PUT' : 'POST';

    const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (res.ok) {
        cancelAdminForm();
        await loadPersonalityAdmin();
    }
}

async function deleteAdminQuestion(id) {
    if (!confirm(t('padmin.confirm_delete'))) return;
    const res = await apiFetch(`${API_BASE_URL}/personality/questions/${id}`, { method: 'DELETE' });
    if (res.ok) await loadPersonalityAdmin();
}

// ════════════════════════════════════════════════════════════════════════════
// PERSONALITY DESCRIPTION MODAL
// ════════════════════════════════════════════════════════════════════════════

async function generatePersonalityDescription() {
    // Open modal in loading state
    document.getElementById('pdesc-modal').classList.remove('hidden');
    document.getElementById('pdesc-loading').classList.remove('hidden');
    document.getElementById('pdesc-error').classList.add('hidden');
    document.getElementById('pdesc-content').classList.add('hidden');
    document.getElementById('pdesc-download-btn').classList.add('hidden');
    document.getElementById('pdesc-raw').value = '';

    const res = await apiFetch(`${API_BASE_URL}/personality/description`, { method: 'POST' });
    document.getElementById('pdesc-loading').classList.add('hidden');

    if (!res.ok) {
        const errEl = document.getElementById('pdesc-error');
        errEl.classList.remove('hidden');
        try {
            const body = await res.json();
            const detail = body.detail || {};
            const code = detail.code || '';
            if (code === 'too_few_answers') {
                const pct = detail.pct ?? '?';
                const ans = detail.answered ?? '?';
                const tot = detail.total ?? '?';
                errEl.textContent = t('person.desc_err_few_answers')
                    .replace('{pct}', pct)
                    .replace('{ans}', ans)
                    .replace('{tot}', tot);
            } else if (code === 'too_few_categories') {
                const cats = detail.categories ?? '?';
                const need = detail.needed ?? 5;
                errEl.textContent = t('person.desc_err_few_cats')
                    .replace('{cats}', cats)
                    .replace('{need}', need);
            } else {
                errEl.textContent = t('person.desc_err_generic') || 'Generering misslyckades.';
            }
        } catch {
            errEl.textContent = t('person.desc_err_generic') || 'Generering misslyckades.';
        }
        return;
    }

    const { markdown } = await res.json();
    document.getElementById('pdesc-raw').value = markdown;

    const contentEl = document.getElementById('pdesc-content');
    contentEl.innerHTML = typeof marked !== 'undefined'
        ? marked.parse(markdown)
        : _fallbackMd(markdown);
    contentEl.classList.remove('hidden');
    document.getElementById('pdesc-download-btn').classList.remove('hidden');
}

function closePdescModal() {
    document.getElementById('pdesc-modal').classList.add('hidden');
}

function downloadPersonalityMd() {
    const md = document.getElementById('pdesc-raw').value;
    if (!md) return;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'personlighetsbeskrivning.md';
    a.click();
    URL.revokeObjectURL(url);
}

/** Minimal markdown → HTML fallback (no dependency) */
function _fallbackMd(md) {
    const lines   = md.split('\n');
    let   html    = '';
    let   inList  = false;
    const inline  = s => s
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,'<em>$1</em>')
        .replace(/_(.+?)_/g,'<em>$1</em>');
    for (const raw of lines) {
        const l = raw.trimEnd();
        if (l.startsWith('### '))     { if (inList) { html += '</ul>'; inList=false; } html += `<h3>${inline(l.slice(4))}</h3>`; }
        else if (l.startsWith('## ')) { if (inList) { html += '</ul>'; inList=false; } html += `<h2>${inline(l.slice(3))}</h2>`; }
        else if (l.startsWith('# '))  { if (inList) { html += '</ul>'; inList=false; } html += `<h1>${inline(l.slice(2))}</h1>`; }
        else if (/^[-*] /.test(l))    { if (!inList) { html += '<ul>'; inList=true; }  html += `<li>${inline(l.slice(2))}</li>`; }
        else if (l === '')            { if (inList)  { html += '</ul>'; inList=false; } html += '<br>'; }
        else                          { if (inList)  { html += '</ul>'; inList=false; } html += `<p>${inline(l)}</p>`; }
    }
    if (inList) html += '</ul>';
    return html;
}


// ── Import modal state ────────────────────────────────────────────────────────
let _importState = null;
// {
//   questions: [...],      extracted question list
//   index: 0,              position in queue
//   saved: 0,
//   skipped: 0,
//   cancelled: false,
//   conflictResolve: null, Promise resolve fn while waiting for admin decision
// }

async function importPersonalityMd(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';

    _openImportModal();
    _setImportStatus(t('padmin.extracting') || 'Extraherar frågor med AI…');

    const form = new FormData();
    form.append('file', file);
    const res = await apiFetch(`${API_BASE_URL}/personality/questions/extract`, {
        method: 'POST',
        body: form,
    });

    if (!res.ok) {
        _setImportStatus(t('padmin.extract_failed') || 'Extraktion misslyckades');
        _finishImport(0, 0, false);
        return;
    }

    const { questions } = await res.json();
    if (!questions || !questions.length) {
        _setImportStatus(t('padmin.extract_failed') || 'Extraktion misslyckades');
        _finishImport(0, 0, false);
        return;
    }

    _importState = { questions, index: 0, saved: 0, skipped: 0, cancelled: false, conflictResolve: null };
    await _processImportQueue();
}

async function _processImportQueue() {
    const state = _importState;
    const total = state.questions.length;

    while (state.index < total && !state.cancelled) {
        const q   = state.questions[state.index];
        const cur = state.index + 1;

        _setImportProgress(Math.round((state.index / total) * 100));
        _setImportStatus(`${t('padmin.processing_q') || 'Bearbetar fråga'} ${cur} ${t('padmin.of') || 'av'} ${total}`);

        // Check for similar existing question
        const checkRes = await apiFetch(`${API_BASE_URL}/personality/questions/check-similar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question_text: q.question_text }),
        });

        if (state.cancelled) break;

        let decision = 'use_both'; // default: just save
        if (checkRes.ok) {
            const { matches } = await checkRes.json();
            if (matches.length > 0) {
                decision = await _showConflictAndWait(matches[0], q);
                if (state.cancelled) break;
                document.getElementById('import-conflict').classList.add('hidden');
            }
        }

        if (decision === 'use_new') {
            // Replace: delete existing (id stored when conflict UI was shown), save new
            const existingId = _importState._lastExistingId;
            if (existingId) {
                await apiFetch(`${API_BASE_URL}/personality/questions/${existingId}`, { method: 'DELETE' });
            }
            await _saveOneImportedQuestion(q, state.index);
            state.saved++;
        } else if (decision === 'keep') {
            state.skipped++;
        } else {
            // 'use_both' or no conflict: just save
            await _saveOneImportedQuestion(q, state.index);
            state.saved++;
        }

        state.index++;
    }

    _setImportProgress(100);
    _finishImport(state.saved, state.skipped, state.cancelled);
}

function _showConflictAndWait(existing, newQ) {
    _importState._lastExistingId = existing.id;
    document.getElementById('import-existing-card').innerHTML = _importQCardHtml(existing);
    document.getElementById('import-new-card').innerHTML      = _importQCardHtml(newQ);
    document.getElementById('import-conflict').classList.remove('hidden');
    _setImportStatus('');
    return new Promise(resolve => {
        _importState.conflictResolve = resolve;
    });
}

function resolveImportConflict(decision) {
    document.getElementById('import-conflict').classList.add('hidden');
    if (_importState?.conflictResolve) {
        const resolve = _importState.conflictResolve;
        _importState.conflictResolve = null;
        resolve(decision);
    }
}

async function cancelImport() {
    if (_importState) {
        _importState.cancelled = true;
        if (_importState.conflictResolve) {
            const resolve = _importState.conflictResolve;
            _importState.conflictResolve = null;
            resolve('keep');
        }
    }
}

function closeImportModal() {
    document.getElementById('import-md-modal').classList.add('hidden');
    _importState = null;
    loadPersonalityAdmin();
}

function _openImportModal() {
    const modal = document.getElementById('import-md-modal');
    modal.classList.remove('hidden');
    document.getElementById('import-progress-bar').style.width = '0%';
    document.getElementById('import-status-text').textContent  = '';
    document.getElementById('import-conflict').classList.add('hidden');
    document.getElementById('import-done-text').classList.add('hidden');
    document.getElementById('import-done-text').textContent    = '';
    document.getElementById('import-cancel-btn').classList.remove('hidden');
    document.getElementById('import-close-btn').classList.add('hidden');
}

function _setImportStatus(text) {
    document.getElementById('import-status-text').textContent = text;
}

function _setImportProgress(pct) {
    document.getElementById('import-progress-bar').style.width = pct + '%';
}

function _finishImport(saved, skipped, cancelled) {
    const statusPart = `${saved} ${t('padmin.q_saved') || 'sparade'}, ${skipped} ${t('padmin.q_skipped') || 'hoppade över'}`;
    const prefix = cancelled ? t('padmin.import_aborted') || 'Import avbruten' : t('padmin.import_done') || 'Import klar!';
    const doneEl = document.getElementById('import-done-text');
    doneEl.textContent = `${prefix} — ${statusPart}`;
    doneEl.classList.remove('hidden');
    _setImportStatus('');
    document.getElementById('import-cancel-btn').classList.add('hidden');
    document.getElementById('import-close-btn').classList.remove('hidden');
}

async function _saveOneImportedQuestion(q, orderHint) {
    await apiFetch(`${API_BASE_URL}/personality/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question_text:  q.question_text,
            context:        q.context        || null,
            category:       q.category       || null,
            big_five_trait: q.big_five_trait  || null,
            big_five_dir:   q.big_five_dir    || null,
            order_index:    orderHint,
            is_active:      true,
        }),
    });
}

function _importQCardHtml(q) {
    let html = `<div class="import-q-text">${esc(q.question_text)}</div>`;
    if (q.context)        html += `<div class="import-q-ctx">${esc(q.context)}</div>`;
    if (q.category)       html += `<div class="import-q-meta">${esc(q.category)}</div>`;
    if (q.big_five_trait) html += `<div class="import-q-trait">Big Five: ${esc(q.big_five_trait)} (${q.big_five_dir > 0 ? '+' : ''}${q.big_five_dir})</div>`;
    if (q.similarity)     html += `<div class="import-q-similarity">${t('padmin.similarity_label') || 'Likhet'}: ${Math.round(q.similarity * 100)}%</div>`;
    return html;
}
