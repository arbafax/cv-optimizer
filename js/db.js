/**
 * db.js — IndexedDB wrapper för CV Optimizer (browser-only version)
 * Databasen: "cv-optimizer", version 1
 */

const DB_NAME = 'cv-optimizer';
const DB_VERSION = 5;

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

      if (!db.objectStoreNames.contains('kandidater')) {
        db.createObjectStore('kandidater', { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('kand_skills')) {
        const ks = db.createObjectStore('kand_skills', { keyPath: 'id', autoIncrement: true });
        ks.createIndex('kandidat_id', 'kandidat_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('kand_experiences')) {
        const ke = db.createObjectStore('kand_experiences', { keyPath: 'id', autoIncrement: true });
        ke.createIndex('kandidat_id', 'kandidat_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('kand_education')) {
        const ked = db.createObjectStore('kand_education', { keyPath: 'id', autoIncrement: true });
        ked.createIndex('kandidat_id', 'kandidat_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('kand_certifications')) {
        const kc = db.createObjectStore('kand_certifications', { keyPath: 'id', autoIncrement: true });
        kc.createIndex('kandidat_id', 'kandidat_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('kand_cvs')) {
        const kcv = db.createObjectStore('kand_cvs', { keyPath: 'id', autoIncrement: true });
        kcv.createIndex('kandidat_id', 'kandidat_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('cv_templates')) {
        db.createObjectStore('cv_templates', { keyPath: 'id', autoIncrement: true });
      }

      if (db.objectStoreNames.contains('kand_vectors')) {
        db.deleteObjectStore('kand_vectors');
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
        file_data: data.file_data ?? null,
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

// ─── kandidater ───────────────────────────────────────────────────────────────

function _byKandidatId(storeName, kandidatId) {
  return _tx(storeName, 'readonly', (tx) =>
    _req(tx.objectStore(storeName).index('kandidat_id').getAll(kandidatId))
  );
}

function _deleteByKandidatId(storeName, kandidatId) {
  return _tx(storeName, 'readwrite', async (tx) => {
    const store = tx.objectStore(storeName);
    const all = await _req(store.index('kandidat_id').getAll(kandidatId));
    await Promise.all(all.map(r => _req(store.delete(r.id))));
  });
}

const kandidater = {
  async list() {
    return _tx('kandidater', 'readonly', (tx) =>
      _req(tx.objectStore('kandidater').getAll())
    );
  },
  async get(id) {
    return _tx('kandidater', 'readonly', (tx) =>
      _req(tx.objectStore('kandidater').get(id))
    );
  },
  async add(data) {
    return _tx('kandidater', 'readwrite', async (tx) => {
      const store = tx.objectStore('kandidater');
      const id = await _req(store.add({
        public_name:        data.public_name,
        email:              data.email              ?? null,
        public_phone:       data.public_phone       ?? null,
        roles:              data.roles              ?? null,
        desired_city:       data.desired_city       ?? null,
        desired_employment: data.desired_employment ?? [],
        desired_workplace:  data.desired_workplace  ?? [],
        willing_to_commute: data.willing_to_commute ?? false,
        personal_qualities: data.personal_qualities ?? [],
        searchable:         data.searchable         ?? false,
        available_from:     data.available_from     ?? null,
        description:        data.description        ?? null,
        is_own_profile:     data.is_own_profile     ?? false,
        profile_uuid:       data.profile_uuid       ?? crypto.randomUUID(),
        created_at:         new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      }));
      return _req(store.get(id));
    });
  },
  async getOwn() {
    return _tx('kandidater', 'readonly', async (tx) => {
      const all = await _req(tx.objectStore('kandidater').getAll());
      const ownProfiles = all.filter(k => k.is_own_profile === true);
      if (!ownProfiles.length) return null;
      // If duplicates exist (race condition), pick the highest ID — most recently created, most complete
      return ownProfiles.reduce((best, k) => k.id > best.id ? k : best);
    });
  },
  async update(id, data) {
    return _tx('kandidater', 'readwrite', async (tx) => {
      const store = tx.objectStore('kandidater');
      const existing = await _req(store.get(id));
      if (!existing) throw new Error(`Kandidat ${id} not found`);
      const updated = { ...existing, ...data, id, updated_at: new Date().toISOString() };
      await _req(store.put(updated));
      return updated;
    });
  },
  async delete(id) {
    return _tx('kandidater', 'readwrite', (tx) =>
      _req(tx.objectStore('kandidater').delete(id))
    );
  },
};

const kandSkills = {
  async listFor(kandidatId) { return _byKandidatId('kand_skills', kandidatId); },
  async add(kandidatId, data) {
    return _tx('kand_skills', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_skills');
      const id = await _req(store.add({
        kandidat_id: kandidatId,
        skill_name:  data.skill_name,
        category:    data.category   ?? 'Övrigt',
        skill_level: data.skill_level ?? null,
      }));
      return _req(store.get(id));
    });
  },
  async update(id, data) {
    return _tx('kand_skills', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_skills');
      const existing = await _req(store.get(id));
      if (!existing) throw new Error(`KandSkill ${id} not found`);
      const updated = { ...existing, ...data, id };
      await _req(store.put(updated));
      return updated;
    });
  },
  async delete(id) {
    return _tx('kand_skills', 'readwrite', (tx) =>
      _req(tx.objectStore('kand_skills').delete(id))
    );
  },
  async deleteAll(kandidatId) { return _deleteByKandidatId('kand_skills', kandidatId); },
};

const kandExperiences = {
  async listFor(kandidatId) { return _byKandidatId('kand_experiences', kandidatId); },
  async get(id) {
    return _tx('kand_experiences', 'readonly', (tx) =>
      _req(tx.objectStore('kand_experiences').get(id))
    );
  },
  async add(kandidatId, data) {
    return _tx('kand_experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_experiences');
      const id = await _req(store.add({
        kandidat_id:     kandidatId,
        title:           data.title,
        organization:    data.organization    ?? null,
        experience_type: data.experience_type ?? 'work',
        start_date:      data.start_date      ?? null,
        end_date:        data.end_date        ?? null,
        is_current:      data.is_current      ?? false,
        description:     data.description     ?? null,
        achievements:    data.achievements    ?? [],
      }));
      return _req(store.get(id));
    });
  },
  async update(id, data) {
    return _tx('kand_experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_experiences');
      const existing = await _req(store.get(id));
      if (!existing) throw new Error(`KandExp ${id} not found`);
      const updated = { ...existing, ...data, id };
      await _req(store.put(updated));
      return updated;
    });
  },
  async delete(id) {
    return _tx('kand_experiences', 'readwrite', (tx) =>
      _req(tx.objectStore('kand_experiences').delete(id))
    );
  },
  async deleteAll(kandidatId) { return _deleteByKandidatId('kand_experiences', kandidatId); },

  async addAchievement(id, text) {
    return _tx('kand_experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`KandExp ${id} not found`);
      exp.achievements = [...(exp.achievements ?? []), text];
      await _req(store.put(exp));
      return exp;
    });
  },
  async updateAchievement(id, index, text) {
    return _tx('kand_experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`KandExp ${id} not found`);
      exp.achievements[index] = text;
      await _req(store.put(exp));
      return exp;
    });
  },
  async deleteAchievement(id, index) {
    return _tx('kand_experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`KandExp ${id} not found`);
      exp.achievements.splice(index, 1);
      await _req(store.put(exp));
      return exp;
    });
  },
  async replaceAchievements(id, list) {
    return _tx('kand_experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`KandExp ${id} not found`);
      exp.achievements = list;
      await _req(store.put(exp));
      return exp;
    });
  },
  async updateDescription(id, text) {
    return _tx('kand_experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`KandExp ${id} not found`);
      const updated = { ...exp, description: text };
      await _req(store.put(updated));
      return updated;
    });
  },
  async updatePeriod(id, { start_date, end_date, is_current }) {
    return _tx('kand_experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`KandExp ${id} not found`);
      const updated = { ...exp, start_date, end_date, is_current };
      await _req(store.put(updated));
      return updated;
    });
  },
  async addSkill(id, skillName) {
    return _tx('kand_experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`KandExp ${id} not found`);
      const related = exp.related_skills || [];
      if (!related.includes(skillName)) {
        const updated = { ...exp, related_skills: [...related, skillName] };
        await _req(store.put(updated));
        return updated;
      }
      return exp;
    });
  },
  async removeSkill(id, index) {
    return _tx('kand_experiences', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_experiences');
      const exp = await _req(store.get(id));
      if (!exp) throw new Error(`KandExp ${id} not found`);
      const related = [...(exp.related_skills || [])];
      related.splice(index, 1);
      const updated = { ...exp, related_skills: related };
      await _req(store.put(updated));
      return updated;
    });
  },
};

