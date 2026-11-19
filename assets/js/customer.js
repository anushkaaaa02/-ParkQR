/**
 * ParkQR - Customer Portal Module
 * Strict 'One QR = One Parking Session' client implementation:
 * PENDING_APPROVAL -> APPROVED -> PARKED -> AWAITING_PAYMENT -> COMPLETED
 */

let customerPollTimer = null;

function setInnerVehicleType(type) {
    currentVehicleType = type;
    document.getElementById('btn-type-car').classList.toggle('active', type === 'car');
    document.getElementById('btn-type-bike').classList.toggle('active', type === 'bike');

    const icon = document.getElementById('portal-vehicle-icon');
    if (icon) icon.className = type === 'car' ? 'fa-solid fa-car-side' : 'fa-solid fa-motorcycle';

    renderCustomerSlots();
}

async function loadCustomerPortalData() {
    await fetchSlots();
    await fetchCustomerSessions();

    if (customerPollTimer) clearInterval(customerPollTimer);
    customerPollTimer = setInterval(() => {
        if (selectedRole === 'user' && currentAuthUser) {
            fetchCustomerSessions(true);
            fetchSlots(true);
        }
    }, 2500);
}

async function fetchSlots(silent = false) {
    const res = await API.get('/api/slots');
    if (res.success) {
        parkingSlots = res.slots;
        renderCustomerSlots();
    }
}

function renderCustomerSlots() {
    const container = document.getElementById('customer-slots-grid');
    if (!container) return;
    container.innerHTML = '';

    const filterType = currentVehicleType.toUpperCase();
    const list = parkingSlots.filter(s => s.slot_type === filterType);

    list.forEach(s => {
        const box = document.createElement('div');
        box.className = `slot-box ${s.status.toLowerCase()}`;
        box.innerHTML = `<div class="slot-number">${s.slot_number}</div><div class="slot-status">${s.status}</div>`;
        container.appendChild(box);
    });
}

async function fetchCustomerSessions(silent = false) {
    if (!currentAuthUser) return;
    const res = await API.get(`/api/sessions?username=${encodeURIComponent(currentAuthUser.username)}`);
    if (res.success) {
        const sessions = res.sessions;
        // Active session is any session before completion/rejection
        customerActiveSession = sessions.find(s => ['PENDING_APPROVAL', 'APPROVED', 'PARKED', 'AWAITING_PAYMENT'].includes(s.status)) || null;
        customerHistory = sessions.filter(s => ['COMPLETED', 'REJECTED'].includes(s.status));
        renderActiveSessionCard();
        renderCustomerHistoryTable();
    }
}

async function handleCustomerParkingRequest(e) {
    e.preventDefault();
    if (!currentAuthUser) return notify("Please log in first", "fa-circle-exclamation");

    const vehicleNo = document.getElementById('cust-vehicle-no').value.trim().toUpperCase();
    if (!vehicleNo) return notify("Enter a valid vehicle registration number", "fa-circle-exclamation");

    const res = await API.post('/api/parking/request', {
        username: currentAuthUser.username,
        vehicle_number: vehicleNo,
        vehicle_type: currentVehicleType.toUpperCase()
    });

    if (!res.success) {
        return notify(res.message, "fa-circle-exclamation");
    }

    notify(res.message, "fa-circle-check");
    document.getElementById('cust-vehicle-no').value = '';
    await fetchCustomerSessions();
    await fetchSlots();
}

function renderActiveSessionCard() {
    const box = document.getElementById('customer-active-session-box');
    const formBox = document.getElementById('customer-request-form-box');

    if (!customerActiveSession) {
        box.style.display = 'none';
        formBox.style.display = 'block';
        return;
    }

    formBox.style.display = 'none';
    box.style.display = 'block';

    const s = customerActiveSession;
    document.getElementById('cust-active-token').innerText = s.session_id;
    document.getElementById('cust-active-vehicle').innerText = `${s.vehicle_number} (${s.vehicle_type})`;
    document.getElementById('cust-active-rate').innerText = `₹${s.hourly_rate}/hr`;
    document.getElementById('cust-active-slot').innerText = s.assigned_slot || 'Pending Allotment';

    // Status Pill
    const statusPill = document.getElementById('cust-active-status-pill');
    statusPill.className = `status-pill ${s.status.toLowerCase()}`;
    statusPill.innerText = formatStatusLabel(s.status);

    // One QR Code used throughout entire session lifecycle
    const qrTarget = document.getElementById('cust-active-qr-target');
    qrTarget.innerHTML = '';
    new QRCode(qrTarget, {
        text: s.session_id,
        width: 160,
        height: 160,
        colorDark: "#0a0d0e",
        colorLight: "#ffffff"
    });

    // Workflow Guidance Banner per status
    const guideBox = document.getElementById('cust-workflow-guide');
    if (s.status === 'PENDING_APPROVAL') {
        guideBox.innerHTML = `
            <div style="color: #f59e0b;"><i class="fa-solid fa-clock"></i> <strong>Request Pending Approval</strong></div>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">Traffic staff will verify your request and allot an available parking bay. Keep this QR ready.</p>
        `;
    } else if (s.status === 'APPROVED') {
        guideBox.innerHTML = `
            <div style="color: #60a5fa;"><i class="fa-solid fa-square-parking"></i> <strong>Approved · Parking Bay: ${s.assigned_slot}</strong></div>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">Present this same QR code at the entry gate barrier. Traffic staff will scan it to verify vehicle entry.</p>
        `;
    } else if (s.status === 'PARKED') {
        guideBox.innerHTML = `
            <div style="color: #10b981;"><i class="fa-solid fa-car"></i> <strong>Vehicle Parked · Session Active</strong></div>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">Checked in at ${s.entry_time}. When returning to pick up your vehicle, present this exact same QR pass at the exit barrier.</p>
        `;
    } else if (s.status === 'AWAITING_PAYMENT') {
        guideBox.innerHTML = `
            <div style="color: #f87171;"><i class="fa-solid fa-receipt"></i> <strong>Exit Scanned · Awaiting Payment</strong></div>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">Duration: ${s.duration_minutes} mins (${s.billed_hours} hr billed). Total Payable: ₹${s.final_fare.toFixed(2)}.</p>
            <button class="btn-smooth btn-mint" style="margin-top: 0.75rem; width: 100%;" onclick="openPaymentModal()">
                <i class="fa-solid fa-credit-card"></i> Pay ₹${s.final_fare.toFixed(2)} via UPI / Online
            </button>
        `;
    }
}

