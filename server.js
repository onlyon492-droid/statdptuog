require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const mongoose = require('mongoose');

const app  = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/uog_stats_portal';

// ── Connect to MongoDB (Serverless Caching Pattern) ──────────────────────────
let cachedConnectionPromise = null;

function connectToDatabase() {
    if (mongoose.connection.readyState === 1) {
        return Promise.resolve();
    }
    if (!cachedConnectionPromise) {
        console.log('Initiating MongoDB connection...');
        cachedConnectionPromise = mongoose.connect(MONGODB_URI)
            .then(() => {
                console.log(`\n✅ Connected to MongoDB successfully! [URI: ${MONGODB_URI.startsWith('mongodb://127.0.0.1') ? 'Local Database' : 'Cloud Database'}]\n`);
            })
            .catch(err => {
                cachedConnectionPromise = null; // Reset on failure so next request can retry
                console.error('\n❌ MongoDB Connection Error:', err.message);
                throw err;
            });
    }
    return cachedConnectionPromise;
}

// Trigger initial connection in background
connectToDatabase().catch(() => {});

// ── Schemas & Models ──────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, required: true },
    phone: { type: String, default: '' },
    profilePic: { type: String, default: '' }, // holds base64
    program: { type: String, default: '' }, // e.g. 'BS Statistics', 'BS Data Analytics'
    batch: { type: String, default: '' }, // e.g. '2022-2026'
    
    // Privacy settings fields
    phoneVisible: { type: Boolean, default: false },
    allowComments: { type: String, default: 'everyone' }, // 'everyone', 'faculty', 'none'
    allowDownloads: { type: Boolean, default: true },
    showAppreciations: { type: Boolean, default: true }
});
const User = mongoose.model('User', userSchema);

const batchSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});
const Batch = mongoose.model('Batch', batchSchema);

const commentSchema = new mongoose.Schema({
    author: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, required: true },
    text: { type: String, required: true },
    date: { type: String, required: true }
});

const postSchema = new mongoose.Schema({
    id: { type: Number, required: true, default: Date.now }, // custom ID to match frontend app.js
    author: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, required: true },
    category: { type: String, required: true },
    text: { type: String, required: true },
    date: { type: String, required: true },
    files: [
        {
            type: { type: String },
            data: { type: String },
            name: { type: String }
        }
    ],
    likes: { type: [String], default: [] },
    comments: { type: [commentSchema], default: [] }
});
const Post = mongoose.model('Post', postSchema);

const softwareSchema = new mongoose.Schema({
    id: { type: Number, required: true, default: Date.now }, // custom ID to match frontend app.js
    author: { type: String, required: true },
    name: { type: String, required: true },
    title: { type: String, required: true },
    desc: { type: String, required: true },
    link: { type: String, default: '' },
    date: { type: String, required: true },
    files: [
        {
            type: { type: String },
            data: { type: String },
            name: { type: String }
        }
    ]
});
const Software = mongoose.model('Software', softwareSchema);

function safeUser(u) {
    if (!u) return null;
    const { password, __v, _id, ...safe } = u;
    return safe;
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));      // allow base64 image uploads
app.use(express.static(__dirname));            // serve index.html, styles.css, app.js

// Check MongoDB connection state before processing any API requests
app.use('/api', async (req, res, next) => {
    try {
        await connectToDatabase();
        next();
    } catch (err) {
        return res.status(503).json({
            error: `Database connection error: ${err.message}. If running locally, make sure MongoDB is running. If hosting on the Internet, verify your MONGODB_URI variable in Vercel and check MongoDB Atlas Network Access (Allow IP 0.0.0.0/0).`
        });
    }
});


