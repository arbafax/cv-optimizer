/**
 * competence-svc.js — Merge-logik portad från backend/app/services/competence_service.py
 * Hanterar: categoriseSkill, mergeCVIntoBank, mergeAllCVs
 */

// Uses window.cvDb (loaded before this script)

// ─── Skill-kategorisering (regelbaserad) ─────────────────────────────────────

const CATEGORY_RULES = {
  'Mjukvaruutveckling': [
    'python', 'javascript', 'typescript', 'java', 'c#', 'c++', 'c',
    'go', 'rust', 'swift', 'kotlin', 'ruby', 'php', 'scala', 'r',
    'matlab', 'bash', 'powershell', 'perl', 'haskell', 'elixir',
  ],
  'Frameworks & APIs': [
    'fastapi', 'django', 'flask', 'spring', 'express', 'nestjs',
    'rails', 'laravel', 'asp.net', '.net', 'react', 'angular',
    'vue', 'next.js', 'nuxt', 'svelte', 'fastify', 'graphql',
    'rest', 'grpc', 'openapi', 'swagger',
  ],
  'Databases': [
    'postgresql', 'postgres', 'mysql', 'sqlite', 'mongodb', 'redis',
    'elasticsearch', 'cassandra', 'dynamodb', 'firestore', 'oracle',
    'sql server', 'mssql', 'mariadb', 'neo4j', 'pgvector',
  ],
  'Cloud & DevOps': [
    'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes',
    'terraform', 'ansible', 'jenkins', 'github actions', 'ci/cd',
    'helm', 'nginx', 'linux', 'unix', 'heroku', 'vercel', 'netlify',
    's3', 'ec2', 'lambda', 'ecs',
  ],
  'AI & Machine Learning': [
    'machine learning', 'deep learning', 'tensorflow', 'pytorch',
    'scikit-learn', 'keras', 'openai', 'langchain', 'llm',
    'nlp', 'computer vision', 'opencv', 'huggingface', 'transformers',
    'pandas', 'numpy', 'scipy', 'jupyter',
  ],
  'Frontend': [
    'html', 'css', 'sass', 'less', 'tailwind', 'bootstrap',
    'webpack', 'vite', 'babel', 'figma', 'ux', 'ui design',
    'responsive design', 'accessibility', 'wcag',
  ],
  'Tools': [
    'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence',
    'notion', 'slack', 'postman', 'vs code', 'intellij', 'vim',
  ],
  'Soft Skills': [
    'ledarskap', 'kommunikation', 'teamwork', 'problemlösning',
    'agil', 'scrum', 'kanban', 'projektledning', 'mentorskap',
    'leadership', 'communication', 'project management', 'agile',
  ],
  'Languages': [
    'svenska', 'english', 'engelska', 'tyska', 'franska',
    'spanska', 'kinesiska', 'japanese', 'arabic', 'norwegian',
    'danska', 'finska',
  ],
};

function categoriseSkill(skillName) {
  const lower = skillName.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    if (keywords.some(kw => lower.includes(kw))) {
      const skill_type =
        category === 'Soft Skills' ? 'soft' :
        category === 'Languages'   ? 'language' :
        'technical';
      return { category, skill_type };
    }
  }
  return { category: 'Övrigt', skill_type: 'technical' };
}

// ─── Hjälpfunktioner ──────────────────────────────────────────────────────────

function _normalise(text) {
  if (!text) return '';
  return text.toLowerCase().replace(/[^\w\s]/g, '').trim();
}

function _expKey(title, organization, startDate) {
  return `${_normalise(title)}|${_normalise(organization)}|${_normalise(startDate)}`;
}

function _mergeDescriptions(existing, incoming) {
  if (!existing && !incoming) return null;
  if (!existing) return incoming;
  if (!incoming) return existing;

  const splitSentences = (text) =>
    text.trim().split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);

  const existingSentences = splitSentences(existing);
  const incomingSentences = splitSentences(incoming);
  const seenNorm = new Set(existingSentences.map(_normalise));

  const merged = [...existingSentences];
  for (const s of incomingSentences) {
    if (!seenNorm.has(_normalise(s))) {
      merged.push(s);
      seenNorm.add(_normalise(s));
    }
  }
  return merged.join(' ');
}

function _mergeList(existing, incoming) {
  const seen = new Set(existing.map(s => s.toLowerCase()));
  const result = [...existing];
  for (const s of incoming) {
    if (!seen.has(s.toLowerCase())) {
      result.push(s);
      seen.add(s.toLowerCase());
    }
  }
  return result;
}

// ─── Core merge ───────────────────────────────────────────────────────────────

/**
 * Extrahera och upserta skills + erfarenheter från ett CV-objekt (IndexedDB-post).
 * @param {object} cv - post från db.cvs (med .structured_data)
 * @returns {{ skills_added, experiences_added, experiences_merged, duplicates_skipped, cv_name }}
 */
