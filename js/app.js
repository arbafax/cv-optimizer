// API Base URL
const API_BASE_URL = 'http://localhost:8000/api/v1';

// DOM Elements
const uploadArea = document.getElementById('upload-area');
const uploadLabel = document.getElementById('upload-label');
const cvUpload = document.getElementById('cv-upload');
const uploadStatus = document.getElementById('upload-status');
const cvPreview = document.getElementById('cv-preview');
const cvList = document.getElementById('cv-list');
const optimizeBtn = document.getElementById('optimize-btn');
const jobTitle = document.getElementById('job-title');
const jobDescription = document.getElementById('job-description');
const charCount = document.getElementById('char-count');
const optimizeResult = document.getElementById('optimize-result');

// State
let selectedCV = null;
let allCVs = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadCVs();
});

// Event Listeners
function setupEventListeners() {
    // File upload
    cvUpload.addEventListener('change', handleFileSelect);
    
    // Drag and drop
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    
    // Optimize button
    optimizeBtn.addEventListener('click', handleOptimize);
    
    // Character count for job description
    jobDescription.addEventListener('input', updateCharCount);
    
    // Enable optimize button when CV is selected and form is filled
    jobTitle.addEventListener('input', updateOptimizeButton);
    jobDescription.addEventListener('input', updateOptimizeButton);
}

// Drag and Drop Handlers
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileUpload(files[0]);
    }
}

// Handle file selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFileUpload(file);
    }
}

