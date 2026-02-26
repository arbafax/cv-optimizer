// ── Init ──────────────────────────────────────────────────────────────────────
// All functions live in the module files loaded before this one.
// This file only wires up event listeners and triggers the initial auth check.

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadCurrentUser();

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCVModal();
    });
});

function setupEventListeners() {
    optimizeBtn.addEventListener('click', handleOptimize);
    jobDescription.addEventListener('input', updateCharCount);
    jobDescription.addEventListener('input', updateOptimizeButton);
}