async function mergeCVIntoBank(cv) {
  const data = cv.structured_data || {};
  let skillsAdded = 0;
  let expAdded = 0;
  let expMerged = 0;
  let duplicates = 0;

  // ── Skills ────────────────────────────────────────────────────────────────

  const rawSkills = [
    ...( data.skills || [] ),
    ...( data.work_experience || [] ).flatMap(e => e.technologies || []),
    ...( data.projects || [] ).flatMap(p => p.technologies || []),
  ];

  const seen = new Set();
  const uniqueSkills = [];
  for (const s of rawSkills) {
    const norm = s?.trim();
    if (norm && !seen.has(norm.toLowerCase())) {
      seen.add(norm.toLowerCase());
      uniqueSkills.push(norm);
    }
  }

  const existingSkills = await cvDb.skills.list();
  const skillsByName = Object.fromEntries(existingSkills.map(s => [s.skill_name.toLowerCase(), s]));

  for (const skillName of uniqueSkills) {
    const existing = skillsByName[skillName.toLowerCase()];
    if (existing) {
      const sources = [...(existing.source_cv_ids || [])];
      if (!sources.includes(cv.id)) {
        await cvDb.skills.update(existing.id, { source_cv_ids: [...sources, cv.id] });
      }
      duplicates++;
    } else {
      const { category, skill_type } = categoriseSkill(skillName);
      const newSkill = await cvDb.skills.add({
        skill_name: skillName,
        category,
        skill_type,
        source_cv_ids: [cv.id],
      });
      skillsByName[skillName.toLowerCase()] = newSkill;
      skillsAdded++;
    }
  }

  // ── Experiences ───────────────────────────────────────────────────────────

  const allExp = await cvDb.experiences.list();
  const expByKey = Object.fromEntries(allExp.map(e => [_expKey(e.title, e.organization, e.start_date), e]));

  async function upsertExperience({ title, organization, experience_type, start_date, end_date, is_current, description, related_skills, achievements }) {
    const key = _expKey(title, organization, start_date);
    const existing = expByKey[key];

    if (existing) {
      const updates = {};
      let changed = false;

      const mergedDesc = _mergeDescriptions(existing.description, description);
      if (mergedDesc !== existing.description) { updates.description = mergedDesc; changed = true; }

      const mergedSkills = _mergeList(existing.related_skills || [], related_skills || []);
      if (mergedSkills.length !== (existing.related_skills || []).length) { updates.related_skills = mergedSkills; changed = true; }

      if (achievements?.length) {
        const mergedAch = _mergeList(existing.achievements || [], achievements);
        if (mergedAch.length !== (existing.achievements || []).length) { updates.achievements = mergedAch; changed = true; }
      }

      const sources = [...(existing.source_cv_ids || [])];
      if (!sources.includes(cv.id)) { updates.source_cv_ids = [...sources, cv.id]; changed = true; }

      if (is_current && !existing.is_current) { updates.is_current = true; changed = true; }

      if (changed) {
        const updated = await cvDb.experiences.update(existing.id, updates);
        expByKey[key] = updated;
        expMerged++;
      }
    } else {
      const newExp = await cvDb.experiences.add({
        title, organization, experience_type,
        start_date, end_date, is_current,
        description, achievements: achievements || [],
        related_skills: related_skills || [],
        source_cv_ids: [cv.id],
      });
      expByKey[key] = newExp;
      expAdded++;
    }
  }

  for (const exp of (data.work_experience || [])) {
    await upsertExperience({
      title: exp.position || 'Okänd position',
      organization: exp.company || null,
      experience_type: 'work',
      start_date: exp.start_date || null,
      end_date: exp.end_date || null,
      is_current: Boolean(exp.current),
      description: exp.description || null,
      related_skills: exp.technologies || [],
      achievements: exp.achievements || [],
    });
  }

  for (const edu of (data.education || [])) {
    const title = [edu.degree, edu.field_of_study].filter(Boolean).join(' - ') || 'Utbildning';
    await upsertExperience({
      title,
      organization: edu.institution || null,
      experience_type: 'education',
      start_date: edu.start_date || null,
      end_date: edu.end_date || null,
      is_current: false,
      description: null,
      related_skills: [],
      achievements: edu.achievements || [],
    });
  }

  for (const cert of (data.certifications || [])) {
    await upsertExperience({
      title: cert.name || 'Certifiering',
      organization: cert.issuing_organization || null,
      experience_type: 'certification',
      start_date: cert.issue_date || null,
      end_date: cert.expiry_date || null,
      is_current: false,
      description: null,
      related_skills: [],
      achievements: [],
    });
  }

  for (const proj of (data.projects || [])) {
    await upsertExperience({
      title: proj.name || 'Projekt',
      organization: proj.role || null,
      experience_type: 'project',
      start_date: proj.start_date || null,
      end_date: proj.end_date || null,
      is_current: false,
      description: proj.description || null,
      related_skills: proj.technologies || [],
      achievements: [],
    });
  }

  const cvName = data.personal_info?.full_name || cv.filename;
  return {
    cv_name: cvName,
    skills_added: skillsAdded,
    experiences_added: expAdded,
    experiences_merged: expMerged,
    duplicates_skipped: duplicates,
  };
}

