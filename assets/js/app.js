/**
 * ParkQR - Application Entry Point
 * Orchestrates event listeners and initial component state
 */

document.addEventListener('DOMContentLoaded', () => {
    // Check if initial screen should be active
    const activeScreen = document.querySelector('.screen-view.active');
    if (!activeScreen) {
        showScreen('screen-role-select');
    }
});
