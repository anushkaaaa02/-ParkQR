/**
 * ParkQR - Authentication Module
 * Handles Role Selection, Customer Login/Signup, Staff Login (No signup), and Admin Login
 */

function selectRole(roleKey) {
    selectedRole = roleKey;
    document.querySelectorAll('.role-option-card').forEach(card => card.classList.remove('selected'));
    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('selected');
    }

    if (roleKey === 'user') {
        setUserAuthMode('login');
        setTimeout(() => showScreen('screen-user-auth'), 180);
    } else if (roleKey === 'staff') {
        setTimeout(() => showScreen('screen-staff-auth'), 180);
    } else if (roleKey === 'admin') {
        setTimeout(() => showScreen('screen-admin-auth'), 180);
    }
}

function setUserAuthMode(mode) {
    const tabLogin = document.getElementById('tab-user-login');
    const tabSignup = document.getElementById('tab-user-signup');
    const formLogin = document.getElementById('form-user-login');
    const formSignup = document.getElementById('form-user-signup');
    const subtitle = document.getElementById('user-auth-subtitle');

    if (mode === 'signup') {
        tabLogin.classList.remove('active');
        tabSignup.classList.add('active');
        formLogin.style.display = 'none';
        formSignup.style.display = 'block';
        subtitle.innerText = 'Create your unique username and password';
    } else {
        tabSignup.classList.remove('active');
        tabLogin.classList.add('active');
        formSignup.style.display = 'none';
        formLogin.style.display = 'block';
        subtitle.innerText = 'Sign in with your username and password';
    }
}

function handleCustomerSignup(e) {
    e.preventDefault();
    const username = document.getElementById('cust-signup-username').value.trim().toLowerCase();
    const pass = document.getElementById('cust-signup-password').value;
    const confirm = document.getElementById('cust-signup-confirm').value;

    if (!username) return notify("Please enter a username", "fa-circle-exclamation");
    if (pass !== confirm) return notify("Passwords do not match!", "fa-circle-xmark");

    const exists = registeredCustomers.some(u => u.username === username);
    if (exists) return notify("Username already taken! Choose a unique username", "fa-circle-exclamation");

    const newUser = { username: username, password: pass, name: username };
    registeredCustomers.push(newUser);
    localStorage.setItem('parkqr_customers', JSON.stringify(registeredCustomers));

    notify("Account created successfully! Please log in.", "fa-circle-check");
    document.getElementById('form-user-signup').reset();
    setUserAuthMode('login');
    document.getElementById('cust-login-username').value = username;
}

function handleCustomerLogin(e) {
    e.preventDefault();
    const username = document.getElementById('cust-login-username').value.trim().toLowerCase();
    const pass = document.getElementById('cust-login-password').value;

    const user = registeredCustomers.find(u => u.username === username && u.password === pass);
    if (!user) return notify("Invalid username or password!", "fa-circle-xmark");

    currentAuthUser = user;
    document.getElementById('nav-phone-display').innerText = `@${user.username}`;
    const badge = document.getElementById('nav-role-badge');
    badge.className = 'role-badge-tag user';
    badge.innerHTML = `<i class="fa-solid fa-car-side"></i> Customer`;

    notify(`Welcome back, ${user.username}!`, "fa-circle-check");
    renderCustomerSlots();
    showScreen('portal-customer');
}

function handleStaffLogin(e) {
    e.preventDefault();
    const username = document.getElementById('staff-login-username').value.trim().toLowerCase();
    const pass = document.getElementById('staff-login-password').value;

    // Refresh from localStorage in case newly created by admin
    registeredStaff = JSON.parse(localStorage.getItem('parkqr_staff')) || registeredStaff;

    const staff = registeredStaff.find(s => s.username === username && s.password === pass);
    if (!staff) return notify("Invalid staff credentials! Contact Admin.", "fa-circle-xmark");

    currentAuthUser = staff;
    document.getElementById('nav-phone-display').innerText = staff.name || `@${staff.username}`;
    const badge = document.getElementById('nav-role-badge');
    badge.className = 'role-badge-tag staff';
    badge.innerHTML = '<i class="fa-solid fa-user-shield"></i> Traffic Staff';

    notify(`Staff authenticated: ${staff.username}`, "fa-circle-check");
    initStaffScanner();
    showScreen('portal-staff');
}

function handleAdminLogin(e) {
    e.preventDefault();
    const username = document.getElementById('admin-login-username').value.trim();
    const pass = document.getElementById('admin-login-password').value;

    if (username !== adminCredentials.username || pass !== adminCredentials.password) {
        return notify("Invalid admin credentials!", "fa-circle-xmark");
    }

    currentAuthUser = adminCredentials;
    document.getElementById('nav-phone-display').innerText = `@${adminCredentials.username} (Admin)`;
    const badge = document.getElementById('nav-role-badge');
    badge.className = 'role-badge-tag admin';
    badge.innerHTML = '<i class="fa-solid fa-user-gear"></i> Administrator';

    notify("Admin console accessed", "fa-circle-check");
    updateAdminDashboard();
    renderAdminStaffTable();
    showScreen('portal-admin');
}