// Upload CV
async function handleFileUpload(file) {
    if (!file.type.includes('pdf')) {
        showStatus('❌ Endast PDF-filer är tillåtna', 'error');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showStatus('❌ Filen är för stor. Max 10 MB tillåtet', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    uploadArea.classList.add('uploading');
    showStatus('⏳ Laddar upp och analyserar CV...', 'loading');
    
    try {
        const response = await fetch(`${API_BASE_URL}/cv/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Uppladdning misslyckades');
        }
        
        const data = await response.json();
        uploadArea.classList.remove('uploading');
        showStatus('✅ CV uppladdat och strukturerat!', 'success');
        displayCVPreview(data.structured_data);
        loadCVs(); // Refresh list
        
        // Auto-scroll to CV list
        setTimeout(() => {
            document.getElementById('cv-list-section').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        }, 500);
        
    } catch (error) {
        uploadArea.classList.remove('uploading');
        showStatus(`❌ Fel: ${error.message}`, 'error');
    }
}

// Display CV preview after upload
function displayCVPreview(cvData) {
    cvPreview.classList.remove('hidden');
    
    const name = cvData.personal_info.full_name;
    const email = cvData.personal_info.email || 'Ingen email';
    const summary = cvData.summary || 'Ingen sammanfattning';
    const skills = cvData.skills.slice(0, 10).join(', ') || 'Inga skills listade';
    const workExp = cvData.work_experience.length;
    const education = cvData.education.length;
    
    cvPreview.innerHTML = `
        <h3>✅ CV strukturerat framgångsrikt!</h3>
        <div class="cv-preview-section">
            <h4>Personlig information</h4>
            <p><strong>${name}</strong> • ${email}</p>
        </div>
        <div class="cv-preview-section">
            <h4>Sammanfattning</h4>
            <p>${summary}</p>
        </div>
        <div class="cv-preview-section">
            <h4>Erfarenhet</h4>
            <p>${workExp} arbetslivserfarenheter • ${education} utbildningar</p>
        </div>
        <div class="cv-preview-section">
            <h4>Kompetenser</h4>
            <p>${skills}</p>
        </div>
    `;
}

// Load all CVs
async function loadCVs() {
    try {
        const response = await fetch(`${API_BASE_URL}/cv/`);
        
        if (!response.ok) {
            throw new Error('Kunde inte ladda CV:n');
        }
        
        allCVs = await response.json();
        displayCVs(allCVs);
        
    } catch (error) {
        console.error('Error loading CVs:', error);
        cvList.innerHTML = `
            <div class="empty-state">
                <p>❌ Kunde inte ladda CV:n</p>
                <p class="empty-state-hint">Kontrollera att backend körs på http://localhost:8000</p>
            </div>
        `;
    }
}

// Display CVs
function displayCVs(cvs) {
    if (cvs.length === 0) {
        cvList.innerHTML = `
            <div class="empty-state">
                <p>Inga CV:n uppladdade ännu</p>
                <p class="empty-state-hint">Ladda upp ditt första CV för att komma igång!</p>
            </div>
        `;
        return;
    }
    
    cvList.innerHTML = cvs.map(cv => {
        const name = cv.structured_data.personal_info.full_name;
        const uploadDate = new Date(cv.upload_date).toLocaleDateString('sv-SE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const skills = cv.structured_data.skills.length;
        const experiences = cv.structured_data.work_experience.length;
        
        return `
            <div class="cv-item ${selectedCV?.id === cv.id ? 'selected' : ''}" 
                 onclick="selectCV(${cv.id})">
                <div class="cv-item-header">
                    <div class="cv-item-info">
                        <h3>${name}</h3>
                        <p>${cv.filename}</p>
                    </div>
                    ${selectedCV?.id === cv.id ? '<span class="cv-item-badge">Vald</span>' : ''}
                </div>
                <div class="cv-item-details">
                    <div class="cv-item-detail">
                        📅 Uppladdat: ${uploadDate}
                    </div>
                    <div class="cv-item-detail">
                        💼 ${experiences} arbetslivserfarenheter
                    </div>
                    <div class="cv-item-detail">
                        🎯 ${skills} kompetenser
                    </div>
                </div>
                <div class="cv-item-actions">
                    <button class="btn btn-small btn-secondary" onclick="viewCV(${cv.id}, event)">
                        👁️ Visa detaljer
                    </button>
                    <button class="btn btn-small btn-secondary" onclick="deleteCV(${cv.id}, event)">
                        🗑️ Ta bort
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Select CV
function selectCV(id) {
    selectedCV = allCVs.find(cv => cv.id === id);
    displayCVs(allCVs);
    updateOptimizeButton();
    
    // Scroll to optimize section
    setTimeout(() => {
        document.getElementById('optimize-section').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }, 100);
}

// View CV details
function viewCV(id, event) {
    event.stopPropagation();
    const cv = allCVs.find(cv => cv.id === id);
    
    // Create a nice modal or detailed view
    alert(`CV Detaljer: ${cv.structured_data.personal_info.full_name}\n\nFler detaljer kan visas i en modal här. För nu, öppna konsolen (F12) för full data.`);
    console.log('Full CV Data:', cv);
}

// Delete CV
async function deleteCV(id, event) {
    event.stopPropagation();
    
    if (!confirm('Är du säker på att du vill ta bort detta CV?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/cv/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Kunde inte ta bort CV');
        }
        
        // If this was the selected CV, deselect it
        if (selectedCV?.id === id) {
            selectedCV = null;
            updateOptimizeButton();
        }
        
        loadCVs(); // Refresh list
        
    } catch (error) {
        alert(`Fel: ${error.message}`);
    }
}

// Update character count
function updateCharCount() {
    const count = jobDescription.value.length;
    charCount.textContent = `${count} tecken`;
}

// Update optimize button state
function updateOptimizeButton() {
    const hasCV = selectedCV !== null;
    const hasTitle = jobTitle.value.trim().length > 0;
    const hasDescription = jobDescription.value.trim().length > 0;
    
    optimizeBtn.disabled = !(hasCV && hasTitle && hasDescription);
}

// Optimize CV
async function handleOptimize() {
    if (!selectedCV) {
        alert('Välj ett CV först');
        return;
    }
    
    if (!jobTitle.value || !jobDescription.value) {
        alert('Fyll i jobbtitel och beskrivning');
        return;
    }
    
    // Show loading state
    optimizeBtn.disabled = true;
    optimizeBtn.querySelector('.btn-text').style.display = 'none';
    optimizeBtn.querySelector('.btn-loading').classList.remove('hidden');
    optimizeResult.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_BASE_URL}/optimize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                cv_id: selectedCV.id,
                job_posting: {
                    title: jobTitle.value,
                    description: jobDescription.value
                }
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Optimering misslyckades');
        }
        
        const result = await response.json();
        displayOptimizedCV(result);
        
        // Scroll to result
        setTimeout(() => {
            optimizeResult.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        }, 100);
        
    } catch (error) {
        optimizeResult.innerHTML = `
            <div class="status-message status-error">
                ❌ Fel: ${error.message}
            </div>
        `;
        optimizeResult.classList.remove('hidden');
    } finally {
        optimizeBtn.disabled = false;
        optimizeBtn.querySelector('.btn-text').style.display = 'inline';
        optimizeBtn.querySelector('.btn-loading').classList.add('hidden');
        updateOptimizeButton();
    }
}

// Display optimized CV
function displayOptimizedCV(result) {
    const originalSummary = selectedCV.structured_data.summary || 'Ingen sammanfattning';
    const optimizedSummary = result.optimized_data.summary || 'Ingen sammanfattning';
    
    const originalSkills = selectedCV.structured_data.skills.slice(0, 8).join(', ');
    const optimizedSkills = result.optimized_data.skills.slice(0, 8).join(', ');
    
    optimizeResult.innerHTML = `
        <h3>✨ CV optimerat för: ${result.job_title}</h3>
        
        <div class="match-score">
            <div class="score-circle">${result.match_score || 85}%</div>
            <div>
                <strong>Matchningsgrad</strong>
                <p style="color: var(--text-secondary); margin-top: 5px;">
                    Ditt CV matchar väl med denna jobbannons!
                </p>
            </div>
        </div>
        
        <div class="result-comparison">
            <div class="result-column">
                <h4>📄 Original</h4>
                <div style="margin-bottom: 15px;">
                    <strong>Sammanfattning:</strong>
                    <p style="color: var(--text-secondary); margin-top: 5px; font-size: 0.9rem;">
                        ${originalSummary}
                    </p>
                </div>
                <div>
                    <strong>Kompetenser:</strong>
                    <p style="color: var(--text-secondary); margin-top: 5px; font-size: 0.9rem;">
                        ${originalSkills}
                    </p>
                </div>
            </div>
            
            <div class="result-column" style="background: #ecfdf5;">
                <h4>✨ Optimerad</h4>
                <div style="margin-bottom: 15px;">
                    <strong>Sammanfattning:</strong>
                    <p style="color: var(--text-secondary); margin-top: 5px; font-size: 0.9rem;">
                        ${optimizedSummary}
                    </p>
                </div>
                <div>
                    <strong>Kompetenser:</strong>
                    <p style="color: var(--text-secondary); margin-top: 5px; font-size: 0.9rem;">
                        ${optimizedSkills}
                    </p>
                </div>
            </div>
        </div>
        
        <div style="margin-top: 30px; text-align: center;">
            <button class="btn btn-primary" onclick="viewFullOptimizedCV(${result.id})">
                👁️ Visa komplett optimerat CV
            </button>
            <button class="btn btn-secondary" style="margin-left: 10px;" onclick="downloadOptimizedCV(${result.id})">
                📥 Ladda ner PDF (kommer snart)
            </button>
        </div>
    `;
    
    optimizeResult.classList.remove('hidden');
}

// View full optimized CV
async function viewFullOptimizedCV(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/optimize/${id}`);
        const data = await response.json();
        
        console.log('Optimerat CV:', data);
        alert('Komplett CV-data finns i konsolen (F12). En dedikerad vy kommer snart!');
        
    } catch (error) {
        alert(`Fel: ${error.message}`);
    }
}

// Download optimized CV (placeholder)
function downloadOptimizedCV(id) {
    alert('PDF-export kommer i nästa version! För tillfället kan du kopiera data från "Visa komplett optimerat CV".');
}

// Show status message
function showStatus(message, type) {
    const icon = type === 'loading' ? '<div class="spinner"></div>' : '';
    uploadStatus.innerHTML = `
        <div class="status-message status-${type}">
            ${icon}
            <span>${message}</span>
        </div>
    `;
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            uploadStatus.innerHTML = '';
        }, 5000);
    }
}
