// ── PERSONALITY MODULE ────────────────────────────────────────────────────────
// Depends on: app-state.js (apiFetch, API_BASE_URL, currentUser, t, esc)

// ── State ─────────────────────────────────────────────────────────────────────
let _qmCurrentQuestion = null;   // question being shown in modal
let _padminEditingId   = null;   // question id being edited in admin form


// ════════════════════════════════════════════════════════════════════════════
// KANDIDAT — "Min person" view
// ════════════════════════════════════════════════════════════════════════════

async function loadMyPerson() {
    const res = await apiFetch(`${API_BASE_URL}/personality/answers`);
    if (!res.ok) return;
    const data = await res.json();
    _renderPersonProgress(data.answered, data.total);
    _renderPersonAnswers(data.answers);
}

function _renderPersonProgress(answered, total) {
    const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
    const bar = document.getElementById('person-progress-bar');
    const txt = document.getElementById('person-progress-text');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = `${answered} / ${total}`;
}

function _renderPersonAnswers(answers) {
    const el = document.getElementById('person-answers-list');
    if (!el) return;
    if (!answers.length) {
        el.innerHTML = `<p class="text-muted" style="text-align:center;padding:24px">${t('person.no_answers')}</p>`;
        return;
    }

    // Group by category
    const groups = {};
    for (const a of answers) {
        const cat = a.category || '–';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(a);
    }

    el.innerHTML = Object.entries(groups).map(([cat, items]) => `
        <div class="card" style="margin-bottom:16px">
            <h3 class="card-title" style="margin-bottom:12px">${esc(cat)}</h3>
            ${items.map(a => _answerCardHtml(a)).join('')}
        </div>
    `).join('');
}

function _answerCardHtml(a) {
    const likertStr = a.likert_score ? `<span class="personality-likert">${a.likert_score}/5</span>` : '';
    return `
        <div class="personality-answer-card" id="pa-card-${a.id}">
            <div class="personality-answer-q">${esc(a.question_text)}</div>
            ${a.context ? `<div class="personality-answer-ctx">${esc(a.context)}</div>` : ''}
            <div class="personality-answer-row">
                <div class="personality-answer-text" id="pa-text-${a.id}">${esc(a.answer_text)}</div>
                ${likertStr}
                <button class="btn-icon" onclick="editPersonAnswer(${a.id}, ${a.question_id})"
                    title="${t('person.edit_answer')}">&#9998;</button>
            </div>
            <div id="pa-edit-${a.id}"></div>
        </div>`;
}

function editPersonAnswer(answerId, questionId) {
    const container = document.getElementById(`pa-edit-${answerId}`);
    const textEl    = document.getElementById(`pa-text-${answerId}`);
    if (!container || !textEl) return;
    const currentText = textEl.textContent;

    container.innerHTML = `
        <textarea class="form-input" id="pa-edit-ta-${answerId}" rows="3"
            style="width:100%;margin-top:8px;resize:vertical">${esc(currentText)}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end">
            <button class="btn btn-secondary btn-sm"
                onclick="cancelPersonEdit(${answerId})">${t('person.cancel')}</button>
            <button class="btn btn-primary btn-sm"
                onclick="savePersonAnswer(${answerId}, ${questionId})">${t('person.save_answer')}</button>
        </div>`;
}

function cancelPersonEdit(answerId) {
    const container = document.getElementById(`pa-edit-${answerId}`);
    if (container) container.innerHTML = '';
}

async function savePersonAnswer(answerId, questionId) {
    const ta = document.getElementById(`pa-edit-ta-${answerId}`);
    if (!ta) return;
    const text = ta.value.trim();
    if (!text) return;

    const res = await apiFetch(`${API_BASE_URL}/personality/answers/${answerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: questionId, answer_text: text }),
    });
    if (res.ok) {
        const updated = await res.json();
        const textEl = document.getElementById(`pa-text-${answerId}`);
        if (textEl) textEl.textContent = updated.answer_text;
        cancelPersonEdit(answerId);
    }
}


// ════════════════════════════════════════════════════════════════════════════
// "FRÅGA MIG!" MODAL
// ════════════════════════════════════════════════════════════════════════════

async function startQuestionMe() {
    await _fetchAndShowNextQuestion();
}

async function _fetchAndShowNextQuestion() {
    const res = await apiFetch(`${API_BASE_URL}/personality/answers/next`);
    if (!res.ok) return;
    const data = await res.json();

    if (data.done) {
        _showQuestionModal(null);
        return;
    }
    _qmCurrentQuestion = data.question;
    _showQuestionModal(data.question);
}

function _showQuestionModal(question) {
    const modal = document.getElementById('question-me-modal');
    if (!modal) return;

    if (!question) {
        // All done
        document.getElementById('qm-question-text').textContent = t('person.all_done');
        document.getElementById('qm-context-text').textContent  = '';
        document.getElementById('qm-category').textContent      = '';
        document.getElementById('qm-answer-text').value         = '';
        document.querySelectorAll('input[name="qm-likert"]').forEach(r => r.checked = false);
        modal.classList.remove('hidden');
        return;
    }

    document.getElementById('qm-category').textContent      = question.category || '';
    document.getElementById('qm-question-text').textContent  = question.question_text;
    document.getElementById('qm-context-text').textContent   = question.context || '';
    document.getElementById('qm-answer-text').value          = '';
    document.getElementById('qm-char-count').textContent     = '0 / 500';
    document.getElementById('qm-error').classList.add('hidden');
    document.querySelectorAll('input[name="qm-likert"]').forEach(r => r.checked = false);

    // Show likert only for Big Five trait questions
    const hasTraint = !!question.big_five_trait;
    document.getElementById('qm-likert-section').classList.toggle('hidden', !hasTraint);

    modal.classList.remove('hidden');
}

function closeQuestionMe() {
    const modal = document.getElementById('question-me-modal');
    if (modal) modal.classList.add('hidden');
    _qmCurrentQuestion = null;
    loadMyPerson();
}

async function skipQuestion() {
    await _fetchAndShowNextQuestion();
}

async function submitQuestionMe() {
    if (!_qmCurrentQuestion) { closeQuestionMe(); return; }

    const text = document.getElementById('qm-answer-text').value.trim();
    const errEl = document.getElementById('qm-error');
    if (!text) {
        errEl.textContent = t('person.answer_ph');
        errEl.classList.remove('hidden');
        return;
    }
    errEl.classList.add('hidden');

    const likertInput = document.querySelector('input[name="qm-likert"]:checked');
    const likert = likertInput ? parseInt(likertInput.value) : null;

    const res = await apiFetch(`${API_BASE_URL}/personality/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question_id:  _qmCurrentQuestion.id,
            answer_text:  text,
            likert_score: likert,
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        errEl.textContent = err.detail || 'Fel vid sparning';
        errEl.classList.remove('hidden');
        return;
    }

    await _fetchAndShowNextQuestion();
}


// ════════════════════════════════════════════════════════════════════════════
// ADMIN — "Personlighetsfrågor" view
// ════════════════════════════════════════════════════════════════════════════

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

async function saveAdminQuestion() {
    const questionText = document.getElementById('pf-question')?.value.trim();
    if (!questionText) return;

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
