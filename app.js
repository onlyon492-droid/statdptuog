// ─── CLEANUP OLD DATA FROM PREVIOUS VERSIONS ─────────────────────────────────
// Remove any old conflicting localStorage keys from earlier builds
['edu_users','edu_posts','edu_software','statbook_users','statbook_posts'].forEach(k => localStorage.removeItem(k));

// Detect if running via server or as a local file
const HAS_SERVER = window.location.protocol !== 'file:';

// ─── DATA LAYER ──────────────────────────────────────────────────────────────
// If server is running → use API. Otherwise → use localStorage.
async function dbGet(key) {
    if (HAS_SERVER) {
        const res = await fetch(`/api/${key}`);
        if (!res.ok) throw new Error('Server error');
        return res.json();
    }
    if (key === 'batches') {
        let batches = JSON.parse(localStorage.getItem('uog_batches') || '[]');
        if (batches.length === 0) {
            batches = ['2020-2024', '2021-2025', '2022-2026', '2023-2027'];
            localStorage.setItem('uog_batches', JSON.stringify(batches));
        }
        return batches.map(b => ({ name: b }));
    }
    if (key === 'stories') {
        const stories = JSON.parse(localStorage.getItem('uog_stories') || '[]');
        const oneDayAgo = Date.now() - 24 * 3600 * 1000;
        const freshStories = stories.filter(s => s.timestamp >= oneDayAgo);
        localStorage.setItem('uog_stories', JSON.stringify(freshStories));
        return freshStories;
    }
    return JSON.parse(localStorage.getItem(`uog_${key}`) || '[]');
}
async function dbPost(endpoint, body) {
    if (HAS_SERVER) {
        const res = await fetch(`/api/${endpoint}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Error');
        return d;
    }
    // localStorage fallback for each endpoint
    if (endpoint.includes('/react')) {
        const postId = endpoint.split('/')[1];
        const posts = JSON.parse(localStorage.getItem('uog_posts') || '[]');
        const idx = posts.findIndex(p => String(p.id) === String(postId));
        if (idx !== -1) {
            if (!posts[idx].reactions) posts[idx].reactions = [];
            const existingIdx = posts[idx].reactions.findIndex(r => r.username === body.username);
            if (existingIdx !== -1) {
                const currentReaction = posts[idx].reactions[existingIdx].type;
                if (currentReaction === body.reactionType) {
                    posts[idx].reactions.splice(existingIdx, 1);
                } else {
                    posts[idx].reactions[existingIdx].type = body.reactionType;
                }
            } else {
                posts[idx].reactions.push({ username: body.username, type: body.reactionType });
            }
            posts[idx].likes = posts[idx].reactions.map(r => r.username);
            localStorage.setItem('uog_posts', JSON.stringify(posts));
            return { reactions: posts[idx].reactions, likes: posts[idx].likes };
        }
    }
    if (endpoint.includes('/like')) {
        const postId = endpoint.split('/')[1];
        const posts = JSON.parse(localStorage.getItem('uog_posts') || '[]');
        const idx = posts.findIndex(p => String(p.id) === String(postId));
        if (idx !== -1) {
            if (!posts[idx].reactions) posts[idx].reactions = [];
            const existingIdx = posts[idx].reactions.findIndex(r => r.username === body.username);
            if (existingIdx !== -1) {
                posts[idx].reactions.splice(existingIdx, 1);
            } else {
                posts[idx].reactions.push({ username: body.username, type: 'like' });
            }
            posts[idx].likes = posts[idx].reactions.map(r => r.username);
            localStorage.setItem('uog_posts', JSON.stringify(posts));
            return { reactions: posts[idx].reactions, likes: posts[idx].likes };
        }
    }
    if (endpoint.startsWith('users/') && endpoint.endsWith('/heartbeat')) {
        const username = endpoint.split('/')[1];
        const users = JSON.parse(localStorage.getItem('uog_users') || '[]');
        const idx = users.findIndex(u => u.username === username);
        if (idx !== -1) {
            users[idx].lastActive = new Date().toISOString();
            localStorage.setItem('uog_users', JSON.stringify(users));
        }
        return { success: true };
    }

    if (endpoint.includes('/vote')) {
        const postId = endpoint.split('/')[1];
        const posts = JSON.parse(localStorage.getItem('uog_posts') || '[]');
        const idx = posts.findIndex(p => String(p.id) === String(postId));
        if (idx !== -1 && posts[idx].poll) {
            const { optionIndex, username } = body;
            posts[idx].poll.options.forEach((opt) => {
                opt.votes = (opt.votes || []).filter(u => u !== username);
            });
            if (posts[idx].poll.options[optionIndex]) {
                if (!posts[idx].poll.options[optionIndex].votes) posts[idx].poll.options[optionIndex].votes = [];
                posts[idx].poll.options[optionIndex].votes.push(username);
            }
            localStorage.setItem('uog_posts', JSON.stringify(posts));
            return posts[idx];
        }
    }
    if (endpoint.includes('/comment')) {
        const postId = endpoint.split('/')[1];
        const posts = JSON.parse(localStorage.getItem('uog_posts') || '[]');
        const idx = posts.findIndex(p => String(p.id) === String(postId));
        if (idx !== -1) {
            if (!posts[idx].comments) posts[idx].comments = [];
            const comment = {
                author: body.author,
                name: body.name,
                role: body.role,
                text: body.text,
                date: new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            };
            posts[idx].comments.push(comment);
            localStorage.setItem('uog_posts', JSON.stringify(posts));
            return posts[idx].comments;
        }
    }
    if (endpoint === 'stories') {
        const stories = JSON.parse(localStorage.getItem('uog_stories') || '[]');
        const filtered = stories.filter(s => s.username !== body.username);
        const story = {
            id: body.id || 'user-' + Date.now(),
            username: body.username,
            name: body.name,
            profilePic: body.profilePic || '',
            text: body.text,
            timestamp: body.timestamp || Date.now()
        };
        filtered.push(story);
        localStorage.setItem('uog_stories', JSON.stringify(filtered));
        return story;
    }
    if (endpoint === 'register') {
        const users = JSON.parse(localStorage.getItem('uog_users') || '[]');
        if (users.find(u => u.username === body.username.toLowerCase()))
            throw new Error('Account already exists');
        const u = { 
            phoneVisible: false,
            allowComments: 'everyone',
            allowDownloads: true,
            showAppreciations: true,
            ...body, 
            username: body.username.toLowerCase(), 
            profilePic: '' 
        };
        users.push(u);
        localStorage.setItem('uog_users', JSON.stringify(users));
        return { user: safeUser(u) };
    }
    if (endpoint === 'login') {
        const users = JSON.parse(localStorage.getItem('uog_users') || '[]');
        const user = users.find(u => u.username === body.username.toLowerCase() && u.password === body.password);
        if (!user) throw new Error('Invalid credentials');
        return { user: safeUser(user) };
    }
    if (endpoint === 'posts') {
        const posts = JSON.parse(localStorage.getItem('uog_posts') || '[]');
        const post = { id: Date.now(), date: new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }), ...body };
        posts.unshift(post);
        localStorage.setItem('uog_posts', JSON.stringify(posts));
        return post;
    }
    if (endpoint === 'software') {
        const sw = JSON.parse(localStorage.getItem('uog_software') || '[]');
        const item = { id: Date.now(), date: new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }), ...body };
        sw.unshift(item);
        localStorage.setItem('uog_software', JSON.stringify(sw));
        return item;
    }
    if (endpoint === 'batches') {
        let batches = JSON.parse(localStorage.getItem('uog_batches') || '[]');
        if (batches.length === 0) {
            batches = ['2020-2024', '2021-2025', '2022-2026', '2023-2027'];
        }
        const name = body.name.trim();
        if (!batches.includes(name)) {
            batches.push(name);
            batches.sort();
            localStorage.setItem('uog_batches', JSON.stringify(batches));
        }
        return batches.map(b => ({ name: b }));
    }
}
async function dbPut(endpoint, body) {
    if (HAS_SERVER) {
        const res = await fetch(`/api/${endpoint}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Error');
        return d;
    }
    // localStorage fallback
    if (endpoint.startsWith('posts/')) {
        const id = endpoint.split('/')[1];
        const posts = JSON.parse(localStorage.getItem('uog_posts') || '[]');
        const idx = posts.findIndex(p => String(p.id) === String(id));
        if (idx !== -1) { posts[idx].text = body.text; localStorage.setItem('uog_posts', JSON.stringify(posts)); }
        return posts[idx];
    }
    if (endpoint.startsWith('users/')) {
        const username = endpoint.split('/')[1];
        const users = JSON.parse(localStorage.getItem('uog_users') || '[]');
        const idx = users.findIndex(u => u.username === username);
        if (idx !== -1) {
            if (body.name) users[idx].name = body.name;
            if (body.phone) users[idx].phone = body.phone;
            if (body.password) users[idx].password = body.password;
            if (body.profilePic !== undefined) users[idx].profilePic = body.profilePic;
            if (body.program !== undefined) users[idx].program = body.program;
            if (body.batch !== undefined) users[idx].batch = body.batch;
            
            // Offline support for privacy parameters
            if (body.phoneVisible !== undefined) users[idx].phoneVisible = body.phoneVisible;
            if (body.allowComments !== undefined) users[idx].allowComments = body.allowComments;
            if (body.allowDownloads !== undefined) users[idx].allowDownloads = body.allowDownloads;
            if (body.showAppreciations !== undefined) users[idx].showAppreciations = body.showAppreciations;
            if (body.phonePrivacy !== undefined) users[idx].phonePrivacy = body.phonePrivacy;
            if (body.profileStealth !== undefined) users[idx].profileStealth = body.profileStealth;
            if (body.statusPrivacy !== undefined) users[idx].statusPrivacy = body.statusPrivacy;
            if (body.connectionPolicy !== undefined) users[idx].connectionPolicy = body.connectionPolicy;
            if (body.anonymousMode !== undefined) users[idx].anonymousMode = body.anonymousMode;
            if (body.incognitoMode !== undefined) users[idx].incognitoMode = body.incognitoMode;
            if (body.autoLogoutTime !== undefined) users[idx].autoLogoutTime = body.autoLogoutTime;
            
            localStorage.setItem('uog_users', JSON.stringify(users));
            return { user: safeUser(users[idx]) };
        }
    }
}
async function dbDelete(endpoint, body) {
    if (HAS_SERVER) {
        const res = await fetch(`/api/${endpoint}`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return res.json();
    }
    if (endpoint.startsWith('posts/')) {
        const id = endpoint.split('/')[1];
        const posts = JSON.parse(localStorage.getItem('uog_posts') || '[]');
        localStorage.setItem('uog_posts', JSON.stringify(posts.filter(p => String(p.id) !== String(id))));
    }
    // Offline support for user bulk post deletion
    if (endpoint.startsWith('users/') && endpoint.endsWith('/posts')) {
        const username = endpoint.split('/')[1];
        const posts = JSON.parse(localStorage.getItem('uog_posts') || '[]');
        localStorage.setItem('uog_posts', JSON.stringify(posts.filter(p => p.author !== username)));
        return { message: 'All posts deleted successfully' };
    }
}

function safeUser(u) { const { password, ...s } = u; return s; }

// Initialize empty localStorage if first time
if (!localStorage.getItem('uog_users'))    localStorage.setItem('uog_users', '[]');
if (!localStorage.getItem('uog_posts'))    localStorage.setItem('uog_posts', '[]');
if (!localStorage.getItem('uog_software')) localStorage.setItem('uog_software', '[]');

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentUser = null;
let activeStories = [];
let heartbeatInterval = null;

// ─── SESSION PERSISTENCE ─────────────────────────────────────────────────────
// Restore session from localStorage if exists (so refresh doesn't log out)
try {
    const savedSession = localStorage.getItem('uog_session');
    if (savedSession) {
        currentUser = JSON.parse(savedSession);
        // Synchronously toggle classes to prevent page flash of login screen
        const authEl = document.getElementById('auth-view');
        const workEl = document.getElementById('workspace-view');
        if (authEl && workEl) {
            authEl.classList.remove('active');
            workEl.classList.add('active');
        }
    }
} catch(e) { currentUser = null; }

function startHeartbeatLoop() {
    if (!currentUser) return;
    // Send immediate heartbeat
    dbPost(`users/${currentUser.username}/heartbeat`, {}).catch(e => console.log('Heartbeat failed:', e));
    
    // Loop every 60s
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        if (!currentUser) {
            clearInterval(heartbeatInterval);
            return;
        }
        dbPost(`users/${currentUser.username}/heartbeat`, {}).catch(e => console.log('Heartbeat failed:', e));
    }, 60000);
}

function stopHeartbeatLoop() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}
let currentView = 'feed';
let uploadedFiles = [];
let activeDirectoryTab = 'All';
let activeDirectoryBatch = 'All';
let allBatches = [];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function showToast(msg, isError = false) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-circle' : 'fa-check-circle'}" style="color:${isError ? '#ef4444' : '#10b981'};margin-right:8px;"></i> ${msg}`;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

function renderAvatar(el, user) {
    if (!el) return;
    el.innerHTML = (user && user.profilePic)
        ? `<img src="${user.profilePic}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : (user ? user.name.charAt(0).toUpperCase() : '?');
}

// ─── SECURITY AUDIT LOGS ───────────────────────────────────────────────────
function logSecurityEvent(action, details, status = 'success') {
    if (!currentUser) return;
    try {
        const key = `uog_security_log_${currentUser.username}`;
        const logs = JSON.parse(localStorage.getItem(key) || '[]');
        const newLog = {
            id: Date.now(),
            timestamp: new Date().toLocaleString('en-PK'),
            action: action,
            details: details,
            status: status, // 'success', 'info', 'warning', 'danger'
            device: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser'
        };
        logs.unshift(newLog);
        localStorage.setItem(key, JSON.stringify(logs.slice(0, 50)));
    } catch (e) {
        console.error('Error logging security event:', e);
    }
}

// ─── INACTIVITY AUTO-LOGOUT ───────────────────────────────────────────────
let inactivityTimer = null;

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (!currentUser) return;
    
    const timeoutMin = parseInt(currentUser.autoLogoutTime || 0);
    if (timeoutMin === 0) return;
    
    const timeoutMs = timeoutMin * 60 * 1000;
    inactivityTimer = setTimeout(() => {
        logSecurityEvent('Auto Logout', `Logged out automatically due to ${timeoutMin} minutes of inactivity`, 'warning');
        logoutUser(true);
    }, timeoutMs);
}

function initInactivityTracker() {
    const events = ['mousemove', 'keypress', 'click', 'scroll', 'touchstart'];
    events.forEach(evt => {
        window.addEventListener(evt, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();
}

function stopInactivityTracker() {
    const events = ['mousemove', 'keypress', 'click', 'scroll', 'touchstart'];
    events.forEach(evt => {
        window.removeEventListener(evt, resetInactivityTimer);
    });
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }
}

function logoutUser(isAuto = false) {
    stopHeartbeatLoop();
    stopInactivityTracker();
    
    if (!isAuto && currentUser) {
        logSecurityEvent('Account Logout', 'User logged out of session', 'info');
    }
    
    currentUser = null;
    localStorage.removeItem('uog_session');
    document.getElementById('workspace-view').classList.remove('active');
    document.getElementById('auth-view').classList.add('active');
    document.getElementById('login-form').reset();
    
    if (isAuto) {
        showToast('Logged out automatically due to inactivity.', true);
    } else {
        showToast('Logged out successfully.');
    }
}

// GDPR compliance: Export user data
window.exportUserData = function() {
    if (!currentUser) return;
    try {
        const securityLogs = JSON.parse(localStorage.getItem(`uog_security_log_${currentUser.username}`) || '[]');
        const bookmarks = JSON.parse(localStorage.getItem(`bookmarks_${currentUser.username}`) || '[]');
        
        const dataToExport = {
            exportedAt: new Date().toLocaleString(),
            profile: currentUser,
            securityLogs: securityLogs,
            bookmarks: bookmarks,
            note: "UOG Statistics Portal - User Account Data Export"
        };
        
        const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `uog_stats_data_${currentUser.username}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        logSecurityEvent('GDPR Data Export', 'Downloaded full account data archive', 'info');
        showToast('Account data exported successfully.');
    } catch (e) {
        showToast('Failed to export data.', true);
    }
};

