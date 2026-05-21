/**
 * db.js — IndexedDB wrapper för CV Optimizer (browser-only version)
 * Databasen: "cv-optimizer", version 1
 */

const DB_NAME = 'cv-optimizer';
const DB_VERSION = 1;

let _db = null;

function _openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('skills')) {
        const skills = db.createObjectStore('skills', { keyPath: 'id', autoIncrement: true });
        skills.createIndex('skill_name', 'skill_name', { unique: true });
      }

      if (!db.objectStoreNames.contains('experiences')) {
        const exp = db.createObjectStore('experiences', { keyPath: 'id', autoIncrement: true });
        exp.createIndex('experience_type', 'experience_type', { unique: false });
      }

      if (!db.objectStoreNames.contains('cvs')) {
        db.createObjectStore('cvs', { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('education')) {
        db.createObjectStore('education', { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('certifications')) {
        db.createObjectStore('certifications', { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('pq')) {
        const pq = db.createObjectStore('pq', { keyPath: 'id' });
        pq.createIndex('category', 'category', { unique: false });
        pq.createIndex('is_active', 'is_active', { unique: false });
      }

      if (!db.objectStoreNames.contains('pa')) {
        const pa = db.createObjectStore('pa', { keyPath: 'id', autoIncrement: true });
        pa.createIndex('question_id', 'question_id', { unique: true });
      }

      if (!db.objectStoreNames.contains('search_profiles')) {
        db.createObjectStore('search_profiles', { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function _tx(storeName, mode, fn) {
  return new Promise(async (resolve, reject) => {
    const stores = Array.isArray(storeName) ? storeName : [storeName];
    const tx = _db.transaction(stores, mode);
    tx.onerror = () => reject(tx.error);
    try {
      const result = await fn(tx);
      resolve(result);
    } catch (err) {
      tx.abort();
      reject(err);
    }
  });
}

function _req(idbReq) {
  return new Promise((resolve, reject) => {
    idbReq.onsuccess = () => resolve(idbReq.result);
    idbReq.onerror = () => reject(idbReq.error);
  });
}

// ─── profile ────────────────────────────────────────────────────────────────

const profile = {
  async get() {
    return _tx('profile', 'readonly', (tx) =>
      _req(tx.objectStore('profile').get('singleton'))
    );
  },
  async save(data) {
    const obj = { ...data, id: 'singleton' };
    await _tx('profile', 'readwrite', (tx) =>
      _req(tx.objectStore('profile').put(obj))
    );
    return obj;
  },
};

// ─── skills ─────────────────────────────────────────────────────────────────

const skills = {
  async list() {
    return _tx('skills', 'readonly', (tx) =>
      _req(tx.objectStore('skills').getAll())
    );
  },
  async add(data) {
    return _tx('skills', 'readwrite', async (tx) => {
      const store = tx.objectStore('skills');
      const id = await _req(store.add({
        skill_name: data.skill_name,
        category: data.category ?? null,
        skill_type: data.skill_type ?? null,
        source_cv_ids: data.source_cv_ids ?? [],
        embedding: data.embedding ?? null,
      }));
      return _req(store.get(id));
    });
  },
  async update(id, data) {
    return _tx('skills', 'readwrite', async (tx) => {
      const store = tx.objectStore('skills');
      const existing = await _req(store.get(id));
      if (!existing) throw new Error(`Skill ${id} not found`);
      const updated = { ...existing, ...data, id };
      await _req(store.put(updated));
      return updated;
    });
  },
  async delete(id) {
    return _tx('skills', 'readwrite', (tx) =>
      _req(tx.objectStore('skills').delete(id))
    );
  },
  async deleteAll() {
    return _tx('skills', 'readwrite', (tx) =>
      _req(tx.objectStore('skills').clear())
    );
  },
  async stats() {
    const all = await skills.list();
    const by_category = {};
    for (const s of all) {
      const cat = s.category || 'Okategoriserad';
      by_category[cat] = (by_category[cat] || 0) + 1;
    }
    return { total: all.length, by_category };
  },
};

// ─── experiences ─────────────────────────────────────────────────────────────

const experiences = {
  async list() {
    return _tx('experiences', 'readonly', (tx) =>
      _req(tx.objectStore('experiences').getAll())
    );
  },
  async get(id) {
    return _tx('experiences', 'readonly', (tx) =>
      _req(tx.objectStore('experiences').get(id))
    );
  },
  async add(data) {
    return _tx('experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('experiences');
      const id = await _req(store.add({
        title: data.title,
        organization: data.organization ?? null,
        experience_type: data.experience_type ?? 'work',
        start_date: data.start_date ?? null,
        end_date: data.end_date ?? null,
        is_current: data.is_current ?? false,
        description: data.description ?? null,
        achievements: data.achievements ?? [],
        related_skills: data.related_skills ?? [],
        source_cv_ids: data.source_cv_ids ?? [],
        embedding: data.embedding ?? null,
      }));
      return _req(store.get(id));
    });
  },
  async update(id, data) {
    return _tx('experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('experiences');
      const existing = await _req(store.get(id));
      if (!existing) throw new Error(`Experience ${id} not found`);
      const updated = { ...existing, ...data, id };
      await _req(store.put(updated));
      return updated;
    });
  },
  async delete(id) {
    return _tx('experiences', 'readwrite', (tx) =>
      _req(tx.objectStore('experiences').delete(id))
    );
  },
  async deleteAll() {
    return _tx('experiences', 'readwrite', (tx) =>
      _req(tx.objectStore('experiences').clear())
    );
  },

  async addAchievement(id, text) {
    return _tx('experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`Experience ${id} not found`);
      exp.achievements = [...(exp.achievements ?? []), text];
      await _req(store.put(exp));
      return exp;
    });
  },
  async updateAchievement(id, index, text) {
    return _tx('experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`Experience ${id} not found`);
      exp.achievements[index] = text;
      await _req(store.put(exp));
      return exp;
    });
  },
  async deleteAchievement(id, index) {
    return _tx('experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`Experience ${id} not found`);
      exp.achievements.splice(index, 1);
      await _req(store.put(exp));
      return exp;
    });
  },
  async replaceAchievements(id, list) {
    return _tx('experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`Experience ${id} not found`);
      exp.achievements = list;
      await _req(store.put(exp));
      return exp;
    });
  },
  async updateDescription(id, text) {
    return experiences.update(id, { description: text });
  },
  async updatePeriod(id, { start_date, end_date, is_current }) {
    return experiences.update(id, { start_date, end_date, is_current });
  },
  async addSkill(id, skillName) {
    return _tx('experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`Experience ${id} not found`);
      if (!exp.related_skills.includes(skillName)) {
        exp.related_skills = [...exp.related_skills, skillName];
        await _req(store.put(exp));
      }
      return exp;
    });
  },
  async removeSkill(id, index) {
    return _tx('experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`Experience ${id} not found`);
      exp.related_skills.splice(index, 1);
      await _req(store.put(exp));
      return exp;
    });
  },
};

// ─── cvs ────────────────────────────────────────────────────────────────────

const cvs = {
  async list() {
    return _tx('cvs', 'readonly', (tx) =>
      _req(tx.objectStore('cvs').getAll())
    );
  },
  async get(id) {
    return _tx('cvs', 'readonly', (tx) =>
      _req(tx.objectStore('cvs').get(id))
    );
  },
  async add(data) {
    return _tx('cvs', 'readwrite', async (tx) => {
      const store = tx.objectStore('cvs');
      const id = await _req(store.add({
        filename: data.filename,
        title: data.title ?? data.filename,
        upload_date: data.upload_date ?? new Date().toISOString(),
        original_text: data.original_text ?? '',
        structured_data: data.structured_data ?? {},
      }));
      return _req(store.get(id));
    });
  },
  async delete(id) {
    return _tx('cvs', 'readwrite', (tx) =>
      _req(tx.objectStore('cvs').delete(id))
    );
  },
  async updateTitle(id, title) {
    return _tx('cvs', 'readwrite', async (tx) => {
      const store = tx.objectStore('cvs');
      const cv = await _req(store.get(id));
      if (!cv) throw new Error(`CV ${id} not found`);
      cv.title = title;
      await _req(store.put(cv));
      return cv;
    });
  },
};

// ─── education ──────────────────────────────────────────────────────────────

const education = {
  async list() {
    return _tx('education', 'readonly', (tx) =>
      _req(tx.objectStore('education').getAll())
    );
  },
  async add(data) {
    return _tx('education', 'readwrite', async (tx) => {
      const store = tx.objectStore('education');
      const id = await _req(store.add({
        degree: data.degree,
        institution: data.institution ?? null,
        field_of_study: data.field_of_study ?? null,
        start_date: data.start_date ?? null,
        end_date: data.end_date ?? null,
        description: data.description ?? null,
        source_cv_id: data.source_cv_id ?? null,
      }));
      return _req(store.get(id));
    });
  },
  async update(id, data) {
    return _tx('education', 'readwrite', async (tx) => {
      const store = tx.objectStore('education');
      const existing = await _req(store.get(id));
      if (!existing) throw new Error(`Education ${id} not found`);
      const updated = { ...existing, ...data, id };
      await _req(store.put(updated));
      return updated;
    });
  },
  async delete(id) {
    return _tx('education', 'readwrite', (tx) =>
      _req(tx.objectStore('education').delete(id))
    );
  },
  async deleteAll() {
    return _tx('education', 'readwrite', (tx) =>
      _req(tx.objectStore('education').clear())
    );
  },
};

// ─── certifications ──────────────────────────────────────────────────────────

const certifications = {
  async list() {
    return _tx('certifications', 'readonly', (tx) =>
      _req(tx.objectStore('certifications').getAll())
    );
  },
  async add(data) {
    return _tx('certifications', 'readwrite', async (tx) => {
      const store = tx.objectStore('certifications');
      const id = await _req(store.add({
        name: data.name,
        issuer: data.issuer ?? null,
        date_issued: data.date_issued ?? null,
        expiry_date: data.expiry_date ?? null,
        credential_id: data.credential_id ?? null,
        credential_url: data.credential_url ?? null,
        source_cv_id: data.source_cv_id ?? null,
      }));
      return _req(store.get(id));
    });
  },
  async update(id, data) {
    return _tx('certifications', 'readwrite', async (tx) => {
      const store = tx.objectStore('certifications');
      const existing = await _req(store.get(id));
      if (!existing) throw new Error(`Certification ${id} not found`);
      const updated = { ...existing, ...data, id };
      await _req(store.put(updated));
      return updated;
    });
  },
  async delete(id) {
    return _tx('certifications', 'readwrite', (tx) =>
      _req(tx.objectStore('certifications').delete(id))
    );
  },
  async deleteAll() {
    return _tx('certifications', 'readwrite', (tx) =>
      _req(tx.objectStore('certifications').clear())
    );
  },
};

// ─── pq (personality questions) ──────────────────────────────────────────────

const pq = {
  async list({ active_only = false } = {}) {
    const all = await _tx('pq', 'readonly', (tx) =>
      _req(tx.objectStore('pq').getAll())
    );
    return active_only ? all.filter((q) => q.is_active) : all;
  },
  async get(id) {
    return _tx('pq', 'readonly', (tx) =>
      _req(tx.objectStore('pq').get(id))
    );
  },
  async add(data) {
    return _tx('pq', 'readwrite', async (tx) => {
      const store = tx.objectStore('pq');
      // Auto-assign id if not provided
      const obj = {
        question_text: data.question_text,
        context: data.context ?? null,
        category: data.category ?? null,
        big_five_trait: data.big_five_trait ?? null,
        big_five_dir: data.big_five_dir ?? null,
        is_active: data.is_active ?? true,
        embedding: data.embedding ?? null,
      };
      if (data.id != null) obj.id = data.id;
      const id = await _req(store.add(obj));
      return _req(store.get(id));
    });
  },
  async update(id, data) {
    return _tx('pq', 'readwrite', async (tx) => {
      const store = tx.objectStore('pq');
      const existing = await _req(store.get(id));
      if (!existing) throw new Error(`Question ${id} not found`);
      const updated = { ...existing, ...data, id };
      await _req(store.put(updated));
      return updated;
    });
  },
  async delete(id) {
    return _tx('pq', 'readwrite', (tx) =>
      _req(tx.objectStore('pq').delete(id))
    );
  },
  async seed(questions) {
    return _tx('pq', 'readwrite', async (tx) => {
      const store = tx.objectStore('pq');
      for (const q of questions) {
        const existing = await _req(store.get(q.id));
        if (!existing) await _req(store.add(q));
      }
    });
  },
};

// ─── pa (personality answers) ─────────────────────────────────────────────────

const pa = {
  async list() {
    return _tx('pa', 'readonly', (tx) =>
      _req(tx.objectStore('pa').getAll())
    );
  },
  async getByQuestion(questionId) {
    return _tx('pa', 'readonly', (tx) =>
      _req(tx.objectStore('pa').index('question_id').get(questionId))
    );
  },
  async upsert(questionId, { answer_text, likert_score, embedding }) {
    return _tx('pa', 'readwrite', async (tx) => {
      const store = tx.objectStore('pa');
      const existing = await _req(store.index('question_id').get(questionId));
      const updated = {
        ...(existing ?? {}),
        question_id: questionId,
        answer_text: answer_text ?? existing?.answer_text ?? '',
        likert_score: likert_score ?? existing?.likert_score ?? null,
        embedding: embedding ?? existing?.embedding ?? null,
        updated_at: new Date().toISOString(),
      };
      if (existing) {
        updated.id = existing.id;
        await _req(store.put(updated));
      } else {
        const id = await _req(store.add(updated));
        updated.id = id;
      }
      return updated;
    });
  },
  async nextUnanswered(skipIds = []) {
    const allQuestions = await pq.list({ active_only: true });
    const allAnswers = await pa.list();
    const answeredIds = new Set(allAnswers.map((a) => a.question_id));
    return (
      allQuestions.find(
        (q) => !answeredIds.has(q.id) && !skipIds.includes(q.id)
      ) ?? null
    );
  },
  async bigFiveScores() {
    const allAnswers = await pa.list();
    const allQuestions = await pq.list();
    const qMap = Object.fromEntries(allQuestions.map((q) => [q.id, q]));

    const sums = { O: 0, C: 0, E: 0, A: 0, N: 0 };
    const counts = { O: 0, C: 0, E: 0, A: 0, N: 0 };

    for (const a of allAnswers) {
      const q = qMap[a.question_id];
      if (!q?.big_five_trait || a.likert_score == null) continue;
      const trait = q.big_five_trait;
      const dir = q.big_five_dir ?? 1;
      const score = dir === -1 ? 6 - a.likert_score : a.likert_score;
      sums[trait] += score;
      counts[trait]++;
    }

    const result = {};
    for (const t of ['O', 'C', 'E', 'A', 'N']) {
      result[t] = counts[t] > 0
        ? Math.round(((sums[t] / counts[t] - 1) / 4) * 100)
        : null;
    }
    return result;
  },
};

// ─── searchProfiles ───────────────────────────────────────────────────────────

const searchProfiles = {
  async list() {
    return _tx('search_profiles', 'readonly', (tx) =>
      _req(tx.objectStore('search_profiles').getAll())
    );
  },
  async get(id) {
    return _tx('search_profiles', 'readonly', (tx) =>
      _req(tx.objectStore('search_profiles').get(id))
    );
  },
  async add(data) {
    return _tx('search_profiles', 'readwrite', async (tx) => {
      const store = tx.objectStore('search_profiles');
      const id = await _req(store.add({
        name: data.name,
        roles: data.roles ?? null,
        desired_city: data.desired_city ?? null,
        desired_employment: data.desired_employment ?? [],
        desired_workplace: data.desired_workplace ?? [],
        willing_to_commute: data.willing_to_commute ?? false,
        notes: data.notes ?? null,
        job_description: data.job_description ?? null,
        saved_job_ads: data.saved_job_ads ?? [],
        saved_match_results: data.saved_match_results ?? [],
        created_at: new Date().toISOString(),
      }));
      return _req(store.get(id));
    });
  },
  async update(id, data) {
    return _tx('search_profiles', 'readwrite', async (tx) => {
      const store = tx.objectStore('search_profiles');
      const existing = await _req(store.get(id));
      if (!existing) throw new Error(`SearchProfile ${id} not found`);
      const updated = { ...existing, ...data, id };
      await _req(store.put(updated));
      return updated;
    });
  },
  async delete(id) {
    return _tx('search_profiles', 'readwrite', (tx) =>
      _req(tx.objectStore('search_profiles').delete(id))
    );
  },
  async saveJob(id, jobAd) {
    return _tx('search_profiles', 'readwrite', async (tx) => {
      const store = tx.objectStore('search_profiles');
      const sp = await _req(store.get(id));
      if (!sp) throw new Error(`SearchProfile ${id} not found`);
      sp.saved_job_ads = [...(sp.saved_job_ads ?? []), jobAd];
      await _req(store.put(sp));
      return sp;
    });
  },
  async saveResult(id, result) {
    return _tx('search_profiles', 'readwrite', async (tx) => {
      const store = tx.objectStore('search_profiles');
      const sp = await _req(store.get(id));
      if (!sp) throw new Error(`SearchProfile ${id} not found`);
      sp.saved_match_results = [...(sp.saved_match_results ?? []), result];
      await _req(store.put(sp));
      return sp;
    });
  },
};

// ─── settings ─────────────────────────────────────────────────────────────────

const settings = {
  async get(key) {
    const row = await _tx('settings', 'readonly', (tx) =>
      _req(tx.objectStore('settings').get(key))
    );
    return row?.value ?? null;
  },
  async set(key, value) {
    return _tx('settings', 'readwrite', (tx) =>
      _req(tx.objectStore('settings').put({ key, value }))
    );
  },
  async getAll() {
    const rows = await _tx('settings', 'readonly', (tx) =>
      _req(tx.objectStore('settings').getAll())
    );
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

const cvDb = {
  async init() {
    _db = await _openDB();
  },
  _tx,
  profile,
  skills,
  experiences,
  cvs,
  education,
  certifications,
  pq,
  pa,
  searchProfiles,
  settings,
};

window.cvDb = cvDb;
