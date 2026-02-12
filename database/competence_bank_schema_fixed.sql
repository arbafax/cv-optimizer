-- ================================================
-- COMPETENCE BANK SCHEMA - FIXED VERSION
-- ================================================
-- Fixes:
-- 1. Correct table creation order
-- 2. Drop existing partial tables first
-- 3. CV table name handled correctly
-- ================================================

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ================================================
-- CLEANUP: Drop partial tables if they exist
-- (Safe to run multiple times)
-- ================================================
DROP TABLE IF EXISTS skill_experience_evidence CASCADE;
DROP TABLE IF EXISTS experiences_pool CASCADE;
DROP TABLE IF EXISTS skills_collection CASCADE;
DROP TABLE IF EXISTS soft_skills CASCADE;
DROP TABLE IF EXISTS source_documents CASCADE;
DROP TABLE IF EXISTS competence_metadata CASCADE;
DROP VIEW IF EXISTS skills_with_evidence CASCADE;
DROP VIEW IF EXISTS experience_timeline CASCADE;
DROP FUNCTION IF EXISTS update_competence_metadata CASCADE;

-- ================================================
-- STEP 1: SKILLS COLLECTION (no dependencies)
-- ================================================
CREATE TABLE skills_collection (
    id SERIAL PRIMARY KEY,
    skill_name VARCHAR(200) NOT NULL UNIQUE,
    skill_type VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    proficiency_level VARCHAR(50),
    years_experience DECIMAL(3,1),
    last_used_date DATE,
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_skills_name ON skills_collection(skill_name);
CREATE INDEX idx_skills_type ON skills_collection(skill_type);
CREATE INDEX idx_skills_category ON skills_collection(category);

-- ================================================
-- STEP 2: EXPERIENCES POOL
-- References cv table - using INTEGER without FK constraint
-- (FK added later via ALTER TABLE if cv table exists)
-- ================================================
CREATE TABLE experiences_pool (
    id SERIAL PRIMARY KEY,
    experience_type VARCHAR(50) NOT NULL,
    title VARCHAR(300) NOT NULL,
    organization VARCHAR(300),
    location VARCHAR(200),
    start_date VARCHAR(50),
    end_date VARCHAR(50),
    is_current BOOLEAN DEFAULT FALSE,
    description TEXT,
    achievements TEXT[],
    technologies TEXT[],
    source_cv_id INTEGER,                    -- FK added below if cv table exists
    source_document_name VARCHAR(500),
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_exp_type ON experiences_pool(experience_type);
CREATE INDEX idx_exp_organization ON experiences_pool(organization);
CREATE INDEX idx_exp_current ON experiences_pool(is_current);
CREATE INDEX idx_exp_source_cv ON experiences_pool(source_cv_id);

-- ================================================
-- STEP 3: SKILL-EXPERIENCE MAPPING
-- (depends on skills_collection and experiences_pool)
-- ================================================
CREATE TABLE skill_experience_evidence (
    id SERIAL PRIMARY KEY,
    skill_id INTEGER NOT NULL REFERENCES skills_collection(id) ON DELETE CASCADE,
    experience_id INTEGER NOT NULL REFERENCES experiences_pool(id) ON DELETE CASCADE,
    evidence_strength DECIMAL(3,2) DEFAULT 1.0,
    context TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(skill_id, experience_id)
);

CREATE INDEX idx_skill_evidence_skill ON skill_experience_evidence(skill_id);
CREATE INDEX idx_skill_evidence_exp ON skill_experience_evidence(experience_id);

-- ================================================
-- STEP 4: COMPETENCE METADATA (no dependencies)
-- ================================================
CREATE TABLE competence_metadata (
    id SERIAL PRIMARY KEY,
    total_skills INTEGER DEFAULT 0,
    total_experiences INTEGER DEFAULT 0,
    total_source_documents INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    embeddings_version VARCHAR(50) DEFAULT 'text-embedding-3-small'
);

INSERT INTO competence_metadata 
    (total_skills, total_experiences, total_source_documents)
VALUES 
    (0, 0, 0);

-- ================================================
-- STEP 5: SOFT SKILLS (no dependencies)
-- ================================================
CREATE TABLE soft_skills (
    id SERIAL PRIMARY KEY,
    skill_name VARCHAR(200) NOT NULL UNIQUE,
    category VARCHAR(100),
    proficiency_level VARCHAR(50),
    evidence_examples TEXT[],
    source_documents TEXT[],
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_soft_skills_name ON soft_skills(skill_name);
CREATE INDEX idx_soft_skills_category ON soft_skills(category);

-- ================================================
-- STEP 6: SOURCE DOCUMENTS
-- References cv table - using INTEGER without FK constraint
-- ================================================
CREATE TABLE source_documents (
    id SERIAL PRIMARY KEY,
    document_type VARCHAR(50) NOT NULL,
    original_filename VARCHAR(500),
    cv_id INTEGER,                           -- FK added below if cv table exists
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    skills_extracted INTEGER DEFAULT 0,
    experiences_extracted INTEGER DEFAULT 0,
    processing_status VARCHAR(50) DEFAULT 'completed'
);

CREATE INDEX idx_source_doc_type ON source_documents(document_type);
CREATE INDEX idx_source_cv_id ON source_documents(cv_id);

-- ================================================
-- STEP 7: ADD FOREIGN KEYS TO CV TABLE
-- Run the block matching your cv table name!
-- ================================================

-- CHECK: Run this to find your cv table name:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_name LIKE '%cv%';

-- OPTION A: If your table is named "cv"
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'cv'
    ) THEN
        ALTER TABLE experiences_pool 
            ADD CONSTRAINT fk_exp_cv 
            FOREIGN KEY (source_cv_id) REFERENCES cv(id) ON DELETE SET NULL;
        
        ALTER TABLE source_documents 
            ADD CONSTRAINT fk_src_doc_cv 
            FOREIGN KEY (cv_id) REFERENCES cv(id) ON DELETE SET NULL;
        
        RAISE NOTICE 'Foreign keys added: cv table found';
    -- OPTION B: If your table is named "cvs"
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'cvs'
    ) THEN
        ALTER TABLE experiences_pool 
            ADD CONSTRAINT fk_exp_cv 
            FOREIGN KEY (source_cv_id) REFERENCES cvs(id) ON DELETE SET NULL;
        
        ALTER TABLE source_documents 
            ADD CONSTRAINT fk_src_doc_cv 
            FOREIGN KEY (cv_id) REFERENCES cvs(id) ON DELETE SET NULL;
        
        RAISE NOTICE 'Foreign keys added: cvs table found';
    ELSE
        RAISE NOTICE 'WARNING: No cv/cvs table found. Foreign keys not added. Run without FK constraints for now.';
    END IF;
END $$;

-- ================================================
-- STEP 8: AUTO-UPDATE FUNCTION & TRIGGERS
-- ================================================
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
-- STEP 9: VIEWS
-- ================================================
CREATE VIEW skills_with_evidence AS
SELECT 
    s.id,
    s.skill_name,
    s.skill_type,
    s.category,
    s.proficiency_level,
    s.years_experience,
    s.confidence_score,
    COUNT(DISTINCT see.experience_id) as experience_count,
    COALESCE(
        ARRAY_AGG(DISTINCT e.organization) 
        FILTER (WHERE e.organization IS NOT NULL), 
        '{}'::text[]
    ) as organizations_used
FROM skills_collection s
LEFT JOIN skill_experience_evidence see ON s.id = see.skill_id
LEFT JOIN experiences_pool e ON see.experience_id = e.id
GROUP BY 
    s.id, s.skill_name, s.skill_type, s.category, 
    s.proficiency_level, s.years_experience, s.confidence_score;

CREATE VIEW experience_timeline AS
SELECT 
    id,
    experience_type,
    title,
    organization,
    start_date,
    end_date,
    is_current,
    COALESCE(ARRAY_LENGTH(achievements, 1), 0) as achievement_count,
    COALESCE(ARRAY_LENGTH(technologies, 1), 0) as technology_count,
    source_document_name
FROM experiences_pool
ORDER BY 
    CASE WHEN is_current THEN 0 ELSE 1 END,
    start_date DESC NULLS LAST;

-- ================================================
-- VERIFICATION
-- ================================================
DO $$
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Competence Bank Schema Created Successfully!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Tables: skills_collection, experiences_pool,';
    RAISE NOTICE '        skill_experience_evidence, competence_metadata,';
    RAISE NOTICE '        soft_skills, source_documents';
    RAISE NOTICE 'Views:  skills_with_evidence, experience_timeline';
    RAISE NOTICE '===========================================';
END $$;

-- Final check - show all new tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