// GDPR compliance: Complete user account erasure
window.eraseUserAccount = async function() {
    if (!currentUser) return;
    if (!confirm("Are you absolutely sure you want to delete your account? This will permanently delete your profile, logs, and logout you from the system. This cannot be undone!")) {
        return;
    }
    
    try {
        const usernameToDelete = currentUser.username;
        
        // 1. Delete all posts by this user
        if (HAS_SERVER) {
            await dbDelete(`users/${usernameToDelete}/posts`);
            await dbDelete(`users/${usernameToDelete}`); // Backend endpoint for user deletion if exists
        } else {
            const posts = JSON.parse(localStorage.getItem('uog_posts') || '[]');
            localStorage.setItem('uog_posts', JSON.stringify(posts.filter(p => p.author !== usernameToDelete)));
            
            const users = JSON.parse(localStorage.getItem('uog_users') || '[]');
            localStorage.setItem('uog_users', JSON.stringify(users.filter(u => u.username !== usernameToDelete)));
        }
        
        // 2. Clear local storage records related to user
        localStorage.removeItem(`uog_security_log_${usernameToDelete}`);
        localStorage.removeItem(`bookmarks_${usernameToDelete}`);
        
        // 3. Clear session and redirect to login
        currentUser = null;
        localStorage.removeItem('uog_session');
        document.getElementById('workspace-view').classList.remove('active');
        document.getElementById('auth-view').classList.add('active');
        document.getElementById('login-form').reset();
        
        showToast('Your account and all associated data have been permanently deleted.', true);
    } catch (e) {
        showToast('Failed to erase account.', true);
    }
};


// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
const notifBtn = document.getElementById('notif-btn');
const notifDropdown = document.getElementById('notif-dropdown');
notifBtn.addEventListener('click', (e) => {
    notifDropdown.classList.toggle('active');
    document.getElementById('notif-badge').style.display = 'none';
    e.stopPropagation();
});
document.addEventListener('click', (e) => {
    if (!notifBtn.contains(e.target)) notifDropdown.classList.remove('active');
});

// ─── REGISTRATION ─────────────────────────────────────────────────────────────
document.getElementById('open-signup').addEventListener('click', () => document.getElementById('signup-modal').classList.add('active'));
document.getElementById('close-signup').addEventListener('click', () => document.getElementById('signup-modal').classList.remove('active'));

const regRole = document.getElementById('reg-role');
const regUsername = document.getElementById('reg-username');
const regStudentFields = document.getElementById('reg-student-fields');
const regFacultyFields = document.getElementById('reg-faculty-fields');

regRole.addEventListener('change', () => {
    if (regRole.value === 'Student') {
        regUsername.placeholder = "Roll No (Must contain 'UOG')";
        regStudentFields.style.display = 'block';
        regFacultyFields.style.display = 'none';
        document.getElementById('reg-program').required = true;
        document.getElementById('reg-batch').required = true;
        document.getElementById('reg-area').required = true;
        document.getElementById('reg-age').required = true;
        document.getElementById('reg-semester').required = true;
        document.getElementById('reg-designation').required = false;
    } else {
        regUsername.placeholder = "Faculty Email (@uog.edu.pk)";
        regStudentFields.style.display = 'none';
        regFacultyFields.style.display = 'block';
        document.getElementById('reg-program').required = false;
        document.getElementById('reg-batch').required = false;
        document.getElementById('reg-area').required = false;
        document.getElementById('reg-age').required = false;
        document.getElementById('reg-semester').required = false;
        document.getElementById('reg-designation').required = true;
    }
});

document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const role = regRole.value;
    const username = regUsername.value.trim().toLowerCase();
    if (role === 'Student' && !username.includes('uog')) { showToast("Roll Number must contain 'UOG'", true); return; }
    if (role === 'Faculty' && !username.endsWith('@uog.edu.pk')) { showToast("Faculty must use @uog.edu.pk email", true); return; }
    
    const program = role === 'Student' ? document.getElementById('reg-program').value : '';
    const batch = role === 'Student' ? document.getElementById('reg-batch').value : '';
    const tagline = document.getElementById('reg-tagline') ? document.getElementById('reg-tagline').value.trim() : '';
    const gender = document.getElementById('reg-gender').value;
    const area = role === 'Student' ? document.getElementById('reg-area').value.trim() : '';
    const age = role === 'Student' ? document.getElementById('reg-age').value : '';
    const semester = role === 'Student' ? document.getElementById('reg-semester').value : '';
    
    const designation = role === 'Faculty' ? document.getElementById('reg-designation').value : '';
    const publicationsCount = role === 'Faculty' ? (parseInt(document.getElementById('reg-publications').value) || 0) : 0;
    const education = role === 'Faculty' ? document.getElementById('reg-faculty-education').value : '';
    const jobStatus = role === 'Faculty' ? document.getElementById('reg-faculty-status').value : '';
    
    const btn = e.target.querySelector('button[type=submit]');
    btn.textContent = 'Registering...'; btn.disabled = true;
    try {
        await dbPost('register', {
            username,
            password: document.getElementById('reg-password').value,
            name: `${document.getElementById('reg-firstname').value.trim()} ${document.getElementById('reg-lastname').value.trim()}`,
            role,
            phone: document.getElementById('reg-phone').value.trim(),
            program,
            batch,
            tagline,
            gender,
            area,
            age,
            semester,
            designation,
            publicationsCount,
            education,
            jobStatus
        });
        showToast('Registration successful! Please login.');
        document.getElementById('signup-modal').classList.remove('active');
        document.getElementById('signup-form').reset();
        if (regStudentFields) regStudentFields.style.display = 'none';
    } catch (err) { showToast(err.message, true); }
    finally { btn.textContent = 'Complete Registration'; btn.disabled = false; }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username').value.trim();
    const btn = e.target.querySelector('button[type=submit]');
    btn.textContent = 'Logging in...'; btn.disabled = true;
    try {
        const data = await dbPost('login', {
            username: usernameInput,
            password: document.getElementById('login-password').value
        });
        currentUser = data.user;
        localStorage.setItem('uog_session', JSON.stringify(currentUser)); // Save session
        logSecurityEvent('Account Login', 'Successful authentication via credentials', 'success');
        initApp();
        document.getElementById('auth-view').classList.remove('active');
        document.getElementById('workspace-view').classList.add('active');
        showToast(`Welcome back, ${currentUser.name}!`);
    } catch (err) {
        showToast(err.message, true);
        try {
            const userKey = usernameInput.toLowerCase();
            const key = `uog_security_log_${userKey}`;
            const logs = JSON.parse(localStorage.getItem(key) || '[]');
            logs.unshift({
                id: Date.now(),
                timestamp: new Date().toLocaleString('en-PK'),
                action: 'Login Failure',
                details: `Failed login attempt: ${err.message}`,
                status: 'danger',
                device: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser'
            });
            localStorage.setItem(key, JSON.stringify(logs.slice(0, 50)));
        } catch (e) {}
    }
    finally { btn.textContent = 'Access Portal'; btn.disabled = false; }
});

document.getElementById('sign-out-btn').addEventListener('click', () => {
    logoutUser(false);
});



// ─── APP INIT ─────────────────────────────────────────────────────────────────
function initApp() {
    document.getElementById('nav-name').textContent = currentUser.name.split(' ')[0];
    document.getElementById('side-name').textContent = currentUser.name;
    
    if (currentUser.role === 'Student') {
        document.getElementById('side-role').textContent = `${currentUser.program || 'Student'} • Batch ${currentUser.batch || 'N/A'}`;
    } else {
        const desig = currentUser.designation || 'Faculty Member';
        const pubCount = currentUser.publicationsCount || 0;
        document.getElementById('side-role').textContent = `${desig} • ${pubCount} Papers`;
    }
    
    document.getElementById('compose-name').textContent = currentUser.name;
    renderAvatar(document.getElementById('nav-avatar'), currentUser);
    renderAvatar(document.getElementById('side-avatar'), currentUser);
    renderAvatar(document.getElementById('post-avatar'), currentUser);
    renderAvatar(document.getElementById('compose-avatar'), currentUser);
    updateStats();
    startHeartbeatLoop();
    initInactivityTracker();
    switchView('feed');
    // Populate mobile profile sheet & avatar
    if (typeof updateMobileProfileSheet === 'function') updateMobileProfileSheet();
}

// ─── PROFILE PIC ──────────────────────────────────────────────────────────────
document.getElementById('profile-pic-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) { showToast('Please choose an image.', true); return; }
    if (file.size > 1500000) { showToast('Image too large (max 1.5MB).', true); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            await dbPut(`users/${currentUser.username}/profile`, { profilePic: ev.target.result });
            currentUser.profilePic = ev.target.result;
            localStorage.setItem('uog_session', JSON.stringify(currentUser)); // Keep session fresh
            ['nav-avatar','side-avatar','post-avatar','compose-avatar'].forEach(id => renderAvatar(document.getElementById(id), currentUser));
            showToast('Profile picture updated!');
        } catch (err) { showToast(err.message, true); }
    };
    reader.readAsDataURL(file);
});

// ─── EDIT PROFILE ─────────────────────────────────────────────────────────────
document.getElementById('open-edit-profile').addEventListener('click', () => {
    document.getElementById('edit-name').value = currentUser.name;
    document.getElementById('edit-phone').value = currentUser.phone || '';
    document.getElementById('edit-password').value = '';
    
    const editTaglineElem = document.getElementById('edit-tagline');
    if (editTaglineElem) {
        editTaglineElem.value = currentUser.tagline || '';
    }
    
    const editStudentFields = document.getElementById('edit-student-fields');
    const editFacultyFields = document.getElementById('edit-faculty-fields');
    if (currentUser.role === 'Student') {
        editStudentFields.style.display = 'block';
        editFacultyFields.style.display = 'none';
        document.getElementById('edit-program').value = currentUser.program || '';
        document.getElementById('edit-batch').value = currentUser.batch || '';
    } else {
        editStudentFields.style.display = 'none';
        editFacultyFields.style.display = 'block';
        document.getElementById('edit-designation').value = currentUser.designation || 'Lecturer';
        document.getElementById('edit-publications').value = currentUser.publicationsCount || 0;
        document.getElementById('edit-faculty-education').value = currentUser.education || 'BS / Master';
        document.getElementById('edit-faculty-status').value = currentUser.jobStatus || 'Active';
    }
    
    document.getElementById('edit-profile-modal').classList.add('active');
});
document.getElementById('close-edit-profile').addEventListener('click', () =>
    document.getElementById('edit-profile-modal').classList.remove('active'));

document.getElementById('edit-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { name: document.getElementById('edit-name').value.trim(), phone: document.getElementById('edit-phone').value.trim() };
    const pw = document.getElementById('edit-password').value;
    if (pw) body.password = pw;
    
    const editTaglineElem = document.getElementById('edit-tagline');
    if (editTaglineElem) {
        body.tagline = editTaglineElem.value.trim();
    }
    
    if (currentUser.role === 'Student') {
        body.program = document.getElementById('edit-program').value;
        body.batch = document.getElementById('edit-batch').value;
    } else {
        body.designation = document.getElementById('edit-designation').value;
        body.publicationsCount = parseInt(document.getElementById('edit-publications').value) || 0;
        body.education = document.getElementById('edit-faculty-education').value;
        body.jobStatus = document.getElementById('edit-faculty-status').value;
    }
    
    try {
        const data = await dbPut(`users/${currentUser.username}/profile`, body);
        currentUser.name = data.user.name;
        currentUser.program = data.user.program;
        currentUser.batch = data.user.batch;
        currentUser.tagline = data.user.tagline;
        currentUser.designation = data.user.designation;
        currentUser.publicationsCount = data.user.publicationsCount;
        currentUser.education = data.user.education;
        currentUser.jobStatus = data.user.jobStatus;
        localStorage.setItem('uog_session', JSON.stringify(currentUser)); // Keep session fresh
        
        document.getElementById('side-name').textContent = currentUser.name;
        document.getElementById('nav-name').textContent = currentUser.name.split(' ')[0];
        document.getElementById('compose-name').textContent = currentUser.name;
        
        const sideTaglineElem = document.getElementById('side-tagline');
        if (sideTaglineElem) {
            sideTaglineElem.textContent = currentUser.tagline || '';
            sideTaglineElem.style.display = currentUser.tagline ? 'block' : 'none';
        }
        
        // Also update subtext role/program/batch on sidebar
        if (currentUser.role === 'Student') {
            document.getElementById('side-role').textContent = `${currentUser.program || 'Student'} • Batch ${currentUser.batch || 'N/A'}`;
        } else {
            const desig = currentUser.designation || 'Faculty Member';
            const pubCount = currentUser.publicationsCount || 0;
            document.getElementById('side-role').textContent = `${desig} • ${pubCount} Papers`;
        }
        
        document.getElementById('edit-profile-modal').classList.remove('active');
        showToast('Profile updated!');
        
        // Refresh directory if currently active
        if (currentView === 'students') {
            renderDirectory();
        }
    } catch (err) { showToast(err.message, true); }
});

// ─── STATS ────────────────────────────────────────────────────────────────────
async function updateStats() {
    const [posts, sw, users] = await Promise.all([dbGet('posts'), dbGet('software'), dbGet('users')]);
    document.getElementById('record-count').textContent = posts.length;
    document.getElementById('sw-count').textContent = sw.length;
    
    // Categorize students
    const statsStudents = users.filter(u => u.role === 'Student' && (u.program === 'BS Statistics' || !u.program)).length;
    const analyticsStudents = users.filter(u => u.role === 'Student' && u.program === 'BS Data Analytics').length;
    
    const statEl = document.getElementById('stat-student-count');
    const analyticsEl = document.getElementById('analytics-student-count');
    if (statEl) statEl.textContent = statsStudents;
    if (analyticsEl) analyticsEl.textContent = analyticsStudents;

    document.getElementById('faculty-count').textContent = users.filter(u => u.role === 'Faculty').length;
    const notices = posts.filter(p => p.category && p.category.includes('Update'));
    const noticeList = document.getElementById('notice-list-container');
    noticeList.innerHTML = notices.length === 0
        ? `<li style="text-align:center;color:#6b7280;font-size:0.85rem;padding:15px;">No recent notices.</li>`
        : notices.slice(0, 3).map(n => `<li><span class="notice-date">${n.date}</span><p>${n.text.substring(0,65)}${n.text.length > 65 ? '...' : ''}</p></li>`).join('');

    // Trigger sidebar badge counts update
    if (window.updateSidebarBadges) {
        window.updateSidebarBadges();
    }
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
const sidebarItems  = document.querySelectorAll('.sidebar-list li[data-target]');
const listContainer = document.getElementById('list-container');
const viewTitle     = document.getElementById('view-title');
const viewDesc      = document.getElementById('view-desc');
const composeCard   = document.getElementById('compose-card');

sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
        sidebarItems.forEach(i => i.classList.remove('active-item'));
        item.classList.add('active-item');
        switchView(item.getAttribute('data-target'));
    });
});

function switchView(view) {
    currentView = view;
    const searchInput = document.querySelector('.nav-search input');
    if (searchInput) searchInput.value = '';
    listContainer.innerHTML = '<div style="padding:2rem;text-align:center;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    
    const analyticsContainer = document.getElementById('analytics-container');
    if (analyticsContainer) analyticsContainer.style.display = (view === 'analytics') ? 'block' : 'none';
    listContainer.style.display = (view === 'analytics') ? 'none' : '';

    // Toggle Directory Filter Bar visibility
    const filterBar = document.getElementById('directory-filter-bar');
    if (filterBar) {
        filterBar.style.display = (view === 'students') ? 'flex' : 'none';
    }

    if (view === 'feed' || view === 'records') {
        composeCard.style.display = 'block';
        viewTitle.textContent = view === 'feed' ? 'Department Feed' : 'Academic Records';
        viewDesc.textContent  = view === 'feed' ? 'Latest updates, notices, and academic discussions.' : 'Shared documents, event pictures, and resources.';
        listContainer.className = '';
        renderPosts(view);
    } else if (view === 'software') {
        composeCard.style.display = 'block';
        viewTitle.textContent = 'Software Repository';
        viewDesc.textContent  = 'Download statistical software and tools.';
        listContainer.className = 'software-grid';
        renderSoftware();
    } else if (view === 'students') {
        composeCard.style.display = 'none';
        viewTitle.textContent = 'Alumni & Student Directory';
        viewDesc.textContent  = 'A secure directory of all registered members.';
        listContainer.className = 'directory-grid';
        renderDirectory();
    } else if (view === 'saved') {
        composeCard.style.display = 'none';
        viewTitle.textContent = 'Saved Items';
        viewDesc.textContent  = 'Your bookmarked updates and academic documents.';
        listContainer.className = '';
        renderPosts('saved');
    } else if (view === 'privacy') {
        composeCard.style.display = 'none';
        viewTitle.textContent = 'Privacy Settings';
        viewDesc.textContent  = 'Boost your post-related privacy features and visibility controls.';
        listContainer.className = '';
        renderPrivacyDashboard();
    } else if (view === 'analytics') {
        composeCard.style.display = 'none';
        viewTitle.textContent = 'Department Analytics';
        viewDesc.textContent  = 'Real-time statistical overview of the department demographics.';
        renderAnalytics();
    }
}

