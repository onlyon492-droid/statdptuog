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
    if (endpoint.startsWith('users/') && endpoint.endsWith('/connect')) {
        const username = endpoint.split('/')[1];
        const targetUsername = body.targetUsername.toLowerCase();
        const users = JSON.parse(localStorage.getItem('uog_users') || '[]');
        const userIdx = users.findIndex(u => u.username === username);
        const targetIdx = users.findIndex(u => u.username === targetUsername);
        if (userIdx !== -1 && targetIdx !== -1) {
            if (!users[userIdx].connections) users[userIdx].connections = [];
            if (!users[targetIdx].connections) users[targetIdx].connections = [];
            
            const idx = users[userIdx].connections.indexOf(targetUsername);
            if (idx !== -1) {
                // Disconnect (Always allowed)
                users[userIdx].connections.splice(idx, 1);
                const targetConnIdx = users[targetIdx].connections.indexOf(username);
                if (targetConnIdx !== -1) users[targetIdx].connections.splice(targetConnIdx, 1);
            } else {
                // Connect validation
                const targetPolicy = users[targetIdx].connectionPolicy || 'everyone';
                if (targetPolicy === 'faculty_only' && users[userIdx].role !== 'Faculty') {
                    throw new Error('This user only allows connection requests from Faculty members.');
                }
                if (targetPolicy === 'same_batch') {
                    if (users[userIdx].role !== 'Faculty' && users[userIdx].batch !== users[targetIdx].batch) {
                        throw new Error('This user only allows connection requests from their own batch.');
                    }
                }
                users[userIdx].connections.push(targetUsername);
                users[targetIdx].connections.push(username);
            }
            localStorage.setItem('uog_users', JSON.stringify(users));
            return { connections: users[userIdx].connections };
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
let heartbeatInterval = null;

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
regRole.addEventListener('change', () => {
    if (regRole.value === 'Student') {
        regUsername.placeholder = "Roll No (Must contain 'UOG')";
        regStudentFields.style.display = 'block';
        document.getElementById('reg-program').required = true;
        document.getElementById('reg-batch').required = true;
        document.getElementById('reg-area').required = true;
        document.getElementById('reg-age').required = true;
        document.getElementById('reg-semester').required = true;
    } else {
        regUsername.placeholder = "Faculty Email (@uog.edu.pk)";
        regStudentFields.style.display = 'none';
        document.getElementById('reg-program').required = false;
        document.getElementById('reg-batch').required = false;
        document.getElementById('reg-area').required = false;
        document.getElementById('reg-age').required = false;
        document.getElementById('reg-semester').required = false;
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
            semester
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
    const btn = e.target.querySelector('button[type=submit]');
    btn.textContent = 'Logging in...'; btn.disabled = true;
    try {
        const data = await dbPost('login', {
            username: document.getElementById('login-username').value.trim(),
            password: document.getElementById('login-password').value
        });
        currentUser = data.user;
        initApp();
        document.getElementById('auth-view').classList.remove('active');
        document.getElementById('workspace-view').classList.add('active');
        showToast(`Welcome back, ${currentUser.name}!`);
    } catch (err) { showToast(err.message, true); }
    finally { btn.textContent = 'Access Portal'; btn.disabled = false; }
});

document.getElementById('sign-out-btn').addEventListener('click', () => {
    stopHeartbeatLoop();
    currentUser = null;
    document.getElementById('workspace-view').classList.remove('active');
    document.getElementById('auth-view').classList.add('active');
    document.getElementById('login-form').reset();
});

document.getElementById('faculty-link').addEventListener('click', () =>
    window.open('https://uog.edu.pk/faculty/c-fod57cea53bbfd17/department-of-statistics', '_blank'));

// ─── APP INIT ─────────────────────────────────────────────────────────────────
function initApp() {
    document.getElementById('nav-name').textContent = currentUser.name.split(' ')[0];
    document.getElementById('side-name').textContent = currentUser.name;
    
    if (currentUser.role === 'Student') {
        document.getElementById('side-role').textContent = `${currentUser.program || 'Student'} • Batch ${currentUser.batch || 'N/A'}`;
    } else {
        document.getElementById('side-role').textContent = currentUser.role;
    }
    
    document.getElementById('compose-name').textContent = currentUser.name;
    renderAvatar(document.getElementById('nav-avatar'), currentUser);
    renderAvatar(document.getElementById('side-avatar'), currentUser);
    renderAvatar(document.getElementById('post-avatar'), currentUser);
    renderAvatar(document.getElementById('compose-avatar'), currentUser);
    updateStats();
    startHeartbeatLoop();
    switchView('feed');
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
    if (currentUser.role === 'Student') {
        editStudentFields.style.display = 'block';
        document.getElementById('edit-program').value = currentUser.program || '';
        document.getElementById('edit-batch').value = currentUser.batch || '';
    } else {
        editStudentFields.style.display = 'none';
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
    }
    
    try {
        const data = await dbPut(`users/${currentUser.username}/profile`, body);
        currentUser.name = data.user.name;
        currentUser.program = data.user.program;
        currentUser.batch = data.user.batch;
        currentUser.tagline = data.user.tagline;
        
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
    const [posts, users] = await Promise.all([dbGet('posts'), dbGet('users')]);
    
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
            return true;
        });
    }
    
    listContainer.innerHTML = '';
    
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
                } else if (statusPrivacy === 'connections') {
                    const userConnections = currentUser.connections || [];
                    if (userConnections.includes(post.author)) {
                        showActiveDot = true;
                    }
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
        const commentsArr = post.comments || [];
        const reactions = post.reactions || [];
        const myReaction = reactions.find(r => r.username === currentUser.username);
        const hasReacted = !!myReaction;
        
        const emojiMap = {
            like: '👍',
            love: '❤️',
            celebrate: '👏',
            insight: '💡',
            respect: '🎓'
        };
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
            } else if (statusPrivacy === 'connections') {
                const userConnections = currentUser.connections || [];
                if (userConnections.includes(u.username)) {
                    showActiveDot = true;
                }
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
            badgeHtml = `<span class="badge-faculty"><i class="fas fa-chalkboard-teacher"></i> Faculty</span>`;
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
        } else if (phonePrivacy === 'connections') {
            const userConnections = currentUser.connections || [];
            if (userConnections.includes(u.username)) isPhoneVisible = true;
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
        
        let connectBtnHtml = '';
        if (u.username !== currentUser.username) {
            const userConnections = currentUser.connections || [];
            const isConnected = userConnections.includes(u.username);
            
            // Check target's connection lock
            let canConnect = true;
            const targetPolicy = u.connectionPolicy || 'everyone';
            if (targetPolicy === 'same_batch') {
                if (currentUser.role !== 'Faculty' && (currentUser.role !== 'Student' || currentUser.batch !== u.batch)) {
                    canConnect = false;
                }
            } else if (targetPolicy === 'faculty_only') {
                if (currentUser.role !== 'Faculty') {
                    canConnect = false;
                }
            }
            
            if (isConnected) {
                connectBtnHtml = `
                    <button class="connect-btn connected" disabled>
                        <i class="fas fa-check"></i> Connected
                    </button>
                `;
            } else if (!canConnect) {
                connectBtnHtml = `
                    <button class="connect-btn" disabled style="background:rgba(0,0,0,0.05); color:#6b7280; border-color:transparent; cursor:not-allowed;">
                        <i class="fas fa-lock"></i> Restricted
                    </button>
                `;
            } else {
                connectBtnHtml = `
                    <button class="connect-btn" onclick="window.toggleConnection('${u.username}', this)">
                        <i class="fas fa-user-plus"></i> Connect
                    </button>
                `;
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
            ${connectBtnHtml}
        `;
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

function resetCompose(cat) {
    uploadForm.reset(); previewArea.innerHTML = ''; uploadedFiles = [];
    postCategory.value = cat || 'Feed'; toggleSoftwareFields();
}
function toggleSoftwareFields() {
    const isSW = postCategory.value === 'Software';
    softwareTitleInput.style.display = isSW ? 'block' : 'none';
    softwareLinkInput.style.display  = isSW ? 'block' : 'none';
    isSW ? softwareTitleInput.setAttribute('required','true') : softwareTitleInput.removeAttribute('required');
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
            
            await dbPost('posts', { author: postAuthor, name: postName, role: postRole, category: catText, text, files: [...uploadedFiles], originalAuthor: currentUser.username, authorBatch: currentUser.batch, visibility });
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

window.toggleConnection = async function(targetUsername, btnEl) {
    if (btnEl.classList.contains('connected')) return;
    
    try {
        btnEl.disabled = true;
        btnEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Connecting...`;
        
        const res = await dbPost(`users/${currentUser.username}/connect`, { targetUsername });
        currentUser.connections = res.connections;
        
        // Dynamic success animation state transitions
        btnEl.classList.add('connected');
        btnEl.disabled = true;
        btnEl.innerHTML = `<i class="fas fa-check"></i> Connected`;
        
        showToast(`Connected with @${targetUsername}!`);
    } catch (err) {
        showToast('Could not establish connection: ' + err.message, true);
        btnEl.disabled = false;
        btnEl.innerHTML = `<i class="fas fa-user-plus"></i> Connect`;
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
    const connectionPolicy = currentUser.connectionPolicy || 'everyone';
    
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
                        <option value="connections" ${phonePrivacy === 'connections' ? 'selected' : ''}>My Connections</option>
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
                        <option value="connections" ${statusPrivacy === 'connections' ? 'selected' : ''}>My Connections</option>
                        <option value="none" ${statusPrivacy === 'none' ? 'selected' : ''}>Hide from all</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Card: Connection Request Policy -->
        <div class="privacy-card">
            <div class="privacy-header">
                <div class="privacy-icon" style="color: #8b5cf6;"><i class="fas fa-user-friends"></i></div>
                <div>
                    <h3>Connection Requests</h3>
                    <p>Control who is allowed to send you connection requests.</p>
                </div>
            </div>
            <div class="privacy-control" style="flex-direction: column; align-items: stretch; gap: 12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; width: 100%;">
                    <span>Who can connect with you</span>
                    <select class="edu-select" style="width: auto; margin-bottom: 0; padding: 6px 12px;" onchange="window.updatePrivacySetting('connectionPolicy', this.value)">
                        <option value="everyone" ${connectionPolicy === 'everyone' ? 'selected' : ''}>Everyone</option>
                        <option value="same_batch" ${connectionPolicy === 'same_batch' ? 'selected' : ''}>Same Batch & Faculty</option>
                        <option value="faculty_only" ${connectionPolicy === 'faculty_only' ? 'selected' : ''}>Faculty Only</option>
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

        <!-- Card 5: Danger Zone -->
        <div class="privacy-card danger-panel">
            <div class="privacy-header">
                <div class="privacy-icon red-text"><i class="fas fa-exclamation-triangle"></i></div>
                <div>
                    <h3 class="red-text">Danger Zone</h3>
                    <p>Permanently remove all your data from the portal. This action is irreversible. All of your updates, announcements, slides, and attachment files will be deleted from the system.</p>
                </div>
            </div>
            <div class="privacy-control" style="background: rgba(254, 242, 242, 0.6); border-color: rgba(239, 68, 68, 0.1); width: 100%;">
                <span style="font-weight: 600; color: #b91c1c;">Delete all my departmental posts</span>
                <button class="edu-btn-post btn-danger" id="delete-all-posts-btn" onclick="window.bulkDeleteUserPosts()" style="padding: 8px 16px; margin: 0; font-size: 0.85rem;">
                    <i class="fas fa-trash-alt" style="margin-right: 6px;"></i> Delete All My Posts
                </button>
            </div>
        </div>
    `;
    listContainer.appendChild(dash);
};

window.updatePrivacySetting = async function(key, value) {
    try {
        const body = {};
        body[key] = value;
        const res = await dbPut(`users/${currentUser.username}/profile`, body);
        if (res && res.user) {
            currentUser = { ...currentUser, ...res.user };
            showToast('Privacy setting updated successfully!');
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

// Call on load
initTheme();
