/**
 * ParkQR - Traffic Staff Portal Module
 * Real backend workflows: Incoming requests queue, Approve with slot allocation,
 * Reject, Entry QR verification, Exit QR verification, Dynamic billing & Live Status sync.
 */

let staffPollTimer = null;
let currentScannedSession = null;

function initStaffScanner() {
    if (staffScannerInstance) return;
    try {
        staffScannerInstance = new Html5QrcodeScanner("staff-scanner-view", {
            fps: 10,
            qrbox: { width: 220, height: 220 }
        });
        staffScannerInstance.render(
            (decoded) => staffVerifyToken(decoded.trim()),
            (err) => {}
        );
    } catch (err) {
        console.warn("Scanner initialization note:", err);
    }
}

function stopStaffScanner() {
    if (staffScannerInstance) {
        staffScannerInstance.clear().catch(e => console.error(e));
        staffScannerInstance = null;
    }
    if (staffPollTimer) {
        clearInterval(staffPollTimer);
        staffPollTimer = null;
    }
}

async function loadStaffPortalData() {
    await fetchStaffRequests();
    await fetchStaffActiveSessions();
    await fetchSlotsForStaff();

    // If an inspector token is currently displayed, refresh its live status
    if (activeStaffToken) {
        staffVerifyToken(activeStaffToken, true);
    }

    if (staffPollTimer) clearInterval(staffPollTimer);
    staffPollTimer = setInterval(() => {
        if (selectedRole === 'staff' && currentAuthUser) {
            fetchStaffRequests(true);
            fetchStaffActiveSessions(true);
            fetchSlotsForStaff(true);
            if (activeStaffToken) {
                staffVerifyToken(activeStaffToken, true);
            }
        }
    }, 2500);
}

async function fetchSlotsForStaff(silent = false) {
    const res = await API.get('/api/slots');
    if (res.success) {
        parkingSlots = res.slots;
    }
}

async function fetchStaffRequests(silent = false) {
    const res = await API.get('/api/sessions?status=PENDING');
    if (res.success) {
        renderStaffIncomingQueue(res.sessions);
    }
}

async function fetchStaffActiveSessions(silent = false) {
    const res = await API.get('/api/sessions');
    if (res.success) {
        const live = res.sessions.filter(s => ['APPROVED', 'PARKED', 'EXIT_PENDING'].includes(s.status));
        renderStaffActiveSessionsTable(live);
    }
}