// ─── RENDER POSTS ─────────────────────────────────────────────────────────────
async function renderPosts(filterView) {
    const [posts, users, stories] = await Promise.all([dbGet('posts'), dbGet('users'), dbGet('stories')]);
    activeStories = stories || [];
    
    // 1. Filter Posts
    let filtered = [];
    if (filterView === 'saved') {
        const savedIds = getBookmarks();
        filtered = posts.filter(p => savedIds.includes(String(p.id)));
    } else {
        filtered = posts.filter(p => {
            if (!p.category) return false;
            if (filterView === 'feed' && !p.category.includes('Update')) return false;
            if (filterView === 'records' && !p.category.includes('Record')) return false;
            
            // Post Visibility Enforcement
            if (p.visibility === 'faculty') {
                if (currentUser.role !== 'Faculty' && p.author !== currentUser.username && p.originalAuthor !== currentUser.username) return false;
            } else if (p.visibility === 'batch_faculty') {
                if (currentUser.role !== 'Faculty' && p.author !== currentUser.username && p.originalAuthor !== currentUser.username) {
                    if (!p.authorBatch || currentUser.batch !== p.authorBatch) return false;
                }
            }
            
            // Targeted records visibility (e.g. BS program, batches, semesters)
            if (p.category.includes('Record') && currentUser.role !== 'Faculty' && p.author !== currentUser.username && p.originalAuthor !== currentUser.username) {
                const targetProg = p.targetProgram || 'all';
                const targetBat = p.targetBatch || 'all';
                const targetSem = p.targetSemester || 'all';
                
                if (targetProg !== 'all' && currentUser.program !== targetProg) return false;
                if (targetBat !== 'all' && currentUser.batch !== targetBat) return false;
                if (targetSem !== 'all' && currentUser.semester !== targetSem) return false;
            }
            return true;
        });
    }
    
    listContainer.innerHTML = '';
    
    // Inject Academic Status / Stories bubbles at the top of the feed
    if (filterView === 'feed') {
        renderStatusStories(listContainer);
    }
    
    // Inject Sort Bar for Feed and Records
    if (filterView === 'feed' || filterView === 'records') {
        const sortBar = document.createElement('div');
        sortBar.className = 'feed-sort-bar';
        sortBar.innerHTML = `
            <span><i class="fas fa-sliders-h"></i> Sort Department Feed</span>
            <button class="sort-btn ${window.feedSortOrder !== 'trending' ? 'active' : ''}" onclick="window.changeFeedSort('latest', '${filterView}')">
                <i class="fas fa-clock"></i> Latest
            </button>
            <button class="sort-btn ${window.feedSortOrder === 'trending' ? 'active' : ''}" onclick="window.changeFeedSort('trending', '${filterView}')">
                <i class="fas fa-fire"></i> Trending
            </button>
        `;
        listContainer.appendChild(sortBar);
    }
    
    if (filtered.length === 0) {
        listContainer.innerHTML += `<div style="padding:2rem;text-align:center;color:#6b7280;border:1px dashed #e5e7eb;border-radius:8px;width:100%;">No posts here yet. Be the first!</div>`;
        return;
    }
    
    // 2. Sort Posts
    window.feedSortOrder = window.feedSortOrder || 'latest';
    if (window.feedSortOrder === 'trending') {
        filtered.sort((a, b) => {
            const scoreA = (a.likes || []).length + (a.comments || []).length;
            const scoreB = (b.likes || []).length + (b.comments || []).length;
            return scoreB - scoreA;
        });
    } else {
        filtered.sort((a, b) => Number(b.id) - Number(a.id));
    }
    
    // 3. Render Post Cards
    filtered.forEach(post => {
        const isOwner = post.author === currentUser.username;
        const postUser = users.find(u => u.username === post.author);
        const avatarHtml = postUser && postUser.profilePic
            ? `<img src="${postUser.profilePic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">`
            : (post.name || '?').charAt(0).toUpperCase();

        let showActiveDot = false;
        if (postUser && postUser.lastActive) {
            const isActive = (new Date() - new Date(postUser.lastActive)) < (3 * 60 * 1000);
            if (isActive) {
                const statusPrivacy = postUser.statusPrivacy || 'everyone';
                if (statusPrivacy === 'everyone' || post.author === currentUser.username || currentUser.role === 'Faculty') {
                    showActiveDot = true;
                }
            }
        }
        
        const activeDotHtml = showActiveDot ? `<div class="active-dot-pulse" style="position:absolute; bottom:0; right:0; width:12px; height:12px; background-color:#10b981; border-radius:50%; border:2px solid var(--surface-card);"></div>` : '';
        const avatarWrapper = `<div style="position:relative; width:100%; height:100%;">${avatarHtml}${activeDotHtml}</div>`;

        const allowComments = postUser && postUser.allowComments ? postUser.allowComments : 'everyone';
        const allowDownloads = postUser && postUser.allowDownloads !== false; // default true
        const showAppreciations = postUser && showAppreciations !== false; // default true

        // Filter and categorize media attachments
        const images = (post.files || []).filter(f => f.type === 'image');
        const nonImages = (post.files || []).filter(f => f.type !== 'image');

        let imagesHtml = '';
        if (images.length > 0) {
            if (!allowDownloads && !isOwner) {
                imagesHtml = `
                    <div class="locked-image-container" onclick="showToast('This attachment is locked by the author\\'s privacy settings.', true)" style="cursor:not-allowed;">
                        <img src="${images[0].data}">
                        <div class="locked-image-overlay">
                            <i class="fas fa-lock" style="font-size:1.8rem;margin-bottom:8px;color:#ef4444;"></i>
                            <span>Attachments Protected (${images.length} Image${images.length !== 1 ? 's' : ''})</span>
                        </div>
                    </div>
                `;
            } else {
                const count = images.length;
                let gridClass = 'grid-1';
                if (count === 2) gridClass = 'grid-2';
                else if (count === 3) gridClass = 'grid-3';
                else if (count === 4) gridClass = 'grid-4';
                else if (count > 4) gridClass = 'grid-more';
                
                imagesHtml = `<div class="post-images-grid ${gridClass}">`;
                if (count <= 4) {
                    images.forEach(img => {
                        imagesHtml += `<img src="${img.data}" onclick="window.openLightbox('${img.data}', '${(post.text || '').substring(0, 50).replace(/'/g, "\\'") + '...'}')" title="Click to expand">`;
                    });
                } else {
                    for (let i = 0; i < 3; i++) {
                        imagesHtml += `<img src="${images[i].data}" onclick="window.openLightbox('${images[i].data}', '${(post.text || '').substring(0, 50).replace(/'/g, "\\'") + '...'}')" title="Click to expand">`;
                    }
                    imagesHtml += `
                        <div class="more-images-overlay" onclick="window.openLightbox('${images[3].data}', '${(post.text || '').substring(0, 50).replace(/'/g, "\\'") + '...'}')">
                            <img src="${images[3].data}">
                            <div class="more-images-label">+${count - 3}</div>
                        </div>
                    `;
                }
                imagesHtml += `</div>`;
            }
        }

        let filesHtml = '';
        nonImages.forEach(f => {
            let fileClickHtml = '';
            let lockBadge = '';
            if (!allowDownloads && !isOwner) {
                fileClickHtml = `onclick="showToast('This attachment is locked by the author\\'s privacy settings.', true)" style="cursor:not-allowed; opacity:0.75;"`;
                lockBadge = `<span style="color:#ef4444;font-size:0.72rem;font-weight:600;"><i class="fas fa-lock"></i> Protected</span>`;
            } else {
                fileClickHtml = `onclick="window.downloadAttachment('${post.id}', '${f.name}')" style="cursor:pointer;"`;
                lockBadge = `<span style="color:#10b981;font-size:0.72rem;font-weight:600;"><i class="fas fa-arrow-down"></i> Click to Download</span>`;
            }
            
            const fileIcon = f.type === 'video' ? 'fa-file-video' : 'fa-file-pdf';
            filesHtml += `
                <div class="file-attachment ${f.type === 'video' ? 'video' : 'doc'}" ${fileClickHtml}>
                    <i class="fas ${(!allowDownloads && !isOwner) ? 'fa-lock' : fileIcon}"></i>
                    <div class="file-details">
                        <div class="file-name">${f.name}</div>
                        <div class="file-meta">${f.type === 'video' ? 'Video' : 'Document'} • ${lockBadge}</div>
                    </div>
                </div>
            `;
        });
        




        const mediaHtml = imagesHtml + filesHtml;
        let pollHtml = '';
        if (post.poll) {
            const totalVotes = post.poll.options.reduce((sum, opt) => sum + (opt.votes || []).length, 0);
            const userVotedOptionIndex = post.poll.options.findIndex(opt => (opt.votes || []).includes(currentUser.username));
            const hasVoted = userVotedOptionIndex !== -1;
            const optionsHtml = post.poll.options.map((opt, optIdx) => {
                const optVotes = (opt.votes || []).length;
                const percentage = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                if (hasVoted) {
                    const isMyVote = optIdx === userVotedOptionIndex;
                    return `<div class="post-poll-option voted-option"><div class="post-poll-bar" style="width: ${percentage}%;"></div><span class="post-poll-text">${opt.text} ${isMyVote ? '<strong style="color:var(--uog-orange); font-size:0.75rem;">(Your Vote)</strong>' : ''}</span><span class="post-poll-percent">${percentage}% (${optVotes} vote${optVotes !== 1 ? 's' : ''})</span></div>`;
                } else {
                    return `<div class="post-poll-option" onclick="window.castPollVote('${post.id}', ${optIdx})"><span class="post-poll-text">${opt.text}</span></div>`;
                }
            }).join('');
            pollHtml = `<div class="post-poll-container"><div class="post-poll-question"><i class="fas fa-poll-h"></i> ${post.poll.question}</div><div class="post-poll-options">${optionsHtml}</div><div class="post-poll-meta">${totalVotes} total vote${totalVotes !== 1 ? 's' : ''}</div></div>`;
        }
        const commentsArr = post.comments || [];
        const reactions = post.reactions || [];
        const myReaction = reactions.find(r => r.username === currentUser.username);
        const hasReacted = !!myReaction;
        const emojiMap = { like: '👍', love: '❤️', celebrate: '👏', insight: '💡', respect: '🎓' };
        const currentReactionEmoji = hasReacted ? emojiMap[myReaction.type] : '<i class="fa-solid fa-thumbs-up"></i>';
        const reactionLabel = hasReacted ? myReaction.type.charAt(0).toUpperCase() + myReaction.type.slice(1) : 'Appreciate';
        const isBookmarked = getBookmarks().includes(String(post.id));

        // Simulated reach views based on ID and metrics
        const mockViews = Math.floor((post.id % 880) + 24) + (reactions.length * 4) + (commentsArr.length * 6);

        // Appreciation counts respects privacy setting of the author
        const authorShowLikes = postUser && postUser.showAppreciations !== false;
        
        let reactionsDisplayHtml = '';
        if (reactions.length > 0) {
            const uniqueReactionTypes = [...new Set(reactions.map(r => r.type))];
            const bubblesHtml = uniqueReactionTypes.map(t => `<span class="reaction-bubble-icon" title="${t.charAt(0).toUpperCase() + t.slice(1)}">${emojiMap[t] || '👍'}</span>`).join('');
            
            let countLabel = '';
            if (!authorShowLikes && !isOwner) {
                countLabel = 'Appreciations Private';
            } else {
                countLabel = `${reactions.length} reaction${reactions.length !== 1 ? 's' : ''}`;
            }
            
            reactionsDisplayHtml = `
                <div class="post-reactions-display">
                    <div class="reaction-bubbles">
                        ${bubblesHtml}
                    </div>
                    <span style="margin-left: 8px; font-weight: 500;">${countLabel}</span>
                </div>
            `;
        }

        const appreciationBtnHtml = `
            <div class="appreciation-wrapper">
                <button class="interaction-btn ${hasReacted ? 'liked' : ''}" onclick="window.handleLikeClick('${post.id}')">
                    <span>${currentReactionEmoji}</span>
                    <span class="likes-count">${reactionLabel}</span>
                </button>
                <div class="reactions-popup">
                    <button class="react-emoji-btn" title="Like" onclick="window.reactToPost('${post.id}', 'like')">👍</button>
                    <button class="react-emoji-btn" title="Love" onclick="window.reactToPost('${post.id}', 'love')">❤️</button>
                    <button class="react-emoji-btn" title="Celebrate" onclick="window.reactToPost('${post.id}', 'celebrate')">👏</button>
                    <button class="react-emoji-btn" title="Insightful" onclick="window.reactToPost('${post.id}', 'insight')">💡</button>
                    <button class="react-emoji-btn" title="Respect" onclick="window.reactToPost('${post.id}', 'respect')">🎓</button>
                </div>
            </div>
        `;

        let commentInputHtml = '';
        if (isOwner) {
            commentInputHtml = `
                <div class="comment-input-area">
                    <input type="text" placeholder="Write a comment..." class="comment-input-box" id="comments-input-${post.id}" onkeydown="handleCommentKeydown(event, '${post.id}')">
                    <button class="comment-submit-btn" onclick="submitComment('${post.id}')">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
            `;
        } else if (allowComments === 'none') {
            commentInputHtml = `
                <div style="padding:12px;text-align:center;color:#ef4444;font-size:0.8rem;background:rgba(239,68,68,0.05);border-radius:8px;border:1px dashed rgba(239,68,68,0.15);margin-top:10px;">
                    <i class="fas fa-comment-slash" style="margin-right:6px;"></i> Commenting is disabled for this post.
                </div>
            `;
        } else if (allowComments === 'faculty' && currentUser.role !== 'Faculty') {
            commentInputHtml = `
                <div style="padding:12px;text-align:center;color:#f58220;font-size:0.8rem;background:rgba(245,130,32,0.05);border-radius:8px;border:1px dashed rgba(245,130,32,0.15);margin-top:10px;">
                    <i class="fas fa-lock" style="margin-right:6px;"></i> Only faculty members can comment on this post.
                </div>
            `;
        } else {
            commentInputHtml = `
                <div class="comment-input-area">
                    <input type="text" placeholder="Write an academic comment..." class="comment-input-box" id="comments-input-${post.id}" onkeydown="handleCommentKeydown(event, '${post.id}')">
                    <button class="comment-submit-btn" onclick="submitComment('${post.id}')">
                        <i class="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
            `;
        }

        const card = document.createElement('div');
        card.className = 'edu-card post';
        card.innerHTML = `
            <div class="post-header">
                <div class="post-user-info">
                    <div class="avatar-small">${avatarWrapper}</div>
                    <div>
                        <div class="post-name">${post.name}</div>
                        <div class="post-meta">${post.date} • <i class="fas fa-eye" style="font-size:0.75rem;margin-left:2px;"></i> ${mockViews} Views</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div class="post-badge">${post.category}</div>
                    ${isOwner ? `<button class="post-action-btn edit" onclick="openEditPost('${post.id}')"><i class="fas fa-edit"></i> Edit</button>
                    <button class="post-action-btn delete" onclick="deletePost('${post.id}')"><i class="fas fa-trash"></i> Delete</button>` : ''}
                </div>
            </div>
            <div class="post-text">${post.text}</div>
            ${mediaHtml}
            ${pollHtml}
            
            ${reactionsDisplayHtml}
            
            <!-- Sleek Interaction Bar -->
            <div class="post-interaction-bar">
                ${appreciationBtnHtml}
                <button class="interaction-btn" onclick="toggleCommentsSection('${post.id}')">
                    <i class="fa-solid fa-comment"></i>
                    <span>${commentsArr.length} Comment${commentsArr.length !== 1 ? 's' : ''}</span>
                </button>
                <button class="interaction-btn ${isBookmarked ? 'bookmarked' : ''}" onclick="window.toggleBookmark('${post.id}')">
                    <i class="${isBookmarked ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
                    <span>${isBookmarked ? 'Saved' : 'Save'}</span>
                </button>
                <button class="interaction-btn" onclick="window.sharePost('${post.id}')">
                    <i class="fa-solid fa-share-nodes"></i>
                    <span>Share</span>
                </button>
            </div>
            
            <!-- Sleek Comments Panel -->
            <div class="post-comments-section" id="comments-sec-${post.id}">
                <div class="comments-list" id="comments-list-${post.id}">
                    ${commentsArr.length === 0 
                        ? `<div class="no-comments-msg" style="text-align:center;padding:10px;color:#9ca3af;font-size:0.8rem;">No comments yet. Start the discussion!</div>`
                        : commentsArr.map(c => `
                            <div class="single-comment">
                                <div class="comment-user-header">
                                    <span>${c.name} <span class="comment-user-role">• ${c.role}</span></span>
                                    <span style="font-weight:400;color:#9ca3af;font-size:0.72rem;">${c.date}</span>
                                </div>
                                <div class="comment-text">${c.text}</div>
                            </div>
                        `).join('')}
                </div>
                ${commentInputHtml}
            </div>
        `;
        listContainer.appendChild(card);
    });
}