const kandEducation = {
  async listFor(kandidatId) { return _byKandidatId('kand_education', kandidatId); },
  async add(kandidatId, data) {
    return _tx('kand_education', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_education');
      const id = await _req(store.add({
        kandidat_id:    kandidatId,
        degree:         data.degree,
        institution:    data.institution    ?? null,
        field_of_study: data.field_of_study ?? null,
        start_date:     data.start_date     ?? null,
        end_date:       data.end_date       ?? null,
        description:    data.description    ?? null,
      }));
      return _req(store.get(id));
    });
  },
  async update(id, data) {
    return _tx('kand_education', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_education');
      const existing = await _req(store.get(id));
      if (!existing) throw new Error(`KandEdu ${id} not found`);
      const updated = { ...existing, ...data, id };
      await _req(store.put(updated));
      return updated;
    });
  },
  async delete(id) {
    return _tx('kand_education', 'readwrite', (tx) =>
      _req(tx.objectStore('kand_education').delete(id))
    );
  },
  async deleteAll(kandidatId) { return _deleteByKandidatId('kand_education', kandidatId); },
};

const kandCertifications = {
  async listFor(kandidatId) { return _byKandidatId('kand_certifications', kandidatId); },
  async add(kandidatId, data) {
    return _tx('kand_certifications', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_certifications');
      const id = await _req(store.add({
        kandidat_id: kandidatId,
        name:        data.name,
        issuer:      data.issuer      ?? null,
        date:        data.date        ?? null,
        description: data.description ?? null,
      }));
      return _req(store.get(id));
    });
  },
  async update(id, data) {
    return _tx('kand_certifications', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_certifications');
      const existing = await _req(store.get(id));
      if (!existing) throw new Error(`KandCert ${id} not found`);
      const updated = { ...existing, ...data, id };
      await _req(store.put(updated));
      return updated;
    });
  },
  async delete(id) {
    return _tx('kand_certifications', 'readwrite', (tx) =>
      _req(tx.objectStore('kand_certifications').delete(id))
    );
  },
  async deleteAll(kandidatId) { return _deleteByKandidatId('kand_certifications', kandidatId); },
};