/**
 * Rensa kompetensbanken och bygg om från alla sparade CV:n.
 */
async function mergeAllCVs() {
  await cvDb.skills.deleteAll();
  await cvDb.experiences.deleteAll();

  const allCVs = await cvDb.cvs.list();
  let totalSkills = 0;
  let totalExp = 0;

  for (const cv of allCVs) {
    const result = await mergeCVIntoBank(cv);
    totalSkills += result.skills_added;
    totalExp    += result.experiences_added;
  }

  return { skills_added: totalSkills, experiences_added: totalExp };
}

// ─── Kand-varianter (skriver till kand_* stores) ──────────────────────────────

async function mergeCVIntoBankForKandid(kandId, cv) {
  const data = cv.structured_data || {};
  let skillsAdded = 0, expAdded = 0, expMerged = 0, duplicates = 0;

  // Skills
  const rawSkills = [
    ...(data.skills || []),
    ...(data.work_experience || []).flatMap(e => e.technologies || []),
    ...(data.projects || []).flatMap(p => p.technologies || []),
  ];
  const seen = new Set();
  const uniqueSkills = [];
  for (const s of rawSkills) {
    const norm = s?.trim();
    if (norm && !seen.has(norm.toLowerCase())) { seen.add(norm.toLowerCase()); uniqueSkills.push(norm); }
  }
  const existingSkills = await cvDb.kandSkills.listFor(kandId);
  const skillsByName = Object.fromEntries(existingSkills.map(s => [s.skill_name.toLowerCase(), s]));
  for (const skillName of uniqueSkills) {
    if (!skillsByName[skillName.toLowerCase()]) {
      const { category, skill_type } = categoriseSkill(skillName);
      const ns = await cvDb.kandSkills.add(kandId, { skill_name: skillName, category, skill_type });
      skillsByName[skillName.toLowerCase()] = ns;
      skillsAdded++;
    } else { duplicates++; }
  }

  // Work + project experiences
  const existingExps = await cvDb.kandExperiences.listFor(kandId);
  const expByKey = Object.fromEntries(existingExps.map(e => [_expKey(e.title, e.organization, e.start_date), e]));

  async function upsertKandExp(rec) {
    const key = _expKey(rec.title, rec.organization, rec.start_date);
    if (expByKey[key]) { expMerged++; return; }
    const ne = await cvDb.kandExperiences.add(kandId, rec);
    expByKey[key] = ne;
    expAdded++;
  }

  for (const e of (data.work_experience || [])) {
    await upsertKandExp({
      title: e.position || 'Okänd position', organization: e.company || null,
      experience_type: 'work', start_date: e.start_date || null, end_date: e.end_date || null,
      is_current: Boolean(e.current), description: e.description || null, achievements: e.achievements || [],
    });
  }
  for (const p of (data.projects || [])) {
    await upsertKandExp({
      title: p.name || 'Projekt', organization: p.role || null,
      experience_type: 'project', start_date: p.start_date || null, end_date: p.end_date || null,
      is_current: false, description: p.description || null, achievements: [],
    });
  }

  // Education
  for (const e of (data.education || [])) {
    await cvDb.kandEducation.add(kandId, {
      degree: e.degree || 'Utbildning', institution: e.institution || null,
      field_of_study: e.field_of_study || null,
      start_date: e.start_date || null, end_date: e.end_date || null, description: null,
    });
  }

  // Certifications
  for (const c of (data.certifications || [])) {
    await cvDb.kandCertifications.add(kandId, {
      name: c.name || 'Certifiering', issuer: c.issuing_organization || null,
      date: c.issue_date || null, description: null,
    });
  }

  return {
    cv_name: data.personal_info?.full_name || cv.filename,
    skills_added: skillsAdded, experiences_added: expAdded,
    experiences_merged: expMerged, duplicates_skipped: duplicates,
  };
}

async function mergeAllCVsForKandid(kandId) {
  await cvDb.kandSkills.deleteAll(kandId);
  await cvDb.kandExperiences.deleteAll(kandId);
  await cvDb.kandEducation.deleteAll(kandId);
  await cvDb.kandCertifications.deleteAll(kandId);

  const allCVs = await cvDb.kandCvs.listFor(kandId);
  let totalSkills = 0, totalExp = 0;
  for (const cv of allCVs) {
    const r = await mergeCVIntoBankForKandid(kandId, cv);
    totalSkills += r.skills_added;
    totalExp    += r.experiences_added;
  }
  return { skills_added: totalSkills, experiences_added: totalExp };
}

window.cvCompSvc = { categoriseSkill, mergeCVIntoBank, mergeAllCVs, mergeCVIntoBankForKandid, mergeAllCVsForKandid };