window.feedSortOrder = 'latest';
window.changeFeedSort = function(order, view) {
    window.feedSortOrder = order;
    renderPosts(view);
};

// ─── EDIT / DELETE POST ───────────────────────────────────────────────────────
async function openEditPost(postId) {
    const posts = await dbGet('posts');
    const post = posts.find(p => String(p.id) === String(postId));
    if (!post) return;
    document.getElementById('edit-post-id').value = postId;
    document.getElementById('edit-post-text').value = post.text;
    document.getElementById('edit-post-modal').classList.add('active');
}
document.getElementById('close-edit-post').addEventListener('click', () =>
    document.getElementById('edit-post-modal').classList.remove('active'));
document.getElementById('save-edit-post').addEventListener('click', async () => {
    const id = document.getElementById('edit-post-id').value;
    const newText = document.getElementById('edit-post-text').value.trim();
    if (!newText) { showToast('Text cannot be empty.', true); return; }
    try {
        await dbPut(`posts/${id}`, { text: newText, author: currentUser.username });
        document.getElementById('edit-post-modal').classList.remove('active');
        showToast('Post updated!');
        switchView(currentView); updateStats();
    } catch (err) { showToast(err.message, true); }
});
async function deletePost(postId) {
    if (!confirm('Delete this post?')) return;
    await dbDelete(`posts/${postId}`, { author: currentUser.username });
    showToast('Post deleted.');
    switchView(currentView); updateStats();
}

// ─── RENDER SOFTWARE ──────────────────────────────────────────────────────────
async function renderSoftware() {
    const swList = await dbGet('software');
    listContainer.innerHTML = '';
    if (swList.length === 0) {
        listContainer.innerHTML = `<div style="grid-column:1/-1;padding:2rem;text-align:center;color:#6b7280;border:1px dashed #e5e7eb;border-radius:8px;">No software uploaded yet.</div>`;
        return;
    }
    swList.forEach(sw => {
        const hasFile = sw.files && sw.files.length > 0;
        let actionsHtml = '';
        if (sw.link) actionsHtml += `<a href="${sw.link}" target="_blank" class="sw-btn" style="background:#0f4c81;"><i class="fas fa-external-link-alt"></i> Official Link</a>`;
        if (hasFile) actionsHtml += `<button class="sw-btn"><i class="fas fa-download"></i> Download</button>`;
        if (!actionsHtml) actionsHtml = `<button class="sw-btn" disabled style="background:#9ca3af;">No Source</button>`;
        const card = document.createElement('div');
        card.className = 'sw-card';
        card.innerHTML = `
            <div class="sw-header">
                <div class="sw-icon"><i class="fas fa-laptop-code"></i></div>
                <div class="sw-info"><h3>${sw.title}</h3><p>By ${sw.name} • ${sw.date}</p>
                ${hasFile ? `<p style="color:#10b981;font-weight:600;"><i class="fas fa-paperclip"></i> ${sw.files.length} File(s)</p>` : ''}</div>
            </div>
            <div class="sw-desc">${sw.desc}</div>
            <div class="sw-footer">${actionsHtml}</div>`;
        listContainer.appendChild(card);
    });
}

// ─── RENDER DIRECTORY ─────────────────────────────────────────────────────────
async function renderDirectory() {
    const users = await dbGet('users');
    listContainer.innerHTML = '';
    
    // Read active search query
    const searchInput = document.querySelector('.nav-search input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    // Filter users by Active Category Tab, Batch select, and Search query
    const filtered = users.filter(u => {
        // 0. Stealth Filter
        if (u.profileStealth === true && u.username !== currentUser.username && currentUser.role !== 'Faculty') {
            return false;
        }
        
        // 1. Role / Category Tab Filter
        if (activeDirectoryTab === 'BS Statistics' || activeDirectoryTab === 'BS Data Analytics') {
            if (u.role !== 'Student' || u.program !== activeDirectoryTab) return false;
        } else if (activeDirectoryTab === 'Faculty') {
            if (u.role !== 'Faculty') return false;
        }
        
        // 2. Batch Filter
        if (activeDirectoryBatch !== 'All') {
            if (u.role !== 'Student' || u.batch !== activeDirectoryBatch) return false;
        }
        
        // 3. Search Query Filter
        if (query) {
            const nameMatch = u.name && u.name.toLowerCase().includes(query);
            const usernameMatch = u.username && u.username.toLowerCase().includes(query);
            const roleMatch = u.role && u.role.toLowerCase().includes(query);
            const progMatch = u.program && u.program.toLowerCase().includes(query);
            const batchMatch = u.batch && u.batch.toLowerCase().includes(query);
            if (!nameMatch && !usernameMatch && !roleMatch && !progMatch && !batchMatch) return false;
        }
        
        return true;
    });
    
    if (filtered.length === 0) {
        listContainer.innerHTML = `<div class="no-results-msg" style="grid-column:1/-1;padding:2rem;text-align:center;color:#6b7280;border:1px dashed #e5e7eb;border-radius:8px;">No registered members matching these filters.</div>`;
        return;
    }
    
    filtered.forEach(u => {
        // Calculate Active Status
        const isActive = u.lastActive && (new Date() - new Date(u.lastActive)) < (3 * 60 * 1000); // 3 minutes
        let showActiveDot = false;
        if (isActive) {
            const statusPrivacy = u.statusPrivacy || 'everyone';
            if (statusPrivacy === 'everyone' || u.username === currentUser.username || currentUser.role === 'Faculty') {
                showActiveDot = true;
            }
        }
        
        const activeDotHtml = showActiveDot ? `<div class="active-dot-pulse" style="position:absolute; bottom:2px; right:2px; width:14px; height:14px; background-color:#10b981; border-radius:50%; border:2px solid var(--surface-card);"></div>` : '';
        
        const avatarHtml = u.profilePic
            ? `<img src="${u.profilePic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="">`
            : u.name.charAt(0).toUpperCase();
            
        const avatarWrapper = `<div style="position:relative; width:100%; height:100%;">${avatarHtml}${activeDotHtml}</div>`;
            
        // Build badges
        let badgeHtml = '';
        let extraCardClass = '';
        if (u.role === 'Faculty') {
            const desig = u.designation || 'Lecturer';
            badgeHtml = `<span class="badge-faculty"><i class="fas fa-chalkboard-teacher"></i> Faculty</span>`;
            badgeHtml += ` <span class="badge-batch" style="background:#e0f2fe; color:#0369a1; border-color:#bae6fd;"><i class="fas fa-briefcase"></i> ${desig}</span>`;
            if (u.publicationsCount) {
                badgeHtml += ` <span class="badge-batch" style="background:#fef3c7; color:#d97706; border-color:#fde68a;"><i class="fas fa-book-open"></i> ${u.publicationsCount} Papers</span>`;
            }
            extraCardClass = 'faculty-card';
        } else {
            const isAnalytics = u.program === 'BS Data Analytics';
            badgeHtml = `<span class="${isAnalytics ? 'badge-analytics' : 'badge-stat'}"><i class="fas ${isAnalytics ? 'fa-chart-pie' : 'fa-calculator'}"></i> ${u.program || 'BS Statistics'}</span>`;
            if (u.batch) {
                badgeHtml += ` <span class="badge-batch"><i class="fas fa-graduation-cap"></i> ${u.batch}</span>`;
            }
            extraCardClass = isAnalytics ? 'analytics-card' : 'stat-card';
        }
        
        const taglineHtml = u.tagline ? `<div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:8px; font-style:italic;">"${u.tagline}"</div>` : '';

        // Determine phone visibility according to privacy preferences
        let isPhoneVisible = false;
        const phonePrivacy = u.phonePrivacy || (u.phoneVisible === true ? 'everyone' : 'none');
        if (phonePrivacy === 'everyone') {
            isPhoneVisible = true;
        } else if (phonePrivacy === 'faculty' && currentUser.role === 'Faculty') {
            isPhoneVisible = true;
        }
        
        // Strict Private
        if (phonePrivacy === 'none') isPhoneVisible = false;
        if (u.username === currentUser.username) isPhoneVisible = true; // Can always see own phone
        
        const phoneHtml = isPhoneVisible
            ? `<div class="member-phone" style="margin-top:12px; font-size:0.82rem; color:var(--text-secondary); display:flex; align-items:center; justify-content:center; gap:6px; background:rgba(15,76,129,0.03); padding:6px 12px; border-radius:8px; border:1px dashed rgba(15,76,129,0.15);">
                <i class="fas fa-phone-alt" style="color:var(--uog-blue);font-size:0.75rem;"></i>
                <span style="font-weight: 500; font-family: sans-serif;">${u.phone || 'No phone listed'}</span>
               </div>`
            : `<div class="member-phone private" style="margin-top:12px; font-size:0.82rem; color:#9ca3af; display:flex; align-items:center; justify-content:center; gap:6px; background:rgba(0,0,0,0.02); padding:6px 12px; border-radius:8px; border:1px dashed rgba(0,0,0,0.06); font-style:italic;">
                <i class="fas fa-eye-slash" style="font-size:0.75rem;"></i>
                <span style="font-weight: 400;">Phone Private</span>
               </div>`;

        let analyticsPrivateHtml = '';
        let canViewAnalytics = false;
        if (u.role === 'Faculty') {
            canViewAnalytics = u.showIndividualGraphs !== false || u.username === currentUser.username;
            if (!canViewAnalytics) {
                analyticsPrivateHtml = `<div style="margin-top:12px; width:100%; padding:8px; border-radius:8px; background:rgba(0,0,0,0.03); color:#9ca3af; border:1px dashed rgba(0,0,0,0.1); font-size:0.85rem; display:flex; align-items:center; justify-content:center; gap:6px;"><i class="fas fa-lock"></i> Analytics Private</div>`;
            }
        }

        const card = document.createElement('div');
        card.className = `student-card ${extraCardClass}`;
        card.innerHTML = `
            <div class="avatar-large" style="margin:0 auto 1rem;">${avatarWrapper}</div>
            <h3 style="margin-bottom: 4px;">${u.name}</h3>
            ${taglineHtml}
            <div style="margin-bottom: 8px;">${badgeHtml}</div>
            <span style="font-size:0.8rem;background:rgba(15,76,129,0.05);color:var(--uog-blue);padding:4px 10px;border-radius:20px;border:1px solid rgba(15,76,129,0.1);font-family:monospace;font-weight:600;">${u.username}</span>
            ${phoneHtml}
            ${analyticsPrivateHtml}
        `;
        
        if (canViewAnalytics) {
            card.style.cursor = 'pointer';
            card.title = 'Click to view analytics portfolio';
            card.onclick = () => window.openFacultyAnalytics(u.username);
            
            // Add a subtle hover effect hint
            card.classList.add('faculty-interactive-card');
        }
        listContainer.appendChild(card);
    });
}

// ─── COMPOSE MODAL ────────────────────────────────────────────────────────────
const composeModal       = document.getElementById('compose-modal');
const uploadForm         = document.getElementById('upload-form');
const postCategory       = document.getElementById('post-category');
const softwareTitleInput = document.getElementById('software-title');
const softwareLinkInput  = document.getElementById('software-link');
const fileUpload         = document.getElementById('file-upload');
const previewArea        = document.getElementById('preview-area');

['open-compose','open-compose-text'].forEach(id => document.getElementById(id).addEventListener('click', () => { resetCompose('Feed'); composeModal.classList.add('active'); }));
document.getElementById('open-compose-doc').addEventListener('click', () => { resetCompose('Records'); composeModal.classList.add('active'); });
document.getElementById('open-compose-sw').addEventListener('click',  () => { resetCompose('Software'); composeModal.classList.add('active'); });
document.getElementById('close-compose').addEventListener('click', () => { composeModal.classList.remove('active'); resetCompose('Feed'); });
postCategory.addEventListener('change', toggleSoftwareFields);

// Poll Composer Event Handlers
document.getElementById('poll-compose-trigger').addEventListener('click', () => {
    document.getElementById('poll-builder-ui').style.display = 'block';
    document.getElementById('poll-compose-trigger').style.display = 'none';
});

document.getElementById('remove-poll').addEventListener('click', () => {
    document.getElementById('poll-builder-ui').style.display = 'none';
    document.getElementById('poll-compose-trigger').style.display = 'block';
    document.getElementById('poll-question').value = '';
    const container = document.getElementById('poll-options-container');
    container.innerHTML = `
        <div class="poll-builder-option-row">
            <input type="text" class="edu-input poll-option-input" placeholder="Option 1">
        </div>
        <div class="poll-builder-option-row">
            <input type="text" class="edu-input poll-option-input" placeholder="Option 2">
        </div>
    `;
});

document.getElementById('add-poll-option').addEventListener('click', () => {
    const container = document.getElementById('poll-options-container');
    const existingCount = container.querySelectorAll('.poll-builder-option-row').length;
    if (existingCount >= 5) {
        showToast('Maximum of 5 poll options allowed.', true);
        return;
    }
    const row = document.createElement('div');
    row.className = 'poll-builder-option-row';
    row.innerHTML = `<input type="text" class="edu-input poll-option-input" placeholder="Option ${existingCount + 1}">`;
    container.appendChild(row);
});


function resetCompose(cat) {
    uploadForm.reset(); previewArea.innerHTML = ''; uploadedFiles = [];
    postCategory.value = cat || 'Feed'; toggleSoftwareFields();
    
    // Reset and hide poll builder
    const pollBuilder = document.getElementById('poll-builder-ui');
    if (pollBuilder) {
        pollBuilder.style.display = 'none';
        document.getElementById('poll-question').value = '';
        document.getElementById('poll-options-container').innerHTML = `
            <div class="poll-builder-option-row">
                <input type="text" class="edu-input poll-option-input" placeholder="Option 1">
            </div>
            <div class="poll-builder-option-row">
                <input type="text" class="edu-input poll-option-input" placeholder="Option 2">
            </div>
        `;
    }
    const trigger = document.getElementById('poll-compose-trigger');
    if (trigger) trigger.style.display = 'block';
}
function toggleSoftwareFields() {
    const isSW = postCategory.value === 'Software';
    softwareTitleInput.style.display = isSW ? 'block' : 'none';
    softwareLinkInput.style.display  = isSW ? 'block' : 'none';
    isSW ? softwareTitleInput.setAttribute('required','true') : softwareTitleInput.removeAttribute('required');
    
    const isRecord = postCategory.value === 'Records';
    const recordTargeting = document.getElementById('record-targeting-container');
    if (recordTargeting) {
        recordTargeting.style.display = isRecord ? 'block' : 'none';
    }
}

fileUpload.addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(file => {
        if (file.type.startsWith('image/') && file.size < 2000000) {
            const reader = new FileReader();
            reader.onload = ev => {
                uploadedFiles.push({ type: 'image', data: ev.target.result, name: file.name });
                previewArea.innerHTML += `<div class="preview-item"><img src="${ev.target.result}" style="height:40px;border-radius:4px;"> ${file.name.substring(0,12)}</div>`;
            };
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('video/')) {
            uploadedFiles.push({ type: 'video', data: '', name: file.name });
            previewArea.innerHTML += `<div class="preview-item"><i class="fas fa-file-video" style="color:#ef4444;"></i> ${file.name}</div>`;
        } else if (['.exe','.zip','.rar'].some(x => file.name.endsWith(x))) {
            uploadedFiles.push({ type: 'software', data: '', name: file.name });
            previewArea.innerHTML += `<div class="preview-item"><i class="fas fa-box-open" style="color:#f58220;"></i> ${file.name}</div>`;
        } else {
            uploadedFiles.push({ type: 'document', data: '', name: file.name });
            previewArea.innerHTML += `<div class="preview-item"><i class="fas fa-file-pdf" style="color:#3b82f6;"></i> ${file.name}</div>`;
        }
    });
});

uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = document.getElementById('upload-desc').value.trim();
    const category = postCategory.value;
    const btn = e.target.querySelector('button[type=submit]');
    btn.textContent = 'Publishing...'; btn.disabled = true;
    try {
        if (category === 'Software') {
            await dbPost('software', { author: currentUser.username, name: currentUser.name, title: softwareTitleInput.value, desc: text, link: softwareLinkInput.value, files: [...uploadedFiles] });
            showToast('Software added!');
            document.querySelector('.sidebar-list li[data-target="software"]').click();
        } else {
            const catText = category === 'Feed' ? 'General Update / Notice' : 'Academic Record / Media Files';
            
            // Check Anonymous Privacy Setting
            const isAnon = currentUser.anonymousMode === true;
            const postAuthor = isAnon ? 'anonymous_ghost' : currentUser.username;
            const postName = isAnon ? 'Anonymous Member' : currentUser.name;
            const postRole = isAnon ? 'Hidden' : currentUser.role;
            const visibility = document.getElementById('post-visibility') ? document.getElementById('post-visibility').value : 'everyone';
            
            // Extract Poll details if built
            let poll = null;
            const pollBuilder = document.getElementById('poll-builder-ui');
            if (pollBuilder && pollBuilder.style.display !== 'none') {
                const question = document.getElementById('poll-question').value.trim();
                const optionInputs = Array.from(document.querySelectorAll('.poll-option-input'));
                const options = optionInputs
                    .map(inp => inp.value.trim())
                    .filter(val => val !== '')
                    .map(val => ({ text: val, votes: [] }));
                
                if (question && options.length >= 2) {
                    poll = { question, options };
                } else if (question || optionInputs.some(inp => inp.value.trim() !== '')) {
                    showToast('A poll must have a question and at least 2 non-empty options.', true);
                    btn.textContent = 'Publish Update'; btn.disabled = false;
                    return;
                }
            }
            
            const targetProgram = category === 'Records' ? document.getElementById('target-program').value : 'all';
            const targetBatch = category === 'Records' ? document.getElementById('target-batch').value : 'all';
            const targetSemester = category === 'Records' ? document.getElementById('target-semester').value : 'all';

            await dbPost('posts', {
                author: postAuthor,
                name: postName,
                role: postRole,
                category: catText,
                text,
                files: [...uploadedFiles],
                originalAuthor: currentUser.username,
                authorBatch: currentUser.batch,
                visibility,
                poll,
                targetProgram,
                targetBatch,
                targetSemester
            });
            showToast(isAnon ? 'Anonymous update shared securely!' : 'Update shared!');
            document.querySelector(`.sidebar-list li[data-target="${category === 'Feed' ? 'feed' : 'records'}"]`).click();
        }
        composeModal.classList.remove('active');
        resetCompose('Feed');
        updateStats();
    } catch (err) { showToast(err.message, true); }
    finally { btn.textContent = 'Publish Update'; btn.disabled = false; }
});

// ─── GLOBAL SOCIAL TRIGGERS ──────────────────────────────────────────────────

window.handleLikeClick = async function(postId) {
    // Treat classic click as toggling 'like' reaction
    await window.reactToPost(postId, 'like');
};

window.reactToPost = async function(postId, reactionType) {
    try {
        const data = await dbPost(`posts/${postId}/react`, { username: currentUser.username, reactionType });
        // Refresh active view to show updated reaction counts smoothly
        switchView(currentView);
        updateStats();
    } catch (err) {
        showToast('Could not save reaction: ' + err.message, true);
    }
};

// ─── SOCIAL STORIES & POLLS LOGIC ───────────────────────────────────────────

function getStories() {
    return activeStories || [];
}

window.addUserStory = async function() {
    if (!currentUser) return;
    const txt = prompt("What is your academic status or story for today? (Max 60 chars):");
    if (txt === null) return;
    const cleanTxt = txt.trim();
    if (!cleanTxt) {
        showToast("Status cannot be empty.", true);
        return;
    }
    if (cleanTxt.length > 60) {
        showToast("Status must be 60 characters or less.", true);
        return;
    }
    
    try {
        await dbPost('stories', {
            id: 'user-' + Date.now(),
            username: currentUser.username,
            name: currentUser.name,
            profilePic: currentUser.profilePic || '',
            text: cleanTxt,
            timestamp: Date.now()
        });
        
        logSecurityEvent('Add Story', `Updated personal academic status to: "${cleanTxt}"`, 'success');
        showToast("Academic status updated!");
        
        if (currentView === 'feed') {
            await renderPosts('feed');
        }
    } catch (err) {
        showToast("Could not update status: " + err.message, true);
    }
};

let storyTimeout = null;
let storyProgressInterval = null;

window.viewStory = function(storyId) {
    const stories = getStories();
    const story = stories.find(s => String(s.id) === String(storyId));
    if (!story) return;
    
    const modal = document.getElementById('story-viewer-modal');
    if (!modal) return;
    
    // Set content
    const avatarContainer = document.getElementById('story-avatar');
    const nameEl = document.getElementById('story-username');
    const timeEl = document.getElementById('story-time');
    const textEl = document.getElementById('story-text-content'); // matches index.html: id="story-text-content"
    const progressFill = document.getElementById('story-progress-fill');
    
    renderAvatar(avatarContainer, { name: story.name, profilePic: story.profilePic });
    nameEl.textContent = story.name;
    
    // Relative time formatting
    const diffMin = Math.round((Date.now() - story.timestamp) / 60000);
    let timeText = 'Just now';
    if (diffMin >= 60) {
        const hrs = Math.round(diffMin / 60);
        timeText = `${hrs} hr${hrs !== 1 ? 's' : ''} ago`;
    } else if (diffMin > 0) {
        timeText = `${diffMin} min${diffMin !== 1 ? 's' : ''} ago`;
    }
    timeEl.textContent = timeText;
    textEl.textContent = story.text;
    
    // Show modal
    modal.classList.add('active');
    
    // Progress bar animation
    if (storyTimeout) clearTimeout(storyTimeout);
    if (storyProgressInterval) clearInterval(storyProgressInterval);
    
    let progress = 0;
    progressFill.style.width = '0%';
    
    const duration = 4000; // 4 seconds
    const interval = 40; // update every 40ms
    const step = (interval / duration) * 100;
    
    storyProgressInterval = setInterval(() => {
        progress += step;
        if (progress >= 100) {
            progress = 100;
            clearInterval(storyProgressInterval);
        }
        progressFill.style.width = progress + '%';
    }, interval);
    
    storyTimeout = setTimeout(() => {
        window.closeStoryViewer();
    }, duration);
};

window.closeStoryViewer = function() {
    const modal = document.getElementById('story-viewer-modal');
    if (modal) modal.classList.remove('active');
    if (storyTimeout) clearTimeout(storyTimeout);
    if (storyProgressInterval) clearInterval(storyProgressInterval);
};

function renderStatusStories(container) {
    if (!container) return;
    const stories = getStories();
    const myStory = stories.find(s => s.username === currentUser.username);
    
    const storiesWrapper = document.createElement('div');
    storiesWrapper.className = 'status-stories-container';
    
    // Render My Story bubble
    const myBubble = document.createElement('div');
    myBubble.className = `status-bubble ${myStory ? 'active-story' : ''}`;
    myBubble.onclick = myStory ? () => window.viewStory(myStory.id) : () => window.addUserStory();
    
    const myAvatarHtml = currentUser.profilePic 
        ? `<img src="${currentUser.profilePic}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` 
        : `<span>${currentUser.name.charAt(0).toUpperCase()}</span>`;
        
    myBubble.innerHTML = `
        <div class="status-avatar-ring">
            <div class="status-avatar" style="display: flex; align-items: center; justify-content: center; background: var(--bg-surface); font-weight: bold; color: var(--text-primary);">
                ${myAvatarHtml}
            </div>
            ${!myStory ? '<div class="status-add-btn"><i class="fas fa-plus"></i></div>' : ''}
        </div>
        <span class="status-label">My Status</span>
    `;
    storiesWrapper.appendChild(myBubble);
    
    // Render other user stories
    stories.forEach(story => {
        if (story.username === currentUser.username) return; // skip self since rendered first
        
        const bubble = document.createElement('div');
        bubble.className = 'status-bubble active-story';
        bubble.onclick = () => window.viewStory(story.id);
        
        const avatarHtml = story.profilePic 
            ? `<img src="${story.profilePic}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` 
            : `<span>${story.name.charAt(0).toUpperCase()}</span>`;
            
        bubble.innerHTML = `
            <div class="status-avatar-ring">
                <div class="status-avatar" style="display: flex; align-items: center; justify-content: center; background: var(--bg-surface); font-weight: bold; color: var(--uog-blue);">
                    ${avatarHtml}
                </div>
            </div>
            <span class="status-label">${story.name.split(' ')[0]}</span>
        `;
        storiesWrapper.appendChild(bubble);
    });
    
    container.appendChild(storiesWrapper);
}

window.castPollVote = async function(postId, optionIndex) {
    try {
        await dbPost(`posts/${postId}/vote`, { optionIndex, username: currentUser.username });
        showToast('Vote cast successfully!');
        switchView(currentView);
    } catch (err) {
        showToast('Could not record vote: ' + err.message, true);
    }
};

window.updateSidebarBadges = async function() {
    try {
        const [posts, sw] = await Promise.all([dbGet('posts'), dbGet('software')]);
        const savedCount = getBookmarks().length;
        const swCount = sw.length;
        const recordCount = posts.filter(p => p.category && p.category.includes('Record')).length;
        
        const badgeRecords = document.getElementById('badge-records');
        const badgeSoftware = document.getElementById('badge-software');
        const badgeSaved = document.getElementById('badge-saved');
        
        const setBadge = (el, val) => {
            if (!el) return;
            const prev = parseInt(el.textContent) || 0;
            if (prev !== val) {
                el.textContent = val;
                el.classList.remove('pulse-badge');
                void el.offsetWidth; // Trigger reflow to restart animation
                el.classList.add('pulse-badge');
            }
        };
        
        setBadge(badgeRecords, recordCount);
        setBadge(badgeSoftware, swCount);
        setBadge(badgeSaved, savedCount);
    } catch (err) {
        console.error('Error updating sidebar badges:', err);
    }
};

window.toggleCommentsSection = function(postId) {
    const sec = document.getElementById(`comments-sec-${postId}`);
    if (sec) {
        sec.classList.toggle('active');
    }
};

window.handleCommentKeydown = function(event, postId) {
    if (event.key === 'Enter') {
        submitComment(postId);
    }
};