const kandCvs = {
  async listFor(kandidatId) { return _byKandidatId('kand_cvs', kandidatId); },
  async get(id) {
    return _tx('kand_cvs', 'readonly', (tx) =>
      _req(tx.objectStore('kand_cvs').get(id))
    );
  },
  async add(kandidatId, data) {
    return _tx('kand_cvs', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_cvs');
      const id = await _req(store.add({
        kandidat_id:         kandidatId,
        filename:            data.filename,
        title:               data.title ?? data.filename,
        upload_date:         new Date().toISOString(),
        is_processed:        data.is_processed    ?? false,
        is_vectorized:       false,
        mime_type:           data.mime_type        ?? null,
        structured_data:     data.structured_data ?? null,
        file_data:           data.file_data       ?? null,
        skill_count:         data.skill_count         ?? 0,
        experience_count:    data.experience_count    ?? 0,
        education_count:     data.education_count     ?? 0,
        certification_count: data.certification_count ?? 0,
      }));
      return _req(store.get(id));
    });
  },
  async updateTitle(id, title) {
    return _tx('kand_cvs', 'readwrite', async (tx) => {
      const store = tx.objectStore('kand_cvs');
      const cv = await _req(store.get(id));
      if (!cv) throw new Error(`CV ${id} not found`);
      cv.title = title;
      await _req(store.put(cv));
      return cv;
    });
  },
  async delete(id) {
    return _tx('kand_cvs', 'readwrite', (tx) =>
      _req(tx.objectStore('kand_cvs').delete(id))
    );
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
  kandidater,
  kandSkills,
  kandExperiences,
  kandEducation,
  kandCertifications,
  kandCvs,
  searchProfiles,
  settings,
};

window.cvDb = cvDb;
