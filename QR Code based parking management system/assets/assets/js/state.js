/**
 * ParkQR - State Management
 * Persistent session and live state synchronized with backend database
 */

let currentVehicleType = 'car'; // Default: car
let selectedRole = null;
let currentAuthUser = JSON.parse(sessionStorage.getItem('parkqr_current_user')) || null;
let activeStaffToken = null;
let staffScannerInstance = null;

// Slots and sessions fetched dynamically from backend
let parkingSlots = [];
let customerActiveSession = null;
let customerHistory = [];
let allAdminSessions = [];

function saveCurrentUser(userObj) {
    currentAuthUser = userObj;
    if (userObj) {
        sessionStorage.setItem('parkqr_current_user', JSON.stringify(userObj));
    } else {
        sessionStorage.removeItem('parkqr_current_user');
    }
}