window.submitComment = async function(postId) {
    const input = document.getElementById(`comments-input-${postId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    
    try {
        // Retrieve post and check commenting permissions first
        const posts = await dbGet('posts');
        const post = posts.find(p => String(p.id) === String(postId));
        if (post) {
            const users = await dbGet('users');
            const postUser = users.find(u => u.username === post.author);
            const allowComments = postUser && postUser.allowComments ? postUser.allowComments : 'everyone';
            
            if (allowComments === 'none') {
                showToast('Commenting is disabled for this post.', true);
                return;
            } else if (allowComments === 'faculty' && currentUser.role !== 'Faculty') {
                showToast('Only faculty members can comment on this post.', true);
                return;
            }
        }

        input.disabled = true;
        const comments = await dbPost(`posts/${postId}/comment`, {
            author: currentUser.username,
            name: currentUser.name,
            role: currentUser.role,
            text: text
        });
        input.value = '';
        
        // Dynamically re-render comments smoothly for instant feedback
        const list = document.getElementById(`comments-list-${postId}`);
        if (list) {
            list.innerHTML = comments.map(c => `
                <div class="single-comment">
                    <div class="comment-user-header">
                        <span>${c.name} <span class="comment-user-role">• ${c.role}</span></span>
                        <span style="font-weight:400;color:#9ca3af;font-size:0.72rem;">${c.date}</span>
                    </div>
                    <div class="comment-text">${c.text}</div>
                </div>
            `).join('');
            // Scroll to bottom of comments list
            list.scrollTop = list.scrollHeight;
        }
        showToast('Comment published!');
        // Also refresh the counts silently
        updateStats();
    } catch (err) {
        showToast('Could not post comment.', true);
    } finally {
        input.disabled = false;
        input.focus();
    }
};

// ─── INTERACTIVE REAL-TIME SEARCH ────────────────────────────────────────────
const searchInput = document.querySelector('.nav-search input');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        
        if (currentView === 'feed' || currentView === 'records') {
            const cards = listContainer.querySelectorAll('.edu-card.post');
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(query) ? 'block' : 'none';
            });
            // If all cards are hidden, show a nice empty state
            const visibleCards = Array.from(cards).filter(c => c.style.display !== 'none');
            let noResultMsg = listContainer.querySelector('.no-results-msg');
            if (visibleCards.length === 0 && cards.length > 0) {
                if (!noResultMsg) {
                    noResultMsg = document.createElement('div');
                    noResultMsg.className = 'no-results-msg';
                    noResultMsg.style.cssText = 'padding:2rem;text-align:center;color:#6b7280;border:1px dashed #e5e7eb;border-radius:8px;grid-column:1/-1;';
                    noResultMsg.textContent = 'No matching items found.';
                    listContainer.appendChild(noResultMsg);
                }
            } else if (noResultMsg) {
                noResultMsg.remove();
            }
        } else if (currentView === 'software') {
            const cards = listContainer.querySelectorAll('.sw-card');
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(query) ? 'flex' : 'none';
            });
            const visibleCards = Array.from(cards).filter(c => c.style.display !== 'none');
            let noResultMsg = listContainer.querySelector('.no-results-msg');
            if (visibleCards.length === 0 && cards.length > 0) {
                if (!noResultMsg) {
                    noResultMsg = document.createElement('div');
                    noResultMsg.className = 'no-results-msg';
                    noResultMsg.style.cssText = 'padding:2rem;text-align:center;color:#6b7280;border:1px dashed #e5e7eb;border-radius:8px;grid-column:1/-1;';
                    noResultMsg.textContent = 'No matching software found.';
                    listContainer.appendChild(noResultMsg);
                }
            } else if (noResultMsg) {
                noResultMsg.remove();
            }
        } else if (currentView === 'students') {
            // Live DOM filtering is fine for typing, but let's make sure it matches the elements perfectly
            const cards = listContainer.querySelectorAll('.student-card');
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(query) ? 'block' : 'none';
            });
            const visibleCards = Array.from(cards).filter(c => c.style.display !== 'none');
            let noResultMsg = listContainer.querySelector('.no-results-msg');
            if (visibleCards.length === 0 && cards.length > 0) {
                if (!noResultMsg) {
                    noResultMsg = document.createElement('div');
                    noResultMsg.className = 'no-results-msg';
                    noResultMsg.style.cssText = 'padding:2rem;text-align:center;color:#6b7280;border:1px dashed #e5e7eb;border-radius:8px;grid-column:1/-1;';
                    noResultMsg.textContent = 'No matching members found.';
                    listContainer.appendChild(noResultMsg);
                }
            } else if (noResultMsg) {
                noResultMsg.remove();
            }
        }
    });
}

// ─── BATCHES MANAGEMENT AND SELECT INITIALIZATION ────────────────────────────
async function loadBatches() {
    try {
        allBatches = await dbGet('batches');
        populateBatchDropdowns(allBatches);
    } catch (err) {
        console.error('Error loading batches:', err);
    }
}

function populateBatchDropdowns(batches) {
    const regBatch = document.getElementById('reg-batch');
    const editBatch = document.getElementById('edit-batch');
    const dirBatchSelect = document.getElementById('dir-batch-select');
    const targetBatch = document.getElementById('target-batch');
    
    if (regBatch) {
        const val = regBatch.value;
        regBatch.innerHTML = '<option value="" disabled selected>Select Batch...</option>' + 
            batches.map(b => `<option value="${b.name}">${b.name}</option>`).join('');
        if (val) regBatch.value = val;
    }
    if (editBatch) {
        const val = editBatch.value;
        editBatch.innerHTML = '<option value="" disabled>Select Batch...</option>' + 
            batches.map(b => `<option value="${b.name}">${b.name}</option>`).join('');
        if (val) editBatch.value = val;
    }
    if (dirBatchSelect) {
        const val = dirBatchSelect.value || 'All';
        dirBatchSelect.innerHTML = '<option value="All">All Sessions</option>' + 
            batches.map(b => `<option value="${b.name}">Session ${b.name}</option>`).join('');
        dirBatchSelect.value = val;
    }
    if (targetBatch) {
        const val = targetBatch.value || 'all';
        targetBatch.innerHTML = '<option value="all">All Batches</option>' + 
            batches.map(b => `<option value="${b.name}">${b.name}</option>`).join('');
        targetBatch.value = val;
    }
}

window.triggerAddBatch = function() {
    const modal = document.getElementById('batch-modal');
    if (modal) {
        modal.classList.add('active');
        const input = document.getElementById('new-batch-name');
        if (input) {
            input.value = '';
            input.focus();
        }
    }
};

window.closeBatchModal = function() {
    const modal = document.getElementById('batch-modal');
    if (modal) modal.classList.remove('active');
};

window.submitNewBatch = async function(event) {
    event.preventDefault();
    const input = document.getElementById('new-batch-name');
    if (!input) return;
    const value = input.value.trim();
    if (!value) return;
    
    if (!/^\d{4}-\d{4}$/.test(value)) {
        showToast('Batch must be in YYYY-YYYY format (e.g. 2024-2028).', true);
        return;
    }
    
    try {
        const updatedBatches = await dbPost('batches', { name: value });
        allBatches = updatedBatches;
        populateBatchDropdowns(allBatches);
        
        // Auto-select in signup/profile-edit if active
        const regBatch = document.getElementById('reg-batch');
        if (regBatch && regStudentFields && regStudentFields.style.display !== 'none') {
            regBatch.value = value;
        }
        
        const editBatch = document.getElementById('edit-batch');
        const editStudentFields = document.getElementById('edit-student-fields');
        if (editBatch && editStudentFields && editStudentFields.style.display !== 'none') {
            editBatch.value = value;
        }
        
        const dirBatchSelect = document.getElementById('dir-batch-select');
        if (dirBatchSelect) {
            dirBatchSelect.value = value;
            activeDirectoryBatch = value;
            if (currentView === 'students') {
                renderDirectory();
            }
        }
        
        showToast(`Batch ${value} added successfully!`);
        closeBatchModal();
    } catch (err) {
        showToast(err.message || 'Error adding batch.', true);
    }
};

function initDirectoryFilters() {
    const tabs = document.querySelectorAll('.dir-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeDirectoryTab = tab.getAttribute('data-tab');
            renderDirectory();
        });
    });
    
    const select = document.getElementById('dir-batch-select');
    if (select) {
        select.addEventListener('change', (e) => {
            activeDirectoryBatch = e.target.value;
            renderDirectory();
        });
    }
}

// Bootstrapping at load time
loadBatches();
initDirectoryFilters();

// ─── PRIVACY DASHBOARD & SOCIAL INTEGRATION HELPERS ───────────────────────────
function getBookmarks() {
    if (!currentUser) return [];
    return JSON.parse(localStorage.getItem(`uog_bookmarks_${currentUser.username}`) || '[]');
}
function saveBookmarks(bookmarks) {
    if (!currentUser) return;
    localStorage.setItem(`uog_bookmarks_${currentUser.username}`, JSON.stringify(bookmarks));
}

window.renderPrivacyDashboard = function() {
    listContainer.innerHTML = '';
    
    // Fallbacks and variable setups
    let phonePrivacy = currentUser.phonePrivacy;
    if (!phonePrivacy) {
        phonePrivacy = currentUser.phoneVisible === true ? 'everyone' : 'none';
    }
    const profileStealth = currentUser.profileStealth === true;
    const statusPrivacy = currentUser.statusPrivacy || 'everyone';
    
    const allowComments = currentUser.allowComments || 'everyone';
    const allowDownloads = currentUser.allowDownloads !== false; // default true
    const showAppreciations = currentUser.showAppreciations !== false; // default true
    
    const dash = document.createElement('div');
    dash.className = 'privacy-dashboard';
    dash.innerHTML = `
        <!-- Card 1: Phone Visibility -->
        <div class="privacy-card">
            <div class="privacy-header">
                <div class="privacy-icon uog-blue-text"><i class="fas fa-phone-alt"></i></div>
                <div>
                    <h3>Directory Phone Visibility</h3>
                    <p>Control who can view your phone number in the Alumni & Student Directory. Faculty members can always view contact details.</p>
                </div>
            </div>
            <div class="privacy-control" style="flex-direction: column; align-items: stretch; gap: 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; width: 100%;">
                    <span>Who can see your phone number</span>
                    <select class="edu-select" style="width: auto; margin-bottom: 0; padding: 6px 12px;" onchange="window.updatePrivacySetting('phonePrivacy', this.value)">
                        <option value="everyone" ${phonePrivacy === 'everyone' ? 'selected' : ''}>Everyone</option>
                        <option value="faculty" ${phonePrivacy === 'faculty' ? 'selected' : ''}>Faculty Only</option>
                        <option value="none" ${phonePrivacy === 'none' ? 'selected' : ''}>Only Me (Private)</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Card: Directory Stealth Mode -->
        <div class="privacy-card">
            <div class="privacy-header">
                <div class="privacy-icon uog-blue-text" style="color: #6366f1;"><i class="fas fa-user-ninja"></i></div>
                <div>
                    <h3>Profile Stealth Mode</h3>
                    <p>Hide your profile completely from the directory for general students. Faculty and yourself can still see it.</p>
                </div>
            </div>
            <div class="privacy-control toggle-control">
                <span>Enable Directory Stealth Mode</span>
                <label class="switch">
                    <input type="checkbox" ${profileStealth ? 'checked' : ''} onchange="window.updatePrivacySetting('profileStealth', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <!-- Card: Faculty Individual Analytics Visibility -->
        ${currentUser.role === 'Faculty' ? `
        <div class="privacy-card">
            <div class="privacy-header">
                <div class="privacy-icon uog-orange-text"><i class="fas fa-chart-pie"></i></div>
                <div>
                    <h3>Public Individual Analytics</h3>
                    <p>Show your individual performance graphs (Publications, Rank, vs Department) on your profile card in the Directory.</p>
                </div>
            </div>
            <div class="privacy-control toggle-control">
                <span>Display Analytics Publicly</span>
                <label class="switch">
                    <input type="checkbox" ${currentUser.showIndividualGraphs !== false ? 'checked' : ''} onchange="window.updatePrivacySetting('showIndividualGraphs', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>
        ` : ''}

        <!-- Card: Active Status Visibility -->
        <div class="privacy-card">
            <div class="privacy-header">
                <div class="privacy-icon" style="color: #10b981;"><i class="fas fa-circle"></i></div>
                <div>
                    <h3>Active Status</h3>
                    <p>Show a pulsing green dot when you are online. Choose who can see your active status.</p>
                </div>
            </div>
            <div class="privacy-control" style="flex-direction: column; align-items: stretch; gap: 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; width: 100%;">
                    <span>Who can see your online status</span>
                    <select class="edu-select" style="width: auto; margin-bottom: 0; padding: 6px 12px;" onchange="window.updatePrivacySetting('statusPrivacy', this.value)">
                        <option value="everyone" ${statusPrivacy === 'everyone' ? 'selected' : ''}>Everyone</option>
                        <option value="none" ${statusPrivacy === 'none' ? 'selected' : ''}>Hide from all</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Card 2: Commenting Privacy -->
        <div class="privacy-card">
            <div class="privacy-header">
                <div class="privacy-icon uog-orange-text"><i class="fas fa-comments"></i></div>
                <div>
                    <h3>Post Commenting Policy</h3>
                    <p>Select who is authorized to comment on the updates, files, and academic resources you upload to the department feed.</p>
                </div>
            </div>
            <div class="privacy-control" style="flex-direction: column; align-items: stretch; gap: 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; width: 100%;">
                    <span>Who can comment on your posts</span>
                    <select id="privacy-comments-select" class="edu-select" style="width: auto; margin-bottom: 0; padding: 6px 12px;" onchange="window.updatePrivacySetting('allowComments', this.value)">
                        <option value="everyone" ${allowComments === 'everyone' ? 'selected' : ''}>Everyone (All Members)</option>
                        <option value="faculty" ${allowComments === 'faculty' ? 'selected' : ''}>Only Faculty Members</option>
                        <option value="none" ${allowComments === 'none' ? 'selected' : ''}>Disable Commenting Completely</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Card 3: File View & Download Locks -->
        <div class="privacy-card">
            <div class="privacy-header">
                <div class="privacy-icon blue-text"><i class="fas fa-file-download"></i></div>
                <div>
                    <h3>Attachment Protection</h3>
                    <p>Restrict downloading and viewing of documents, figures, slides, and videos attached to your posts. When enabled, non-authors will see a lock state and cannot access attachment files.</p>
                </div>
            </div>
            <div class="privacy-control toggle-control">
                <span>Allow others to view/download attachments</span>
                <label class="switch">
                    <input type="checkbox" id="privacy-downloads-toggle" ${allowDownloads ? 'checked' : ''} onchange="window.updatePrivacySetting('allowDownloads', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <!-- Card 4: Appreciation Visibility -->
        <div class="privacy-card">
            <div class="privacy-header">
                <div class="privacy-icon purple-text"><i class="fas fa-thumbs-up"></i></div>
                <div>
                    <h3>Appreciations Visibility</h3>
                    <p>Choose whether to show the total number of likes (appreciations) your posts receive. When turned off, others will see "Appreciations Private", but you can still view your post stats.</p>
                </div>
            </div>
            <div class="privacy-control toggle-control">
                <span>Show total appreciation count to others</span>
                <label class="switch">
                    <input type="checkbox" id="privacy-likes-toggle" ${showAppreciations ? 'checked' : ''} onchange="window.updatePrivacySetting('showAppreciations', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <!-- Card 2: Commenting Privacy -->
        <div class="privacy-card">
            <div class="privacy-header">
                <div class="privacy-icon uog-orange-text"><i class="fas fa-comments"></i></div>
                <div>
                    <h3>Post Commenting Policy</h3>
                    <p>Select who is authorized to comment on the updates, files, and academic resources you upload to the department feed.</p>
                </div>
            </div>
            <div class="privacy-control" style="flex-direction: column; align-items: stretch; gap: 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; width: 100%;">
                    <span>Who can comment on your posts</span>
                    <select id="privacy-comments-select" class="edu-select" style="width: auto; margin-bottom: 0; padding: 6px 12px;" onchange="window.updatePrivacySetting('allowComments', this.value)">
                        <option value="everyone" ${allowComments === 'everyone' ? 'selected' : ''}>Everyone (All Members)</option>
                        <option value="faculty" ${allowComments === 'faculty' ? 'selected' : ''}>Only Faculty Members</option>
                        <option value="none" ${allowComments === 'none' ? 'selected' : ''}>Disable Commenting Completely</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Card 3: File View & Download Locks -->
        <div class="privacy-card">
            <div class="privacy-header">
                <div class="privacy-icon blue-text"><i class="fas fa-file-download"></i></div>
                <div>
                    <h3>Attachment Protection</h3>
                    <p>Restrict downloading and viewing of documents, figures, slides, and videos attached to your posts. When enabled, non-authors will see a lock state and cannot access attachment files.</p>
                </div>
            </div>
            <div class="privacy-control toggle-control">
                <span>Allow others to view/download attachments</span>
                <label class="switch">
                    <input type="checkbox" id="privacy-downloads-toggle" ${allowDownloads ? 'checked' : ''} onchange="window.updatePrivacySetting('allowDownloads', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <!-- Card 4: Appreciation Visibility -->
        <div class="privacy-card">
            <div class="privacy-header">
                <div class="privacy-icon purple-text"><i class="fas fa-thumbs-up"></i></div>
                <div>
                    <h3>Appreciations Visibility</h3>
                    <p>Choose whether to show the total number of likes (appreciations) your posts receive. When turned off, others will see "Appreciations Private", but you can still view your post stats.</p>
                </div>
            </div>
            <div class="privacy-control toggle-control">
                <span>Show total appreciation count to others</span>
                <label class="switch">
                    <input type="checkbox" id="privacy-likes-toggle" ${showAppreciations ? 'checked' : ''} onchange="window.updatePrivacySetting('showAppreciations', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <!-- Card 5: Anonymous Posting -->
        <div class="privacy-card" style="border-color: rgba(15, 76, 129, 0.4); background: linear-gradient(to right, rgba(15, 76, 129, 0.02), rgba(255,255,255,0.8));">
            <div class="privacy-header">
                <div class="privacy-icon" style="color: #374151; background: #e5e7eb;"><i class="fas fa-user-secret"></i></div>
                <div>
                    <h3 style="color: #374151;">Anonymous Posting Mode</h3>
                    <p>Mask your identity when posting to the department feed. Your name, picture, and profile will be hidden from everyone, and your posts will appear as "Anonymous Member".</p>
                </div>
            </div>
            <div class="privacy-control toggle-control">
                <span>Enable Anonymous Identity</span>
                <label class="switch">
                    <input type="checkbox" ${currentUser.anonymousMode ? 'checked' : ''} onchange="window.updatePrivacySetting('anonymousMode', this.checked)">
                    <span class="slider" style="background-color: ${currentUser.anonymousMode ? '#374151' : '#cbd5e1'};"></span>
                </label>
            </div>
        </div>

        <!-- Card 6: Incognito Browsing -->
        <div class="privacy-card" style="border-color: rgba(139, 92, 246, 0.3);">
            <div class="privacy-header">
                <div class="privacy-icon" style="color: #8b5cf6; background: rgba(139, 92, 246, 0.1);"><i class="fas fa-eye-slash"></i></div>
                <div>
                    <h3 style="color: #8b5cf6;">Incognito Browsing</h3>
                    <p>Pause your activity tracking. Your active status, read receipts, profile views, and general interactions will not be recorded or shown to others.</p>
                </div>
            </div>
            <div class="privacy-control toggle-control">
                <span>Enable Incognito Mode</span>
                <label class="switch">
                    <input type="checkbox" ${currentUser.incognitoMode ? 'checked' : ''} onchange="window.updatePrivacySetting('incognitoMode', this.checked)">
                    <span class="slider" style="background-color: ${currentUser.incognitoMode ? '#8b5cf6' : '#cbd5e1'};"></span>
                </label>
            </div>
        </div>

        <!-- Card 7: Inactivity Auto Logout -->
        <div class="privacy-card">
            <div class="privacy-header">
                <div class="privacy-icon" style="color: #ef4444; background: rgba(239, 68, 68, 0.1);"><i class="fas fa-history"></i></div>
                <div>
                    <h3>Inactivity Auto-Logout</h3>
                    <p>Protect your session. Automatically log out of the portal after a period of user inactivity.</p>
                </div>
            </div>
            <div class="privacy-control" style="flex-direction: column; align-items: stretch; gap: 12px; width: 100%;">
                <div style="display:flex; justify-content:space-between; align-items:center; width: 100%;">
                    <span>Logout after inactivity</span>
                    <select class="edu-select" style="width: auto; margin-bottom: 0; padding: 6px 12px;" onchange="window.updatePrivacySetting('autoLogoutTime', this.value)">
                        <option value="0" ${currentUser.autoLogoutTime == '0' || !currentUser.autoLogoutTime ? 'selected' : ''}>Disabled</option>
                        <option value="5" ${currentUser.autoLogoutTime == '5' ? 'selected' : ''}>5 Minutes</option>
                        <option value="15" ${currentUser.autoLogoutTime == '15' ? 'selected' : ''}>15 Minutes</option>
                        <option value="30" ${currentUser.autoLogoutTime == '30' ? 'selected' : ''}>30 Minutes</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Card 8: Security Audit Log -->
        <div class="privacy-card" style="grid-column: 1 / -1; width: 100%;">
            <div class="privacy-header" style="margin-bottom: 16px;">
                <div class="privacy-icon" style="color: #4b5563; background: rgba(75, 85, 99, 0.1);"><i class="fas fa-shield-alt"></i></div>
                <div>
                    <h3>Security Activity Log</h3>
                    <p>Audit recent security and access events on your account.</p>
                </div>
            </div>
            <div class="security-logs-table-wrapper" style="width: 100%;">
                <table class="security-logs-table" style="width: 100%;">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Action</th>
                            <th>Details</th>
                            <th>Device</th>
                        </tr>
                    </thead>
                    <tbody id="security-logs-body">
                        <!-- Populated via JS -->
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Card 9: GDPR Compliance Tools & Danger Zone -->
        <div class="privacy-card danger-panel" style="grid-column: 1 / -1; width: 100%;">
            <div class="privacy-header">
                <div class="privacy-icon red-text"><i class="fas fa-exclamation-triangle"></i></div>
                <div>
                    <h3 class="red-text">Data Archive & Danger Zone</h3>
                    <p>Download a complete archive of your account data (GDPR compliant) or permanently delete your account and posts from the portal.</p>
                </div>
            </div>
            
            <div class="privacy-control" style="background: rgba(243, 244, 246, 0.6); border-radius: 8px; padding: 12px; margin-bottom: 12px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="text-align: left;">
                    <strong style="color: var(--text-primary);">Export My Personal Data</strong>
                    <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">Get a copy of your profile, bookmarks, and activity logs in JSON format.</p>
                </div>
                <button class="edu-btn-post" onclick="window.exportUserData()" style="padding: 8px 16px; margin: 0; font-size: 0.85rem; background: var(--uog-blue); width: auto;">
                    <i class="fas fa-file-download" style="margin-right: 6px;"></i> Export Data
                </button>
            </div>
            
            <div style="display: flex; gap: 12px; width: 100%; flex-wrap: wrap;">
                <div class="privacy-control" style="flex: 1; min-width: 200px; background: rgba(254, 242, 242, 0.6); border-color: rgba(239, 68, 68, 0.1); padding: 12px; border-radius: 8px; flex-direction: column; align-items: flex-start; gap: 8px;">
                    <span style="font-weight: 600; color: #b91c1c; font-size: 0.85rem;">Delete All My Feed Posts</span>
                    <button class="edu-btn-post btn-danger" id="delete-all-posts-btn" onclick="window.bulkDeleteUserPosts()" style="padding: 8px 12px; margin: 0; font-size: 0.8rem; width: 100%;">
                        <i class="fas fa-trash-alt" style="margin-right: 6px;"></i> Delete Posts
                    </button>
                </div>
                <div class="privacy-control" style="flex: 1; min-width: 200px; background: rgba(254, 242, 242, 0.6); border-color: rgba(239, 68, 68, 0.1); padding: 12px; border-radius: 8px; flex-direction: column; align-items: flex-start; gap: 8px;">
                    <span style="font-weight: 600; color: #b91c1c; font-size: 0.85rem;">Permanently Delete Account</span>
                    <button class="edu-btn-post btn-danger" onclick="window.eraseUserAccount()" style="padding: 8px 12px; margin: 0; font-size: 0.8rem; width: 100%; background: #dc2626;">
                        <i class="fas fa-user-times" style="margin-right: 6px;"></i> Erase Account
                    </button>
                </div>
            </div>
        </div>
    `;
    listContainer.appendChild(dash);

    // Populate security logs table
    const logsBody = document.getElementById('security-logs-body');
    if (logsBody) {
        const key = `uog_security_log_${currentUser.username}`;
        const logs = JSON.parse(localStorage.getItem(key) || '[]');
        if (logs.length === 0) {
            logsBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:20px;">No recent security events logged.</td></tr>`;
        } else {
            logsBody.innerHTML = logs.map(log => {
                let badgeClass = 'badge-info';
                if (log.status === 'success') badgeClass = 'badge-success';
                else if (log.status === 'warning') badgeClass = 'badge-warning';
                else if (log.status === 'danger') badgeClass = 'badge-danger';
                
                return `
                    <tr>
                        <td style="white-space:nowrap;">${log.timestamp}</td>
                        <td><span class="security-badge ${badgeClass}">${log.action}</span></td>
                        <td>${log.details}</td>
                        <td style="white-space:nowrap;">${log.device}</td>
                    </tr>
                `;
            }).join('');
        }
    }
};