// ── USERS ─────────────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, name, role, phone, program, batch } = req.body;
        if (!username || !password || !name || !role) return res.status(400).json({ error: 'Missing fields' });

        const normalizedUsername = username.toLowerCase().trim();
        // Validation
        if (role === 'Student' && !normalizedUsername.includes('uog'))
            return res.status(400).json({ error: "Roll Number must contain 'UOG'" });
        if (role === 'Faculty' && !normalizedUsername.endsWith('@uog.edu.pk'))
            return res.status(400).json({ error: "Faculty must use @uog.edu.pk email" });

        const existingUser = await User.findOne({ username: normalizedUsername });
        if (existingUser)
            return res.status(409).json({ error: 'Account already exists' });

        const user = new User({
            username: normalizedUsername,
            password,
            name,
            role,
            phone: phone || '',
            profilePic: '',
            program: program || '',
            batch: batch || '',
            phoneVisible: false,
            allowComments: 'everyone',
            allowDownloads: true,
            showAppreciations: true
        });
        await user.save();
        res.json({ message: 'Registered successfully', user: safeUser(user.toObject()) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error during registration' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

        const user = await User.findOne({ username: username.toLowerCase().trim(), password });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        res.json({ message: 'Login successful', user: safeUser(user.toObject()) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error during login' });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({});
        res.json(users.map(u => safeUser(u.toObject())));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching users' });
    }
});

app.put('/api/users/:username/profile', async (req, res) => {
    try {
        const { name, phone, password, profilePic, program, batch, phoneVisible, allowComments, allowDownloads, showAppreciations } = req.body;
        const user = await User.findOne({ username: req.params.username.toLowerCase().trim() });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        if (name) user.name = name;
        if (phone !== undefined) user.phone = phone;
        if (password) user.password = password;
        if (profilePic !== undefined) user.profilePic = profilePic;
        if (program !== undefined) user.program = program;
        if (batch !== undefined) user.batch = batch;
        
        if (phoneVisible !== undefined) user.phoneVisible = phoneVisible;
        if (allowComments !== undefined) user.allowComments = allowComments;
        if (allowDownloads !== undefined) user.allowDownloads = allowDownloads;
        if (showAppreciations !== undefined) user.showAppreciations = showAppreciations;
        
        await user.save();
        res.json({ message: 'Profile updated', user: safeUser(user.toObject()) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error updating profile' });
    }
});

app.delete('/api/users/:username/posts', async (req, res) => {
    try {
        const username = req.params.username.toLowerCase().trim();
        await Post.deleteMany({ author: username });
        res.json({ message: 'All posts deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error deleting posts' });
    }
});

// ── BATCHES ───────────────────────────────────────────────────────────────────
app.get('/api/batches', async (req, res) => {
    try {
        let batches = await Batch.find({}).sort({ name: 1 });
        if (batches.length === 0) {
            const defaults = ['2020-2024', '2021-2025', '2022-2026', '2023-2027'];
            await Batch.insertMany(defaults.map(b => ({ name: b })));
            batches = await Batch.find({}).sort({ name: 1 });
        }
        res.json(batches);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching batches' });
    }
});

app.post('/api/batches', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Batch name required' });
        const trimmed = name.trim();
        let existing = await Batch.findOne({ name: trimmed });
        if (!existing) {
            const newBatch = new Batch({ name: trimmed });
            await newBatch.save();
        }
        const allBatches = await Batch.find({}).sort({ name: 1 });
        res.json(allBatches);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error saving batch' });
    }
});

// ── POSTS ─────────────────────────────────────────────────────────────────────
app.get('/api/posts', async (req, res) => {
    try {
        const posts = await Post.find({}).sort({ id: -1 });
        res.json(posts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching posts' });
    }
});

app.post('/api/posts', async (req, res) => {
    try {
        const { author, name, role, category, text, files } = req.body;
        if (!text || !category) return res.status(400).json({ error: 'Missing fields' });
        
        const post = new Post({
            id: Date.now(),
            author,
            name,
            role,
            category,
            text,
            date: new Date().toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' }),
            files: files || []
        });
        await post.save();
        res.json(post);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error creating post' });
    }
});

app.put('/api/posts/:id', async (req, res) => {
    try {
        const { text, author } = req.body;
        const post = await Post.findOne({ id: Number(req.params.id) });
        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (post.author !== author) return res.status(403).json({ error: 'Not your post' });
        
        post.text = text;
        await post.save();
        res.json(post);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error updating post' });
    }
});

app.delete('/api/posts/:id', async (req, res) => {
    try {
        const { author } = req.body;
        const post = await Post.findOne({ id: Number(req.params.id) });
        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (post.author !== author) return res.status(403).json({ error: 'Not your post' });
        
        await Post.deleteOne({ id: Number(req.params.id) });
        res.json({ message: 'Deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error deleting post' });
    }
});

app.post('/api/posts/:id/like', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Missing username' });
        
        const post = await Post.findOne({ id: Number(req.params.id) });
        if (!post) return res.status(404).json({ error: 'Post not found' });
        
        if (!post.likes) post.likes = [];
        
        const idx = post.likes.indexOf(username);
        if (idx !== -1) {
            post.likes.splice(idx, 1); // unlike
        } else {
            post.likes.push(username); // like
        }
        
        await post.save();
        res.json({ likes: post.likes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error toggling like' });
    }
});

app.post('/api/posts/:id/comment', async (req, res) => {
    try {
        const { author, name, role, text } = req.body;
        if (!author || !name || !role || !text) return res.status(400).json({ error: 'Missing fields' });
        
        const post = await Post.findOne({ id: Number(req.params.id) });
        if (!post) return res.status(404).json({ error: 'Post not found' });

        // Retrieve post author's privacy controls to check commenting bounds
        const postAuthorUser = await User.findOne({ username: post.author });
        const postAllowComments = postAuthorUser && postAuthorUser.allowComments ? postAuthorUser.allowComments : 'everyone';

        if (postAllowComments === 'none') {
            return res.status(403).json({ error: 'Commenting is disabled for this post' });
        } else if (postAllowComments === 'faculty' && role !== 'Faculty') {
            return res.status(403).json({ error: 'Only faculty members can comment on this post' });
        }
        
        if (!post.comments) post.comments = [];
        
        const comment = {
            author,
            name,
            role,
            text,
            date: new Date().toLocaleDateString('en-PK', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
        };
        post.comments.push(comment);
        
        await post.save();
        res.json(post.comments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error adding comment' });
    }
});

// ── SOFTWARE ──────────────────────────────────────────────────────────────────
app.get('/api/software', async (req, res) => {
    try {
        const swList = await Software.find({}).sort({ id: -1 });
        res.json(swList);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching software list' });
    }
});

app.post('/api/software', async (req, res) => {
    try {
        const { author, name, title, desc, link, files } = req.body;
        if (!title || !desc) return res.status(400).json({ error: 'Missing fields' });
        
        const sw = new Software({
            id: Date.now(),
            author,
            name,
            title,
            desc,
            link: link || '',
            date: new Date().toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' }),
            files: files || []
        });
        await sw.save();
        res.json(sw);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error creating software entry' });
    }
});

// ── Start Server ──────────────────────────────────────────────────────────────
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n✅ UOG Stats Portal running at: http://localhost:${PORT}\n`);
    });
}

module.exports = app;