function renderStaffIncomingQueue(requests) {
    const tbody = document.getElementById('staff-incoming-rows');
    const badge = document.getElementById('staff-incoming-count-badge');
    if (badge) badge.innerText = requests.length;

    if (!tbody) return;
    tbody.innerHTML = '';

    if (requests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No pending parking requests.</td></tr>`;
        return;
    }

    requests.forEach(s => {
        const tr = document.createElement('tr');
        const availableSlots = parkingSlots.filter(sl => sl.status === 'AVAILABLE' && sl.slot_type === s.vehicle_type);

        let selectOptions = availableSlots.length > 0 
            ? availableSlots.map(sl => `<option value="${sl.slot_number}">${sl.slot_number} (${sl.slot_type})</option>`).join('')
            : `<option value="">No ${s.vehicle_type} Slots Available</option>`;

        tr.innerHTML = `
            <td><code>${s.session_id}</code></td>
            <td><strong>@${s.username}</strong></td>
            <td>${s.vehicle_number} (${s.vehicle_type})</td>
            <td>
                <select id="assign-slot-${s.session_id}" class="form-control" style="padding: 0.4rem 0.6rem; font-size: 0.85rem; width: auto;" ${availableSlots.length === 0 ? 'disabled' : ''}>
                    ${selectOptions}
                </select>
            </td>
            <td>${s.request_time.split(' ')[1] || s.request_time}</td>
            <td>
                <div style="display: flex; gap: 0.4rem;">
                    <button class="btn-smooth btn-mint" style="padding: 0.4rem 0.75rem; font-size: 0.8rem;" ${availableSlots.length === 0 ? 'disabled' : ''} onclick="staffApproveRequest('${s.session_id}')">
                        <i class="fa-solid fa-check"></i> Approve
                    </button>
                    <button class="btn-smooth btn-outline" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; color: var(--accent-red); border-color: rgba(230,35,40,0.3);" onclick="staffRejectRequest('${s.session_id}')">
                        <i class="fa-solid fa-xmark"></i> Reject
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderStaffActiveSessionsTable(sessions) {
    const tbody = document.getElementById('staff-active-sessions-rows');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (sessions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No active vehicles currently in the garage.</td></tr>`;
        return;
    }

    sessions.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><code>${s.session_id}</code></td>
            <td><strong>${s.assigned_slot || 'Allotment Pending'}</strong></td>
            <td>${s.vehicle_number} (${s.vehicle_type})</td>
            <td><span class="status-pill ${s.status.toLowerCase()}">${formatStatusLabel(s.status)}</span></td>
            <td>${s.entry_time || 'Awaiting Check-in'}</td>
            <td>${s.exit_time || 'Parked'}</td>
            <td>
                <button class="btn-smooth btn-outline" style="padding: 0.35rem 0.65rem; font-size: 0.75rem;" onclick="staffVerifyToken('${s.session_id}')">
                    <i class="fa-solid fa-magnifying-glass"></i> Inspect Pass
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function staffApproveRequest(sessionId) {
    const select = document.getElementById(`assign-slot-${sessionId}`);
    const slot = select ? select.value : '';
    if (!slot) return notify("Select an available parking slot to allot", "fa-circle-exclamation");

    const res = await API.post('/api/parking/approve', {
        session_id: sessionId,
        slot_number: slot
    });

    if (!res.success) return notify(res.message, "fa-circle-exclamation");
    notify(res.message, "fa-circle-check");
    loadStaffPortalData();
}

async function staffRejectRequest(sessionId) {
    const res = await API.post('/api/parking/reject', {
        session_id: sessionId,
        reason: 'Staff rejected due to lot capacity / maintenance'
    });

    if (!res.success) return notify(res.message, "fa-circle-exclamation");
    notify("Parking request rejected", "fa-circle-info");
    loadStaffPortalData();
}

async function staffVerifyToken(tokenStr, silent = false) {
    if (!tokenStr) {
        if (!silent) notify("Enter or scan a valid token pass", "fa-circle-exclamation");
        return;
    }

    const res = await API.get(`/api/session?session_id=${encodeURIComponent(tokenStr)}`);
    if (!res.success) {
        if (!silent) notify("Invalid or unknown Token Pass!", "fa-circle-xmark");
        return;
    }

    const s = res.session;
    currentScannedSession = s;
    activeStaffToken = s.session_id;

    document.getElementById('staff-empty-msg').style.display = 'none';
    const actionContent = document.getElementById('staff-action-content');
    actionContent.style.display = 'block';

    document.getElementById('stf-res-token').innerText = s.session_id;
    document.getElementById('stf-res-vehicle').innerText = `${s.vehicle_number} (${s.vehicle_type})`;
    document.getElementById('stf-res-slot').innerText = s.assigned_slot || 'Not assigned';
    document.getElementById('stf-res-status').innerText = formatStatusLabel(s.status);

    const btn = document.getElementById('staff-gate-btn');
    const feeRow = document.getElementById('stf-fee-row');

    if (s.status === 'PENDING') {
        feeRow.style.display = 'none';
        btn.className = 'btn-smooth btn-mint';
        btn.innerHTML = `<i class="fa-solid fa-clock"></i> Request Awaiting Approval (See Queue Below)`;
        btn.onclick = () => {
            const el = document.getElementById(`assign-slot-${s.session_id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        };
    } else if (s.status === 'APPROVED') {
        feeRow.style.display = 'none';
        btn.className = 'btn-smooth btn-blue';
        btn.innerHTML = `<i class="fa-solid fa-door-open"></i> Verify Vehicle Entry & Open Gate`;
        btn.onclick = () => executeStaffEntryScan(s.session_id);
    } else if (s.status === 'PARKED') {
        feeRow.style.display = 'none';
        btn.className = 'btn-smooth btn-mint';
        btn.innerHTML = `<i class="fa-solid fa-arrow-right-from-bracket"></i> Verify Exit Scan & Calculate Fare`;
        btn.onclick = () => executeStaffExitScan(s.session_id);
    } else if (s.status === 'EXIT_PENDING') {
        feeRow.style.display = 'flex';
        document.getElementById('stf-res-fee').innerText = `₹${s.final_fare.toFixed(2)} (${s.duration_minutes} mins)`;
        btn.className = 'btn-smooth btn-red';
        btn.innerHTML = `<i class="fa-solid fa-receipt"></i> Exit Scanned: Awaiting Customer Payment`;
        btn.onclick = () => notify(`Total fee ₹${s.final_fare} is pending payment from customer`, "fa-circle-info");
    } else if (s.status === 'COMPLETED' || s.payment_status === 'PAID') {
        feeRow.style.display = 'flex';
        document.getElementById('stf-res-fee').innerText = `₹${s.final_fare.toFixed(2)} (PAID: ${s.payment_reference || 'CONFIRMED'})`;
        btn.className = 'btn-smooth btn-mint';
        btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Payment Received (₹${s.final_fare}) · Gate Cleared!`;
        btn.onclick = () => notify(`Session ${s.session_id} is completed and verified paid (${s.payment_reference || 'PAID'}). Gate barrier is clear.`, "fa-circle-check");
    } else if (s.status === 'REJECTED') {
        feeRow.style.display = 'none';
        btn.className = 'btn-smooth btn-outline';
        btn.innerHTML = `<i class="fa-solid fa-ban"></i> Request Rejected`;
        btn.onclick = () => notify("This request was rejected", "fa-circle-xmark");
    }
}

async function executeStaffEntryScan(sessionId) {
    const res = await API.post('/api/parking/entry', { session_id: sessionId });
    if (!res.success) return notify(res.message, "fa-circle-exclamation");

    notify("Vehicle Entry Confirmed! Gate barrier released.", "fa-circle-check");
    staffVerifyToken(sessionId);
    loadStaffPortalData();
}

async function executeStaffExitScan(sessionId) {
    const res = await API.post('/api/parking/exit', { session_id: sessionId });
    if (!res.success) return notify(res.message, "fa-circle-exclamation");

    notify(`Exit recorded! Duration: ${res.session.duration_minutes} mins. Fare: ₹${res.session.final_fare}`, "fa-circle-check");
    staffVerifyToken(sessionId);
    loadStaffPortalData();
}