window.updatePrivacySetting = async function(key, value) {
    try {
        const body = {};
        body[key] = value;
        const res = await dbPut(`users/${currentUser.username}/profile`, body);
        if (res && res.user) {
            currentUser = { ...currentUser, ...res.user };
            localStorage.setItem('uog_session', JSON.stringify(currentUser));
            logSecurityEvent('Privacy Update', `Changed ${key} to ${value}`, 'info');
            showToast('Privacy setting updated successfully!');
            
            // If the user changed the auto-logout time, restart the activity monitor immediately
            if (key === 'autoLogoutTime') {
                resetInactivityTimer();
            }
        }
    } catch (err) {
        showToast('Failed to update settings: ' + err.message, true);
    }
};

window.bulkDeleteUserPosts = async function() {
    if (!confirm('Warning: Are you sure you want to permanently delete ALL your posts? This action cannot be undone.')) {
        return;
    }
    
    const deleteBtn = document.getElementById('delete-all-posts-btn');
    const originalText = deleteBtn.innerHTML;
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
    
    try {
        await dbDelete(`users/${currentUser.username}/posts`);
        showToast('All your posts have been deleted successfully.');
        setTimeout(() => {
            switchView('privacy');
            updateStats();
        }, 1000);
    } catch (err) {
        showToast('Failed to delete posts: ' + err.message, true);
    } finally {
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = originalText;
    }
};

window.toggleBookmark = function(postId) {
    const bookmarks = getBookmarks();
    const idx = bookmarks.indexOf(String(postId));
    if (idx !== -1) {
        bookmarks.splice(idx, 1);
        showToast('Post removed from Saved Items.');
    } else {
        bookmarks.push(String(postId));
        showToast('Post added to Saved Items!');
    }
    saveBookmarks(bookmarks);
    
    // Smoothly update UI bookmark buttons
    const btn = document.querySelector(`[onclick="window.toggleBookmark('${postId}')"]`);
    if (btn) {
        if (idx !== -1) {
            btn.classList.remove('bookmarked');
            btn.innerHTML = `<i class="fa-regular fa-bookmark"></i> Save`;
        } else {
            btn.classList.add('bookmarked');
            btn.innerHTML = `<i class="fa-solid fa-bookmark"></i> Saved`;
        }
    }
    
    // If we are currently on the saved view, re-render it smoothly
    if (currentView === 'saved') {
        renderPosts('saved');
    }
    
    // Pulse and update sidebar badges instantly!
    if (window.updateSidebarBadges) {
        window.updateSidebarBadges();
    }
};

window.sharePost = function(postId) {
    // Generate simulated deep link
    const link = `${window.location.origin}/post/${postId}`;
    navigator.clipboard.writeText(link).then(() => {
        showToast('Post direct link copied to clipboard!');
    }).catch(() => {
        showToast('Failed to copy link.', true);
    });
};

window.openLightbox = function(imgSrc, captionText) {
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    const caption = document.getElementById('lightbox-caption');
    if (!modal || !img) return;
    
    img.src = imgSrc;
    caption.textContent = captionText || 'Image Preview';
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
};

window.closeLightbox = function() {
    const modal = document.getElementById('lightbox-modal');
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
};

// ─── THEME SWITCHER LOGIC ───────────────────────────────────────────────────
function initTheme() {
    const savedTheme = localStorage.getItem('uog_theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        updateThemeIcon('dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
        updateThemeIcon('light');
    }
}

function updateThemeIcon(theme) {
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (!themeBtn) return;
    if (theme === 'dark') {
        themeBtn.innerHTML = '<i class="fas fa-sun" style="color: #fbbf24; filter: drop-shadow(0 0 8px rgba(251,191,36,0.6));"></i>';
    } else {
        themeBtn.innerHTML = '<i class="fas fa-moon" style="color: #6366f1;"></i>';
    }
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('uog_theme', 'light');
        updateThemeIcon('light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('uog_theme', 'dark');
        updateThemeIcon('dark');
    }
}

const themeToggleBtn = document.getElementById('theme-toggle-btn');
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
}

// ─── LAYOUT SWITCHER LOGIC ───────────────────────────────────────────────────
function updateLayoutToggleUI() {
    const isMobileMode = document.body.classList.contains('forced-mobile-mode') || 
                         (window.innerWidth <= 768 && !document.body.classList.contains('forced-desktop-mode'));
    
    const desktopBtn = document.getElementById('layout-toggle-btn');
    const mobileBtn = document.getElementById('mobile-layout-toggle-btn');
    
    if (desktopBtn) {
        desktopBtn.innerHTML = isMobileMode ? '<i class="fas fa-desktop" style="color: var(--uog-blue);"></i>' : '<i class="fas fa-mobile-alt" style="color: var(--uog-blue);"></i>';
        desktopBtn.title = isMobileMode ? 'Switch to Desktop Layout' : 'Switch to Mobile Layout';
    }
    if (mobileBtn) {
        mobileBtn.innerHTML = isMobileMode ? '<i class="fas fa-desktop"></i>' : '<i class="fas fa-mobile-alt"></i>';
        mobileBtn.title = isMobileMode ? 'Switch to Desktop Layout' : 'Switch to Mobile Layout';
    }
}

function toggleLayoutMode() {
    const isDesktopScreen = window.innerWidth > 768;
    if (isDesktopScreen) {
        if (document.body.classList.contains('forced-mobile-mode')) {
            document.body.classList.remove('forced-mobile-mode');
            localStorage.setItem('layout_mode', 'default');
        } else {
            document.body.classList.add('forced-mobile-mode');
            document.body.classList.remove('forced-desktop-mode');
            localStorage.setItem('layout_mode', 'forced-mobile');
        }
    } else {
        if (document.body.classList.contains('forced-desktop-mode')) {
            document.body.classList.remove('forced-desktop-mode');
            localStorage.setItem('layout_mode', 'default');
        } else {
            document.body.classList.add('forced-desktop-mode');
            document.body.classList.remove('forced-mobile-mode');
            localStorage.setItem('layout_mode', 'forced-desktop');
        }
    }
    updateLayoutToggleUI();
    
    // Resize charts to fit new container dimensions
    setTimeout(() => {
        if (window.activeCharts) {
            Object.values(window.activeCharts).forEach(chart => {
                if (chart) chart.resize();
            });
        }
    }, 300);
}

function initLayoutMode() {
    const savedMode = localStorage.getItem('layout_mode');
    const isDesktopScreen = window.innerWidth > 768;
    
    if (savedMode === 'forced-mobile' && isDesktopScreen) {
        document.body.classList.add('forced-mobile-mode');
    } else if (savedMode === 'forced-desktop' && !isDesktopScreen) {
        document.body.classList.add('forced-desktop-mode');
    }
    updateLayoutToggleUI();
    
    const dBtn = document.getElementById('layout-toggle-btn');
    const mBtn = document.getElementById('mobile-layout-toggle-btn');
    if (dBtn) dBtn.addEventListener('click', toggleLayoutMode);
    if (mBtn) mBtn.addEventListener('click', toggleLayoutMode);
    
    window.addEventListener('resize', () => {
        updateLayoutToggleUI();
    });
}

// Call on load
initTheme();
initLayoutMode();

// ─── AUTO RESTORE SESSION ON PAGE LOAD ───────────────────────────────────────
(async function autoRestoreSession() {
    if (currentUser) {
        try {
            let freshUser = null;
            if (HAS_SERVER) {
                const users = await dbGet('users');
                freshUser = users.find(u => u.username === currentUser.username);
            } else {
                const users = JSON.parse(localStorage.getItem('uog_users') || '[]');
                freshUser = users.find(u => u.username === currentUser.username);
            }
            if (freshUser) {
                const { password, ...safeUser } = freshUser;
                currentUser = safeUser;
                localStorage.setItem('uog_session', JSON.stringify(currentUser));
                initApp();
                document.getElementById('auth-view').classList.remove('active');
                document.getElementById('workspace-view').classList.add('active');
            } else {
                logoutUser(false);
            }
        } catch (err) {
            console.error('Error during auto-restore session, using cache:', err);
            initApp();
            document.getElementById('auth-view').classList.remove('active');
            document.getElementById('workspace-view').classList.add('active');
        }
    }
})();

// ─── RENDER ANALYTICS ────────────────────────────────────────────────────────
window.switchAnalyticsTab = function(tab) {
    document.querySelectorAll('.analytics-tab-content').forEach(el => {
        el.style.display = 'none';
    });
    
    const targetMap = {
        overview: 'analytics-tab-overview',
        statistics: 'analytics-tab-statistics',
        'analytics-program': 'analytics-tab-analytics-program',
        faculty: 'analytics-tab-faculty'
    };
    
    const activeEl = document.getElementById(targetMap[tab]);
    if (activeEl) {
        activeEl.style.display = 'block';
    }
    
    document.querySelectorAll('.analytics-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtnMap = {
        overview: 'btn-analytics-overview',
        statistics: 'btn-analytics-statistics',
        'analytics-program': 'btn-analytics-program',
        faculty: 'btn-analytics-faculty'
    };
    const activeBtn = document.getElementById(activeBtnMap[tab]);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
};

