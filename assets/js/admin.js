/**
 * ParkQR - Admin Portal Module
 * Real backend synchronization for telemetry, master parking logs,
 * dynamic staff account creation & deletion.
 */

async function loadAdminPortalData() {
    await updateAdminTelemetry();
    await renderAdminMasterLog();
    await renderAdminStaffTable();
}

async function updateAdminTelemetry() {
    const res = await API.get('/api/stats');
    if (res.success) {
        document.getElementById('adm-avail-count').innerText = res.stats.available_slots;
        document.getElementById('adm-occup-count').innerText = res.stats.occupied_slots;
        const revEl = document.getElementById('adm-rev-count');
        if (revEl) revEl.innerText = `₹${res.stats.total_revenue.toFixed(2)}`;
    }
}

async function renderAdminMasterLog() {
    const res = await API.get('/api/sessions');
    if (!res.success) return;

    allAdminSessions = res.sessions;
    const tbody = document.getElementById('adm-ledger-rows');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (allAdminSessions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding: 1.5rem;">No parking transactions recorded yet.</td></tr>`;
        return;
    }

    allAdminSessions.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><code>${b.session_id}</code></td>
            <td><strong>@${b.username}</strong></td>
            <td>${b.vehicle_number} (${b.vehicle_type})</td>
            <td>${b.assigned_slot || 'N/A'}</td>
            <td><span class="status-pill ${b.status.toLowerCase()}">${formatStatusLabel(b.status)}</span></td>
            <td>${b.duration_minutes ? b.duration_minutes + 'm' : '---'}</td>
            <td><strong style="color: var(--accent-mint);">₹${b.final_fare.toFixed(2)}</strong></td>
        `;
        tbody.appendChild(tr);
    });
}

async function handleAdminCreateStaff(e) {
    e.preventDefault();
    const name = document.getElementById('new-staff-name').value.trim();
    const username = document.getElementById('new-staff-user').value.trim().toLowerCase();
    const pass = document.getElementById('new-staff-pass').value;

    if (!name || !username || !pass) return notify("All staff fields are required", "fa-circle-exclamation");

    const res = await API.post('/api/staff/register', {
        name: name,
        username: username,
        password: pass
    });

    if (!res.success) return notify(res.message, "fa-circle-exclamation");

    document.getElementById('admin-create-staff-form').reset();
    renderAdminStaffTable();
    notify(res.message, "fa-circle-check");
}

async function deleteStaff(id) {
    const res = await API.post('/api/staff/delete', { id: id });
    if (!res.success) return notify(res.message, "fa-circle-exclamation");

    renderAdminStaffTable();
    notify(res.message, "fa-circle-info");
}

async function renderAdminStaffTable() {
    const res = await API.get('/api/staff');
    if (!res.success) return;

    const staffList = res.staff;
    const tbody = document.getElementById('adm-staff-rows');
    if (!tbody) return;
    tbody.innerHTML = '';

    staffList.forEach((s, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td><strong>${s.full_name}</strong></td>
            <td><code style="color: var(--accent-mint); font-weight: 700;">@${s.username}</code></td>
            <td><code style="color: var(--text-muted);">${s.password}</code></td>
            <td>${s.created_at || 'Recorded'}</td>
            <td>
                <button type="button" class="btn-smooth btn-outline" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; color: var(--accent-red); border-color: rgba(230,35,40,0.3);" onclick="deleteStaff(${s.id})">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
