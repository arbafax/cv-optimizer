// API Base URL
const API_BASE_URL = 'http://localhost:8000/api/v1';

// DOM Elements
const uploadArea = document.getElementById('upload-area');
const cvUpload = document.getElementById('cv-upload');
const uploadStatus = document.getElementById('upload-status');
const cvList = document.getElementById('cv-list');
const optimizeBtn = document.getElementById('optimize-btn');
const jobTitle = document.getElementById('job-title');
const jobDescription = document.getElementById('job-description');
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
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#764ba2';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#667eea';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#667eea';
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });
    
    // Optimize button
    optimizeBtn.addEventListener('click', handleOptimize);
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
        showStatus('Endast PDF-filer är tillåtna', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    showStatus('Laddar upp och analyserar CV...', 'loading');
    
    try {
        const response = await fetch(`${API_BASE_URL}/cv/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Uppladdning misslyckades');
        }
        
        const data = await response.json();
        showStatus('CV uppladdat och strukturerat!', 'success');
        loadCVs(); // Refresh list
        
    } catch (error) {
        showStatus(`Fel: ${error.message}`, 'error');
    }
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
        cvList.innerHTML = '<p>Kunde inte ladda CV:n. Kontrollera att backend körs.</p>';
    }
}

// Display CVs
function displayCVs(cvs) {
    if (cvs.length === 0) {
        cvList.innerHTML = '<p>Inga CV:n uppladdade ännu.</p>';
        return;
    }
    
    cvList.innerHTML = cvs.map(cv => `
        <div class="cv-item ${selectedCV?.id === cv.id ? 'selected' : ''}" 
             onclick="selectCV(${cv.id})">
            <div class="cv-item-info">
                <h3>${cv.structured_data.personal_info.full_name || cv.filename}</h3>
                <p>Uppladdat: ${new Date(cv.upload_date).toLocaleDateString('sv-SE')}</p>
            </div>
            <button class="btn" onclick="viewCV(${cv.id}, event)">Visa</button>
        </div>
    `).join('');
}

// Select CV
function selectCV(id) {
    selectedCV = allCVs.find(cv => cv.id === id);
    displayCVs(allCVs);
}

// View CV details
function viewCV(id, event) {
    event.stopPropagation();
    const cv = allCVs.find(cv => cv.id === id);
    console.log('CV Details:', cv);
    alert(`CV: ${cv.structured_data.personal_info.full_name}\n\nFler detaljer i konsolen (F12)`);
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
    
    optimizeBtn.disabled = true;
    optimizeResult.innerHTML = '<div class="spinner"></div>';
    
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
            throw new Error('Optimering misslyckades');
        }
        
        const result = await response.json();
        displayOptimizedCV(result);
        
    } catch (error) {
        optimizeResult.innerHTML = `
            <div class="status-message status-error">
                Fel: ${error.message}
            </div>
        `;
    } finally {
        optimizeBtn.disabled = false;
    }
}

// Display optimized CV
function displayOptimizedCV(result) {
    optimizeResult.innerHTML = `
        <div class="status-message status-success">
            <h3>✅ CV optimerat!</h3>
            <p>Matchning: ${result.match_score}%</p>
            <button class="btn btn-primary" onclick="downloadOptimizedCV(${result.id})">
                Ladda ner PDF
            </button>
        </div>
    `;
}

// Download optimized CV
async function downloadOptimizedCV(id) {
    window.location.href = `${API_BASE_URL}/optimize/${id}/download`;
}

// Show status message
function showStatus(message, type) {
    uploadStatus.innerHTML = `
        <div class="status-message status-${type}">
            ${type === 'loading' ? '<div class="spinner"></div>' : ''}
            <p>${message}</p>
        </div>
    `;
}
