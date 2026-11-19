/**
 * ParkQR - UI Helper Utilities
 * Screen transitions, toast notifications, logout
 */

function showScreen(screenId) {
    document.querySelectorAll('.screen-view').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');

    const header = document.getElementById('main-header');
    if (header) header.style.display = screenId.startsWith('portal-') ? 'block' : 'none';
}

function notify(msg, icon = "fa-circle-info") {
    const container = document.getElementById('toast-wrapper');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
}

function performLogout() {
    stopStaffScanner();
    currentAuthUser = null;
    selectedRole = null;
    showScreen('screen-role-select');
}
