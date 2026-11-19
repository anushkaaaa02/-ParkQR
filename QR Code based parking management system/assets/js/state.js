/**
 * ParkQR - State Management
 * Persistent store for slots, bookings, users, and staff
 */

let currentVehicleType = 'car'; // Default: car
let selectedRole = null;
let currentAuthUser = null;
let selectedCustomerSlot = null;
let activeStaffToken = null;
let staffScannerInstance = null;

// Credentials Storage (initialized with defaults and persistent via localStorage)
let registeredCustomers = JSON.parse(localStorage.getItem('parkqr_customers')) || [
    { username: 'alex', password: 'alex123', name: 'Alex Smith' }
];

let registeredStaff = JSON.parse(localStorage.getItem('parkqr_staff')) || [
    { username: 'officer1', password: 'staff123', name: 'Traffic Officer 01', createdAt: '2026-11-15' }
];

const adminCredentials = { username: 'admin', password: 'admin123', name: 'Chief Administrator' };

let carSlots = [
    { id: 1, slotNumber: 'C-01', status: 'AVAILABLE' },
    { id: 2, slotNumber: 'C-02', status: 'AVAILABLE' },
    { id: 3, slotNumber: 'C-03', status: 'OCCUPIED' },
    { id: 4, slotNumber: 'C-04', status: 'AVAILABLE' }
];

let bikeSlots = [
    { id: 5, slotNumber: 'B-01', status: 'AVAILABLE' },
    { id: 6, slotNumber: 'B-02', status: 'AVAILABLE' },
    { id: 7, slotNumber: 'B-03', status: 'AVAILABLE' }
];

let bookings = [
    { token: 'PRK-849301', type: 'CAR', slotNumber: 'C-03', vehicleNumber: 'MH 12 DL 9921', status: 'ACTIVE' }
];