function formatStatusLabel(st) {
    switch (st) {
        case 'PENDING_APPROVAL': return 'Pending Approval';
        case 'APPROVED': return 'Approved / Parking Allotted';
        case 'PARKED': return 'Vehicle Parked';
        case 'AWAITING_PAYMENT': return 'Awaiting Payment';
        case 'COMPLETED': return 'Completed';
        case 'REJECTED': return 'Rejected';
        default: return st;
    }
}

function renderCustomerHistoryTable() {
    const tbody = document.getElementById('cust-history-rows');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (customerHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No completed parking sessions yet.</td></tr>`;
        return;
    }

    customerHistory.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><code>${s.session_id}</code></td>
            <td>${s.vehicle_number} (${s.vehicle_type})</td>
            <td><strong>${s.assigned_slot || 'N/A'}</strong></td>
            <td>${s.duration_minutes ? s.duration_minutes + ' mins' : '---'}</td>
            <td>₹${s.final_fare.toFixed(2)}</td>
            <td><span class="status-pill ${s.status.toLowerCase()}">${formatStatusLabel(s.status)}</span></td>
            <td>
                ${s.payment_status === 'PAID' ? 
                    `<button class="btn-smooth btn-outline" style="padding: 0.35rem 0.65rem; font-size: 0.75rem;" onclick="viewDigitalReceipt('${s.session_id}')"><i class="fa-solid fa-receipt"></i> Receipt</button>` 
                    : '---'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openPaymentModal() {
    if (!customerActiveSession) return;
    const s = customerActiveSession;

    document.getElementById('pay-modal-token').innerText = s.session_id;
    document.getElementById('pay-modal-vehicle').innerText = `${s.vehicle_number} (${s.vehicle_type})`;
    document.getElementById('pay-modal-slot').innerText = s.assigned_slot || 'General';
    document.getElementById('pay-modal-entry').innerText = s.entry_time || s.request_time;
    document.getElementById('pay-modal-exit').innerText = s.exit_time || 'Just now';
    document.getElementById('pay-modal-duration').innerText = `${s.duration_minutes} Minutes (${s.billed_hours} Billable Hr)`;
    document.getElementById('pay-modal-rate').innerText = `₹${s.hourly_rate}/hr`;
    document.getElementById('pay-modal-total').innerText = `₹${s.final_fare.toFixed(2)}`;

    document.getElementById('payment-modal-overlay').classList.add('active');
}

function closePaymentModal() {
    document.getElementById('payment-modal-overlay').classList.remove('active');
}

async function processPayment(e) {
    e.preventDefault();
    if (!customerActiveSession) return;
    const upi = document.getElementById('pay-upi-id').value.trim();

    notify("Verifying transaction on backend...", "fa-circle-notch fa-spin");

    const res = await API.post('/api/parking/pay', {
        session_id: customerActiveSession.session_id,
        upi_id: upi || 'user@upi'
    });

    if (!res.success) {
        return notify(res.message, "fa-circle-exclamation");
    }

    closePaymentModal();
    notify("Payment Successful! Parking bay released.", "fa-circle-check");
    await fetchCustomerSessions();
    await fetchSlots();
    viewDigitalReceipt(res.session.session_id);
}

async function viewDigitalReceipt(sessionId) {
    const res = await API.get(`/api/session?session_id=${encodeURIComponent(sessionId)}`);
    if (!res.success) return notify("Could not fetch receipt details", "fa-circle-exclamation");

    const s = res.session;
    document.getElementById('rcpt-token').innerText = s.session_id;
    document.getElementById('rcpt-ref').innerText = s.payment_reference || 'TXN-DIRECT';
    document.getElementById('rcpt-time').innerText = s.payment_time || s.exit_time || 'Recorded';
    document.getElementById('rcpt-vehicle').innerText = `${s.vehicle_number} (${s.vehicle_type})`;
    document.getElementById('rcpt-slot').innerText = s.assigned_slot || 'N/A';
    document.getElementById('rcpt-duration').innerText = `${s.duration_minutes} Mins (${s.billed_hours} Hr)`;
    document.getElementById('rcpt-rate').innerText = `₹${s.hourly_rate}/hr`;
    document.getElementById('rcpt-total').innerText = `₹${s.final_fare.toFixed(2)}`;

    document.getElementById('receipt-modal-overlay').classList.add('active');
}

function closeReceiptModal() {
    document.getElementById('receipt-modal-overlay').classList.remove('active');
}
