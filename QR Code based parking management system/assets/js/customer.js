/**
 * ParkQR - Customer Portal Module
 * Vehicle selector, Floor matrix, Reservation & QR Pass generator
 */

function setInnerVehicleType(type) {
    currentVehicleType = type;
    document.getElementById('btn-type-car').classList.toggle('active', type === 'car');
    document.getElementById('btn-type-bike').classList.toggle('active', type === 'bike');
    
    const icon = document.getElementById('portal-vehicle-icon');
    if (icon) icon.className = type === 'car' ? 'fa-solid fa-car-side' : 'fa-solid fa-motorcycle';

    selectedCustomerSlot = null;
    document.getElementById('cust-selected-slot').value = '';
    renderCustomerSlots();
}

function renderCustomerSlots() {
    const container = document.getElementById('customer-slots-grid');
    if (!container) return;
    container.innerHTML = '';
    
    const slotList = currentVehicleType === 'car' ? carSlots : bikeSlots;

    slotList.forEach(s => {
        const box = document.createElement('div');
        box.className = `slot-box ${s.status.toLowerCase()} ${selectedCustomerSlot === s.slotNumber ? 'selected' : ''}`;
        box.onclick = () => {
            if (s.status !== 'AVAILABLE') return notify(`Slot ${s.slotNumber} occupied!`, "fa-circle-exclamation");
            selectedCustomerSlot = s.slotNumber;
            document.getElementById('cust-selected-slot').value = s.slotNumber;
            renderCustomerSlots();
        };
        box.innerHTML = `<div class="slot-number">${s.slotNumber}</div><div class="slot-status">${s.status}</div>`;
        container.appendChild(box);
    });
}

function handleCustomerBooking(e) {
    e.preventDefault();
    const vehicle = document.getElementById('cust-vehicle-no').value.toUpperCase();
    if (!selectedCustomerSlot) return notify("Select an available slot!", "fa-triangle-exclamation");

    const token = 'PRK-' + Math.floor(100000 + Math.random() * 900000);
    const slotList = currentVehicleType === 'car' ? carSlots : bikeSlots;
    const slotObj = slotList.find(s => s.slotNumber === selectedCustomerSlot);
    slotObj.status = 'OCCUPIED';

    bookings.push({
        token: token,
        type: currentVehicleType.toUpperCase(),
        slotNumber: selectedCustomerSlot,
        vehicleNumber: vehicle,
        status: 'BOOKED'
    });

    const qrBox = document.getElementById('cust-qr-target');
    qrBox.innerHTML = '';
    new QRCode(qrBox, { text: token, width: 140, height: 140 });

    document.getElementById('cust-pass-token').innerText = token;
    document.getElementById('cust-pass-type').innerText = currentVehicleType.toUpperCase();
    document.getElementById('cust-pass-slot').innerText = selectedCustomerSlot;
    document.getElementById('cust-pass-vehicle').innerText = vehicle;
    document.getElementById('customer-ticket-box').style.display = 'block';

    notify("Pass Reserved Successfully!", "fa-circle-check");
    renderCustomerSlots();
}
