-- ================================================
-- COMPETENCE BANK DATABASE SCHEMA
-- ================================================
-- Purpose: Aggregate skills and experiences from multiple CVs
-- into a unified competence repository

-- Enable pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ================================================
-- SKILLS COLLECTION
-- ================================================
-- Aggregated unique skills from all sources
CREATE TABLE skills_collection (
    id SERIAL PRIMARY KEY,
    skill_name VARCHAR(200) NOT NULL UNIQUE,
    skill_type VARCHAR(50) NOT NULL, -- technical, soft, domain, language, tool
    category VARCHAR(100), -- e.g., "Programming", "Cloud", "Leadership"
    proficiency_level VARCHAR(50), -- beginner, intermediate, advanced, expert
    years_experience DECIMAL(3,1), -- Calculated from experiences
    last_used_date DATE,
    confidence_score DECIMAL(3,2) DEFAULT 1.0, -- How confident are we in this skill?
    embedding vector(1536), -- For semantic search
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast skill lookup
CREATE INDEX idx_skills_name ON skills_collection(skill_name);
CREATE INDEX idx_skills_type ON skills_collection(skill_type);
CREATE INDEX idx_skills_category ON skills_collection(category);
-- Vector similarity search index
CREATE INDEX idx_skills_embedding ON skills_collection USING ivfflat (embedding vector_cosine_ops);

-- ================================================
-- EXPERIENCES POOL
-- ================================================
-- All work experiences, education, projects, certifications
-- aggregated from all CVs
CREATE TABLE experiences_pool (
    id SERIAL PRIMARY KEY,
    experience_type VARCHAR(50) NOT NULL, -- work, education, project, certification
    title VARCHAR(300) NOT NULL, -- Position, Degree, Project name, Cert name
    organization VARCHAR(300), -- Company, University, Organization
    location VARCHAR(200),
    start_date VARCHAR(50),
    end_date VARCHAR(50),
    is_current BOOLEAN DEFAULT FALSE,
    description TEXT,
    achievements TEXT[], -- Array of achievement strings
    technologies TEXT[], -- Technologies used
    source_cv_id INTEGER REFERENCES cv(id) ON DELETE SET NULL,
    source_document_name VARCHAR(500), -- Original filename
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    embedding vector(1536), -- For semantic search
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for experiences
CREATE INDEX idx_exp_type ON experiences_pool(experience_type);
CREATE INDEX idx_exp_organization ON experiences_pool(organization);
CREATE INDEX idx_exp_current ON experiences_pool(is_current);
CREATE INDEX idx_exp_source_cv ON experiences_pool(source_cv_id);
CREATE INDEX idx_exp_embedding ON experiences_pool USING ivfflat (embedding vector_cosine_ops);

-- ================================================
-- SKILL-EXPERIENCE MAPPING
-- ================================================
-- Links skills to the experiences that demonstrate them
CREATE TABLE skill_experience_evidence (
    id SERIAL PRIMARY KEY,
    skill_id INTEGER NOT NULL REFERENCES skills_collection(id) ON DELETE CASCADE,
    experience_id INTEGER NOT NULL REFERENCES experiences_pool(id) ON DELETE CASCADE,
    evidence_strength DECIMAL(3,2) DEFAULT 1.0, -- How strongly does this experience prove the skill?
    context TEXT, -- How the skill was used in this experience
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(skill_id, experience_id)
);

CREATE INDEX idx_skill_evidence_skill ON skill_experience_evidence(skill_id);
CREATE INDEX idx_skill_evidence_exp ON skill_experience_evidence(experience_id);

-- ================================================
-- COMPETENCE METADATA
-- ================================================
-- Track overall competence bank statistics
CREATE TABLE competence_metadata (
    id SERIAL PRIMARY KEY,
    total_skills INTEGER DEFAULT 0,
    total_experiences INTEGER DEFAULT 0,
    total_source_documents INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    embeddings_version VARCHAR(50) DEFAULT 'text-embedding-3-small'
);

-- Initialize with one row
INSERT INTO competence_metadata (total_skills, total_experiences, total_source_documents) 
VALUES (0, 0, 0);

-- ================================================
-- SOFT SKILLS COLLECTION
-- ================================================
-- Separate table for soft skills (extracted from cover letters, etc.)
CREATE TABLE soft_skills (
    id SERIAL PRIMARY KEY,
    skill_name VARCHAR(200) NOT NULL UNIQUE,
    category VARCHAR(100), -- Communication, Leadership, Problem-solving, etc.
    proficiency_level VARCHAR(50),
    evidence_examples TEXT[], -- Examples where this was demonstrated
    source_documents TEXT[], -- Which documents mentioned this
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_soft_skills_name ON soft_skills(skill_name);
CREATE INDEX idx_soft_skills_category ON soft_skills(category);
CREATE INDEX idx_soft_skills_embedding ON soft_skills USING ivfflat (embedding vector_cosine_ops);

-- ================================================
-- SOURCE DOCUMENTS TRACKING
-- ================================================
-- Track which documents have been processed into the competence bank
CREATE TABLE source_documents (
    id SERIAL PRIMARY KEY,
    document_type VARCHAR(50) NOT NULL, -- cv, cover_letter, linkedin, portfolio
    original_filename VARCHAR(500),
    cv_id INTEGER REFERENCES cv(id) ON DELETE SET NULL, -- If it's a CV
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    skills_extracted INTEGER DEFAULT 0,
    experiences_extracted INTEGER DEFAULT 0,
    processing_status VARCHAR(50) DEFAULT 'completed' -- pending, completed, failed
);

CREATE INDEX idx_source_doc_type ON source_documents(document_type);
CREATE INDEX idx_source_cv_id ON source_documents(cv_id);

-- ================================================
-- FUNCTIONS FOR AUTO-UPDATE
-- ================================================

-- Update competence metadata when skills are added/removed
CREATE OR REPLACE FUNCTION update_competence_metadata()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE competence_metadata 
    SET 
        total_skills = (SELECT COUNT(*) FROM skills_collection),
        total_experiences = (SELECT COUNT(*) FROM experiences_pool),
        total_source_documents = (SELECT COUNT(*) FROM source_documents),
        last_updated = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER trigger_update_metadata_skills
AFTER INSERT OR DELETE ON skills_collection
FOR EACH STATEMENT EXECUTE FUNCTION update_competence_metadata();

CREATE TRIGGER trigger_update_metadata_experiences
AFTER INSERT OR DELETE ON experiences_pool
FOR EACH STATEMENT EXECUTE FUNCTION update_competence_metadata();

CREATE TRIGGER trigger_update_metadata_sources
AFTER INSERT OR DELETE ON source_documents
FOR EACH STATEMENT EXECUTE FUNCTION update_competence_metadata();

-- ================================================
-- HELPER VIEWS
-- ================================================

-- View: Skills with experience count
CREATE VIEW skills_with_evidence AS
SELECT 
    s.id,
    s.skill_name,
    s.skill_type,
    s.category,
    s.proficiency_level,
    s.years_experience,
    COUNT(DISTINCT see.experience_id) as experience_count,
    ARRAY_AGG(DISTINCT e.organization) FILTER (WHERE e.organization IS NOT NULL) as organizations_used
FROM skills_collection s
LEFT JOIN skill_experience_evidence see ON s.id = see.skill_id
LEFT JOIN experiences_pool e ON see.experience_id = e.id
GROUP BY s.id, s.skill_name, s.skill_type, s.category, s.proficiency_level, s.years_experience;

-- View: Experience timeline
CREATE VIEW experience_timeline AS
SELECT 
    id,
    experience_type,
    title,
    organization,
    start_date,
    end_date,
    is_current,
    ARRAY_LENGTH(achievements, 1) as achievement_count,
    ARRAY_LENGTH(technologies, 1) as technology_count
FROM experiences_pool
ORDER BY 
    CASE WHEN is_current THEN 1 ELSE 0 END DESC,
    start_date DESC NULLS LAST;

-- ================================================
-- EXAMPLE QUERIES
-- ================================================

-- Get all technical skills with proficiency
-- SELECT skill_name, proficiency_level, years_experience 
-- FROM skills_collection 
-- WHERE skill_type = 'technical' 
-- ORDER BY proficiency_level DESC, years_experience DESC;

-- Find experiences that demonstrate a specific skill
-- SELECT e.title, e.organization, e.start_date, see.context
-- FROM experiences_pool e
-- JOIN skill_experience_evidence see ON e.id = see.experience_id
-- JOIN skills_collection s ON see.skill_id = s.id
-- WHERE s.skill_name = 'Python'
-- ORDER BY see.evidence_strength DESC;

-- Get competence bank statistics
-- SELECT * FROM competence_metadata;

-- Search skills semantically (example - requires embedding)
-- SELECT skill_name, 1 - (embedding <=> '[query_embedding]'::vector) as similarity
-- FROM skills_collection
-- ORDER BY embedding <=> '[query_embedding]'::vector
-- LIMIT 10;
