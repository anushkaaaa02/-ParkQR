/**
 * ParkQR - Admin Portal Module
 * Telemetry counters, Master transaction log, Traffic Staff account creation & deletion
 */

function updateAdminDashboard() {
    renderAdminStaffTable();
    const allSlots = [...carSlots, ...bikeSlots];
    const available = allSlots.filter(s => s.status === 'AVAILABLE').length;
    const occupied = allSlots.filter(s => s.status === 'OCCUPIED').length;

    document.getElementById('adm-avail-count').innerText = available;
    document.getElementById('adm-occup-count').innerText = occupied;

    const tbody = document.getElementById('adm-ledger-rows');
    if (!tbody) return;
    tbody.innerHTML = '';
    bookings.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><code>${b.token}</code></td><td>${b.type || 'CAR'}</td><td>${b.vehicleNumber}</td><td>${b.slotNumber}</td><td>${b.status}</td>`;
        tbody.appendChild(tr);
    });
}

function handleAdminCreateStaff(e) {
    e.preventDefault();
    const name = document.getElementById('new-staff-name').value.trim();
    const username = document.getElementById('new-staff-user').value.trim().toLowerCase();
    const pass = document.getElementById('new-staff-pass').value;

    if (!name || !username || !pass) return notify("All staff fields are required", "fa-circle-exclamation");

    registeredStaff = JSON.parse(localStorage.getItem('parkqr_staff')) || registeredStaff;
    const exists = registeredStaff.some(s => s.username === username);
    if (exists) return notify("Staff username already exists! Choose another.", "fa-circle-exclamation");

    const today = new Date().toISOString().split('T')[0];
    const newStaff = { name: name, username: username, password: pass, createdAt: today };
    registeredStaff.push(newStaff);
    localStorage.setItem('parkqr_staff', JSON.stringify(registeredStaff));

    document.getElementById('admin-create-staff-form').reset();
    renderAdminStaffTable();
    notify(`Traffic Staff @${username} registered successfully!`, "fa-circle-check");
}

function deleteStaff(idx) {
    registeredStaff = JSON.parse(localStorage.getItem('parkqr_staff')) || registeredStaff;
    if (registeredStaff.length <= 1) return notify("At least one staff member must remain registered.", "fa-circle-exclamation");
    const removed = registeredStaff.splice(idx, 1);
    localStorage.setItem('parkqr_staff', JSON.stringify(registeredStaff));
    renderAdminStaffTable();
    notify(`Staff @${removed[0].username} removed.`, "fa-circle-info");
}

function renderAdminStaffTable() {
    registeredStaff = JSON.parse(localStorage.getItem('parkqr_staff')) || registeredStaff;
    const tbody = document.getElementById('adm-staff-rows');
    if (!tbody) return;
    tbody.innerHTML = '';

    registeredStaff.forEach((s, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td><strong>${s.name}</strong></td>
            <td><code style="color: var(--accent-mint); font-weight: 700;">@${s.username}</code></td>
            <td><code style="color: var(--text-muted);">${s.password}</code></td>
            <td>${s.createdAt || '2026-11-15'}</td>
            <td>
                <button type="button" class="btn-smooth btn-outline" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; color: var(--accent-red); border-color: rgba(230,35,40,0.3);" onclick="deleteStaff(${idx})">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