async function renderAnalytics() {
    const users = await dbGet('users');
    const container = document.querySelector('#analytics-tab-overview .charts-grid');
    if (!container) return;

    // Reset Overview Container
    container.innerHTML = `
        <div class="analytics-card" style="background: var(--bg-surface); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color);"><canvas id="genderChart" height="260"></canvas></div>
        <div class="analytics-card" style="background: var(--bg-surface); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color);"><canvas id="programChart" height="260"></canvas></div>
        <div class="analytics-card" style="background: var(--bg-surface); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color);"><canvas id="degreeChart" height="260"></canvas></div>
        <div class="analytics-card" style="background: var(--bg-surface); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color);"><canvas id="semesterChart" height="260"></canvas></div>
        <div class="analytics-card" style="background: var(--bg-surface); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color);"><canvas id="ageChart" height="260"></canvas></div>
        <div class="analytics-card" style="background: var(--bg-surface); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color);"><canvas id="areaChart" height="260"></canvas></div>
        <div class="analytics-card" style="background: var(--bg-surface); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color);"><canvas id="roleChart" height="260"></canvas></div>
    `;

    // Reset Chart.js instances if they exist (prevents canvas hover glitches)
    if (window.activeCharts) {
        Object.keys(window.activeCharts).forEach(key => {
            if (window.activeCharts[key]) {
                window.activeCharts[key].destroy();
            }
        });
    }
    window.activeCharts = {};

    // 1. Overview data holders
    const studentGenders = {};
    const programs = {};
    const degrees = {};
    const studentSemesters = {};
    const ages = {};
    const areas = {};
    const roleDistribution = { 'Students': 0, 'Faculty': 0 };

    // 2. Program-specific holders (populated exclusively by DB)
    const statsBatches = {};
    const statsSemesters = {};
    
    const analyticsBatches = {};
    const analyticsSemesters = {};
    
    const facultyDesignations = {};
    const facultyPublications = {};
    const facultyGenders = {};
    const facultyEducations = {};
    const facultyJobStatus = {};

    // Update with DB user values
    users.forEach(u => {
        if (u.role === 'Student') {
            roleDistribution['Students']++;
            if (u.gender) {
                studentGenders[u.gender] = (studentGenders[u.gender] || 0) + 1;
            } else {
                studentGenders['Other'] = (studentGenders['Other'] || 0) + 1;
            }
            if (u.age) {
                const a = parseInt(u.age);
                if (a < 20) ages['< 20'] = (ages['< 20'] || 0) + 1;
                else if (a <= 22) ages['20-22'] = (ages['20-22'] || 0) + 1;
                else if (a <= 25) ages['23-25'] = (ages['23-25'] || 0) + 1;
                else ages['> 25'] = (ages['> 25'] || 0) + 1;
            }
            if (u.area) {
                const areaKey = u.area.trim().split(',')[0].trim();
                if (areaKey) areas[areaKey] = (areas[areaKey] || 0) + 1;
            }

            const prog = u.program || 'Other';
            programs[prog] = (programs[prog] || 0) + 1;

            // Degree mapping
            let degree = 'Other';
            if (prog.includes('BS')) degree = 'BS';
            else if (prog.includes('M.Phil') || prog.includes('MS')) degree = 'M.Phil / MS';
            else if (prog.includes('Ph.D')) degree = 'Ph.D';
            degrees[degree] = (degrees[degree] || 0) + 1;

            // Semester mapping
            if (u.semester) {
                let semKey = u.semester;
                if (semKey === 'Graduated') {
                    studentSemesters['Graduated'] = (studentSemesters['Graduated'] || 0) + 1;
                } else {
                    const num = parseInt(semKey);
                    const labelMap = { 1:'1st', 2:'2nd', 3:'3rd', 4:'4th', 5:'5th', 6:'6th', 7:'7th', 8:'8th' };
                    const label = labelMap[num] || `${semKey}th`;
                    studentSemesters[label] = (studentSemesters[label] || 0) + 1;
                }
            }

            if (prog === 'BS Statistics') {
                if (u.batch) statsBatches[u.batch] = (statsBatches[u.batch] || 0) + 1;
                if (u.semester) {
                    const key = `Sem ${u.semester}`;
                    statsSemesters[key] = (statsSemesters[key] || 0) + 1;
                }
            } else if (prog === 'BS Data Analytics') {
                if (u.batch) analyticsBatches[u.batch] = (analyticsBatches[u.batch] || 0) + 1;
                if (u.semester) {
                    const key = `Sem ${u.semester}`;
                    analyticsSemesters[key] = (analyticsSemesters[key] || 0) + 1;
                }
            }
        } else if (u.role === 'Faculty') {
            roleDistribution['Faculty']++;
            if (u.gender) {
                facultyGenders[u.gender] = (facultyGenders[u.gender] || 0) + 1;
            } else {
                facultyGenders['Other'] = (facultyGenders['Other'] || 0) + 1;
            }
            
            const desig = u.designation || 'Lecturer';
            facultyDesignations[desig] = (facultyDesignations[desig] || 0) + 1;
            
            const pubs = parseInt(u.publicationsCount) || 0;
            facultyPublications[desig] = (facultyPublications[desig] || 0) + pubs;

            const edu = u.education || 'Ph.D';
            facultyEducations[edu] = (facultyEducations[edu] || 0) + 1;

            const status = u.jobStatus || 'Active';
            facultyJobStatus[status] = (facultyJobStatus[status] || 0) + 1;
        }
    });

    // Overview Tab Calculations
    const topAreas = Object.entries(areas).sort((a,b) => b[1]-a[1]).slice(0,8);

    // KPI update for BS Statistics Tab
    const totalStats = Object.values(statsBatches).reduce((a,b) => a+b, 0);
    const avgStatsBatch = Object.keys(statsBatches).length > 0 ? Math.round(totalStats / Object.keys(statsBatches).length) : 0;
    document.getElementById('kpi-stats-total').textContent = totalStats;
    document.getElementById('kpi-stats-avg-size').textContent = `${avgStatsBatch} students`;

    // KPI update for BS Data Analytics Tab
    const totalAnalytics = Object.values(analyticsBatches).reduce((a,b) => a+b, 0);
    const avgAnalyticsBatch = Object.keys(analyticsBatches).length > 0 ? Math.round(totalAnalytics / Object.keys(analyticsBatches).length) : 0;
    document.getElementById('kpi-analytics-total').textContent = totalAnalytics;
    document.getElementById('kpi-analytics-avg-size').textContent = `${avgAnalyticsBatch} students`;

    // KPI update for Faculty Tab
    const totalFaculty = Object.values(facultyDesignations).reduce((a,b) => a+b, 0);
    const totalPubs = Object.values(facultyPublications).reduce((a,b) => a+b, 0);
    const phdCount = (facultyDesignations['Professor'] || 0) + (facultyDesignations['Associate Professor'] || 0) + (facultyDesignations['Assistant Professor'] || 0);
    document.getElementById('kpi-faculty-total').textContent = totalFaculty;
    document.getElementById('kpi-faculty-pubs').textContent = `${totalPubs} Papers`;
    document.getElementById('kpi-faculty-phd').textContent = `${phdCount} PhDs`;

    // Chart Defaults
    const chartDefaults = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { font: { family: 'Outfit', size: 11 }, padding: 12 } },
            title: { display: true, font: { family: 'Outfit', size: 14, weight: '600' }, color: '#0f4c81', padding: { bottom: 12 } }
        }
    };

    // ──────────────────────────────────────────
    // OVERVIEW CHARTS
    // ──────────────────────────────────────────
    
    // 1. Gender — Pie
    window.activeCharts['gender'] = new Chart(document.getElementById('genderChart'), {
        type: 'pie',
        data: {
            labels: Object.keys(studentGenders),
            datasets: [{ data: Object.values(studentGenders), backgroundColor: ['#0f4c81','#f58220','#8b5cf6'], borderWidth: 2, borderColor: '#fff' }]
        },
        options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '👥 Student Gender Distribution' } } }
    });

    // 2. Program — Doughnut
    window.activeCharts['program'] = new Chart(document.getElementById('programChart'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(programs),
            datasets: [{ data: Object.values(programs), backgroundColor: ['#0f4c81','#f58220','#10b981','#8b5cf6'], borderWidth: 2, borderColor: '#fff' }]
        },
        options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '🎓 Student Program Enrollment' } } }
    });

    // 3. Degree Level — Doughnut (BS, M.Phil, Ph.D)
    window.activeCharts['degree'] = new Chart(document.getElementById('degreeChart'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(degrees),
            datasets: [{ data: Object.values(degrees), backgroundColor: ['#2563eb','#7c3aed','#db2777'], borderWidth: 2, borderColor: '#fff' }]
        },
        options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '📜 Degree Levels (BS, M.Phil, Ph.D)' } } }
    });

    // 4. Semester — Bar
    window.activeCharts['semester'] = new Chart(document.getElementById('semesterChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(studentSemesters),
            datasets: [{ label: 'Students', data: Object.values(studentSemesters), backgroundColor: 'rgba(37,99,235,0.85)', borderRadius: 6 }]
        },
        options: {
            ...chartDefaults,
            plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '📚 General Semester Distribution' } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    // 5. Age — Line
    window.activeCharts['age'] = new Chart(document.getElementById('ageChart'), {
        type: 'line',
        data: {
            labels: Object.keys(ages),
            datasets: [{ label: 'Students', data: Object.values(ages), borderColor: '#f58220', backgroundColor: 'rgba(245,130,32,0.1)', fill: true, tension: 0.4, pointRadius: 5, pointBackgroundColor: '#f58220' }]
        },
        options: {
            ...chartDefaults,
            plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '🎂 Age Demographics' } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    // 6. Area — Horizontal Bar
    window.activeCharts['area'] = new Chart(document.getElementById('areaChart'), {
        type: 'bar',
        data: {
            labels: topAreas.map(e => e[0]),
            datasets: [{ label: 'Students', data: topAreas.map(e => e[1]), backgroundColor: 'rgba(15,76,129,0.85)', borderRadius: 6 }]
        },
        options: {
            indexAxis: 'y',
            ...chartDefaults,
            plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '🏙️ Top Cities / Areas' } },
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    // 7. Role Distribution (Extra) — Pie
    window.activeCharts['role'] = new Chart(document.getElementById('roleChart'), {
        type: 'pie',
        data: {
            labels: Object.keys(roleDistribution),
            datasets: [{ data: Object.values(roleDistribution), backgroundColor: ['#10b981','#f58220'], borderWidth: 2, borderColor: '#fff' }]
        },
        options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '🎭 Overall Role Distribution' } } }
    });

    // ──────────────────────────────────────────
    // BS STATISTICS CHARTS
    // ──────────────────────────────────────────

    // Stats Batch — Vertical Bar
    window.activeCharts['statsBatch'] = new Chart(document.getElementById('statsBatchChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(statsBatches),
            datasets: [{ label: 'Students', data: Object.values(statsBatches), backgroundColor: 'rgba(15,76,129,0.85)', borderRadius: 6 }]
        },
        options: {
            ...chartDefaults,
            plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '📅 BS Statistics Students by Batch' } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 5 } } }
        }
    });

    // Stats Semester — Doughnut
    window.activeCharts['statsSemester'] = new Chart(document.getElementById('statsSemesterChart'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(statsSemesters),
            datasets: [{ data: Object.values(statsSemesters), backgroundColor: ['#0f4c81','#3b82f6','#60a5fa','#93c5fd'], borderWidth: 2, borderColor: '#fff' }]
        },
        options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '📚 BS Statistics by Semester' } } }
    });

    // ──────────────────────────────────────────
    // BS DATA ANALYTICS CHARTS
    // ──────────────────────────────────────────

    // Analytics Batch — Vertical Bar
    window.activeCharts['analyticsBatch'] = new Chart(document.getElementById('analyticsBatchChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(analyticsBatches),
            datasets: [{ label: 'Students', data: Object.values(analyticsBatches), backgroundColor: 'rgba(245,130,32,0.85)', borderRadius: 6 }]
        },
        options: {
            ...chartDefaults,
            plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '📅 BS Data Analytics Students by Batch' } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 5 } } }
        }
    });

    // Analytics Semester — Doughnut
    window.activeCharts['analyticsSemester'] = new Chart(document.getElementById('analyticsSemesterChart'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(analyticsSemesters),
            datasets: [{ data: Object.values(analyticsSemesters), backgroundColor: ['#f58220','#f8a25c','#fbc298'], borderWidth: 2, borderColor: '#fff' }]
        },
        options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '📚 BS Data Analytics by Semester' } } }
    });

    // ──────────────────────────────────────────
    // FACULTY CHARTS
    // ──────────────────────────────────────────

    // Faculty Designation — Horizontal Bar
    window.activeCharts['facultyDesignation'] = new Chart(document.getElementById('facultyDesignationChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(facultyDesignations),
            datasets: [{ label: 'Faculty Count', data: Object.values(facultyDesignations), backgroundColor: 'rgba(15,76,129,0.85)', borderRadius: 6 }]
        },
        options: {
            indexAxis: 'y',
            ...chartDefaults,
            plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '💼 Faculty by Designation' } },
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    // Faculty Publications — Pie
    window.activeCharts['facultyPublications'] = new Chart(document.getElementById('facultyPublicationsChart'), {
        type: 'pie',
        data: {
            labels: Object.keys(facultyPublications),
            datasets: [{ data: Object.values(facultyPublications), backgroundColor: ['#0f4c81','#f58220','#10b981','#8b5cf6'], borderWidth: 2, borderColor: '#fff' }]
        },
        options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '📝 Research Publications by Rank' } } }
    });

    // Faculty Gender — Pie
    window.activeCharts['facultyGender'] = new Chart(document.getElementById('facultyGenderChart'), {
        type: 'pie',
        data: {
            labels: Object.keys(facultyGenders),
            datasets: [{ data: Object.values(facultyGenders), backgroundColor: ['#0f4c81','#f58220','#8b5cf6'], borderWidth: 2, borderColor: '#fff' }]
        },
        options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '👥 Faculty Gender Distribution' } } }
    });

    // Faculty Education — Doughnut
    window.activeCharts['facultyEducation'] = new Chart(document.getElementById('facultyEducationChart'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(facultyEducations),
            datasets: [{ data: Object.values(facultyEducations), backgroundColor: ['#10b981','#0f4c81','#f58220','#8b5cf6'], borderWidth: 2, borderColor: '#fff' }]
        },
        options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '🎓 Faculty Education Levels' } } }
    });

    // Faculty Job Status — Bar
    window.activeCharts['facultyJobStatus'] = new Chart(document.getElementById('facultyJobStatusChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(facultyJobStatus),
            datasets: [{ label: 'Faculty Count', data: Object.values(facultyJobStatus), backgroundColor: 'rgba(245,130,32,0.85)', borderRadius: 6 }]
        },
        options: {
            ...chartDefaults,
            plugins: { ...chartDefaults.plugins, title: { ...chartDefaults.plugins.title, text: '💼 Faculty Job Status' } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

// ─── MOBILE BOTTOM NAV HANDLER ────────────────────────────────────────────────
// ─── MOBILE NAV CLICK HANDLER ────────────────────────────────────────────────
window.mobileNavClick = function(btn, view) {
    // Update active state on bottom nav (only if btn passed)
    if (btn) {
        document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active-mob'));
        btn.classList.add('active-mob');
    }
    // Sync desktop sidebar
    document.querySelectorAll('.sidebar-list li').forEach(li => {
        li.classList.remove('active-item');
        if (li.getAttribute('data-target') === view) li.classList.add('active-item');
    });
    switchView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ─── CLOSE ALL MOBILE DRAWERS ────────────────────────────────────────────────
window.closeMobileDrawers = function() {
    ['mobile-more-drawer','mobile-profile-sheet'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
    ['mobile-more-overlay','mobile-profile-overlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
    // Also close search bar
    const searchBar = document.getElementById('mobile-search-bar');
    if (searchBar) searchBar.classList.remove('active');
};

// Show overlay when drawer opens
['mobile-more-drawer','mobile-profile-sheet'].forEach(drawerId => {
    const drawer = document.getElementById(drawerId);
    if (!drawer) return;
    const observer = new MutationObserver(() => {
        const overlayId = drawerId === 'mobile-more-drawer' ? 'mobile-more-overlay' : 'mobile-profile-overlay';
        const overlay = document.getElementById(overlayId);
        if (!overlay) return;
        if (drawer.classList.contains('active')) {
            overlay.style.display = 'block';
        } else {
            overlay.style.display = 'none';
        }
    });
    observer.observe(drawer, { attributes: true, attributeFilter: ['class'] });
});

// ─── SYNC MOBILE SEARCH WITH DESKTOP SEARCH ──────────────────────────────────
(function syncMobileSearch() {
    const mobInput = document.getElementById('mob-search-input');
    const desktopInput = document.querySelector('.nav-middle .nav-search input');
    if (mobInput && desktopInput) {
        mobInput.addEventListener('input', (e) => {
            desktopInput.value = e.target.value;
            desktopInput.dispatchEvent(new Event('input'));
        });
    }
    // Also connect to the search input listener directly
    if (mobInput) {
        mobInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (currentView === 'feed' || currentView === 'records') {
                document.querySelectorAll('.edu-card.post').forEach(card => {
                    card.style.display = card.textContent.toLowerCase().includes(query) ? 'block' : 'none';
                });
            } else if (currentView === 'students') {
                document.querySelectorAll('.student-card').forEach(card => {
                    card.style.display = card.textContent.toLowerCase().includes(query) ? 'block' : 'none';
                });
            } else if (currentView === 'software') {
                document.querySelectorAll('.sw-card').forEach(card => {
                    card.style.display = card.textContent.toLowerCase().includes(query) ? 'flex' : 'none';
                });
            }
        });
    }
})();

// ─── MOBILE PROFILE SHEET POPULATION ─────────────────────────────────────────
// Called from initApp() to fill profile sheet info
function updateMobileProfileSheet() {
    if (!currentUser) return;
    const mobName   = document.getElementById('mob-profile-name');
    const mobRole   = document.getElementById('mob-profile-role');
    const mobAvatar = document.getElementById('mob-profile-avatar');
    const mobTopAvatar = document.getElementById('mob-avatar');
    if (mobName)  mobName.textContent  = currentUser.name;
    if (mobRole)  mobRole.textContent  = currentUser.role === 'Student'
        ? `${currentUser.program || 'Student'} • ${currentUser.batch || ''}`
        : currentUser.role;
    if (mobAvatar)    renderAvatar(mobAvatar, currentUser);
    if (mobTopAvatar) renderAvatar(mobTopAvatar, currentUser);
}

// ─── FACULTY INDIVIDUAL ANALYTICS ──────────────────────────────────────────
let faActiveCharts = {};

window.openFacultyAnalytics = async function(username) {
    const modal = document.getElementById('faculty-analytics-modal');
    if (!modal) return;
    
    // Fetch data
    const users = await dbGet('users');
    const faculty = users.find(u => u.username === username);
    if (!faculty || faculty.role !== 'Faculty') return;
    
    // Render Modal Header
    document.getElementById('fa-modal-name').textContent = faculty.name;
    document.getElementById('fa-modal-role').textContent = faculty.designation || 'Faculty Member';
    const avatarEl = document.getElementById('fa-modal-avatar');
    renderAvatar(avatarEl, faculty);
    
    // Calculate Stats
    const allFaculty = users.filter(u => u.role === 'Faculty');
    
    // 1. Research Output
    const myPubs = parseInt(faculty.publicationsCount) || 0;
    const totalPubs = allFaculty.reduce((sum, f) => sum + (parseInt(f.publicationsCount) || 0), 0);
    const avgPubs = allFaculty.length > 0 ? (totalPubs / allFaculty.length).toFixed(1) : 0;
    
    // 2. Department Share
    const myDesig = faculty.designation || 'Lecturer';
    const sameDesigCount = allFaculty.filter(f => (f.designation || 'Lecturer') === myDesig).length;
    const otherDesigCount = allFaculty.length - sameDesigCount;

    // 3. Academic Standing (Radar)
    const rankMap = { 'Lecturer': 1, 'Assistant Professor': 2, 'Associate Professor': 3, 'Professor': 4 };
    const eduMap = { 'BS / Master': 1, 'M.Phil': 2, 'Ph.D': 3, 'Post-Doc': 4 };
    const myRank = rankMap[myDesig] || 1;
    const myEdu = eduMap[faculty.education || 'Ph.D'] || 3;
    
    // Destroy previous charts
    Object.values(faActiveCharts).forEach(c => c && c.destroy());
    faActiveCharts = {};
    
    Chart.defaults.color = '#94a3b8';
    
    // Render Research Output (Bar)
    const ctxRes = document.getElementById('faChartResearch').getContext('2d');
    faActiveCharts.res = new Chart(ctxRes, {
        type: 'bar',
        data: {
            labels: ['Your Papers', 'Dept Avg'],
            datasets: [{
                label: 'Publications',
                data: [myPubs, avgPubs],
                backgroundColor: ['#f58220', 'rgba(255,255,255,0.1)'],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } }
        }
    });

    // Render Academic Standing (Radar)
    const ctxStand = document.getElementById('faChartStanding').getContext('2d');
    faActiveCharts.stand = new Chart(ctxStand, {
        type: 'radar',
        data: {
            labels: ['Rank', 'Education', 'Activity'],
            datasets: [{
                label: 'Your Standing',
                data: [myRank, myEdu, (faculty.jobStatus === 'Active' || !faculty.jobStatus) ? 4 : 2],
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                borderColor: '#10b981',
                pointBackgroundColor: '#10b981'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(255,255,255,0.1)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    pointLabels: { color: '#cbd5e1' },
                    ticks: { display: false, max: 4, min: 0 }
                }
            },
            plugins: { legend: { display: false } }
        }
    });

    // Render Department Share (Doughnut)
    const ctxShare = document.getElementById('faChartShare').getContext('2d');
    faActiveCharts.share = new Chart(ctxShare, {
        type: 'doughnut',
        data: {
            labels: [`${myDesig}s`, 'Other Faculty'],
            datasets: [{
                data: [sameDesigCount, otherDesigCount],
                backgroundColor: ['#3b82f6', 'rgba(255,255,255,0.1)'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1' } } }
        }
    });
    
    modal.style.display = 'flex';
};

window.closeFacultyAnalytics = function() {
    const modal = document.getElementById('faculty-analytics-modal');
    if (modal) modal.style.display = 'none';
};
