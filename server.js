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
let lastConnectionFailure = 0;
const FAILURE_COOLDOWN = 60000; // 1 minute cooldown

async function connectToDatabase() {
    if (mongoose.connection.readyState === 1) {
        return Promise.resolve();
    }
    if (Date.now() - lastConnectionFailure < FAILURE_COOLDOWN) {
        throw new Error('Database is offline (connection cooldown active)');
    }
    if (!cachedConnectionPromise) {
        console.log('Initiating MongoDB connection...');
        cachedConnectionPromise = mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 3000 // Fail fast within 3s if MongoDB is down
        })
            .then(() => {
                console.log(`\n✅ Connected to MongoDB successfully! [URI: ${MONGODB_URI.startsWith('mongodb://127.0.0.1') ? 'Local Database' : 'Cloud Database'}]\n`);
            })
            .catch(err => {
                cachedConnectionPromise = null; // Reset on failure so next request can retry
                lastConnectionFailure = Date.now();
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
    designation: { type: String, default: '' }, // e.g. 'Professor', 'Lecturer'
    publicationsCount: { type: Number, default: 0 },
    education: { type: String, default: '' }, // e.g. 'Ph.D', 'Post-Doc'
    jobStatus: { type: String, default: '' }, // e.g. 'Active', 'Visiting'
    
    // Privacy settings fields
    phoneVisible: { type: Boolean, default: false },
    allowComments: { type: String, default: 'everyone' }, // 'everyone', 'faculty', 'none'
    allowDownloads: { type: Boolean, default: true },
    showAppreciations: { type: Boolean, default: true },
    connections: { type: [String], default: [] },
    
    // Wave 4 expanded privacy & customization settings
    phonePrivacy: { type: String, default: 'none' }, // 'everyone', 'connections', 'faculty', 'none'
    profileStealth: { type: Boolean, default: false },
    showIndividualGraphs: { type: Boolean, default: true },
    statusPrivacy: { type: String, default: 'everyone' }, // 'everyone', 'connections', 'none'
    connectionPolicy: { type: String, default: 'everyone' }, // 'everyone', 'same_batch', 'faculty_only'
    tagline: { type: String, default: '' },
    lastActive: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const storySchema = new mongoose.Schema({
    id: { type: String, required: true },
    username: { type: String, required: true },
    name: { type: String, required: true },
    profilePic: { type: String, default: '' },
    text: { type: String, required: true },
    image: { type: String, default: '' },
    visibility: { type: String, default: 'everyone' },
    timestamp: { type: Number, required: true }
});
const Story = mongoose.model('Story', storySchema);

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
    reactions: {
        type: [
            {
                username: String,
                type: { type: String } // 'like', 'love', 'celebrate', 'insight', 'respect'
            }
        ],
        default: []
    },
    comments: { type: [commentSchema], default: [] },
    originalAuthor: { type: String },
    authorBatch: { type: String },
    visibility: { type: String, default: 'everyone' },
    targetProgram: { type: String, default: 'all' },
    targetBatch: { type: String, default: 'all' },
    targetSemester: { type: String, default: 'all' },
    poll: {
        question: { type: String },
        options: [
            {
                text: { type: String },
                votes: { type: [String], default: [] }
            }
        ]
    },
    views: { type: [String], default: [] }
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
    ],
    visibility: { type: String, default: 'everyone' },
    targetProgram: { type: String, default: 'all' },
    targetBatch: { type: String, default: 'all' },
    targetSemester: { type: String, default: 'all' },
    views: { type: [String], default: [] }
});
const Software = mongoose.model('Software', softwareSchema);

const jobSchema = new mongoose.Schema({
    id: { type: Number, required: true, default: Date.now },
    title: { type: String, required: true },
    company: { type: String, required: true },
    type: { type: String, default: 'Full Time' }, // Contractual, Full Time, Part Time, Internship
    location: { type: String, default: 'Pakistan' },
    salary: { type: String, default: 'Competitive' },
    desc: { type: String, required: true },
    link: { type: String, default: '' },
    date: { type: String, required: true },
    author: { type: String, required: true },
    likes: { type: [String], default: [] },
    comments: { type: [commentSchema], default: [] }
});
const Job = mongoose.model('Job', jobSchema);

const eventSchema = new mongoose.Schema({
    id: { type: Number, required: true, default: Date.now },
    title: { type: String, required: true },
    desc: { type: String, required: true },
    date: { type: String, required: true },
    location: { type: String, default: 'UOG Campus' },
    registeredUsers: { type: [String], default: [] }, // array of usernames
    author: { type: String, required: true },
    likes: { type: [String], default: [] },
    comments: { type: [commentSchema], default: [] }
});
const Event = mongoose.model('Event', eventSchema);

const electionSchema = new mongoose.Schema({
    id: { type: Number, required: true, default: Date.now },
    title: { type: String, required: true },
    candidates: [
        {
            name: { type: String, required: true },
            role: { type: String, required: true },
            photo: { type: String, default: '' }, // base64
            votes: { type: [String], default: [] } // usernames who voted
        }
    ],
    status: { type: String, default: 'active' } // active, closed
});
const Election = mongoose.model('Election', electionSchema);

const messageSchema = new mongoose.Schema({
    id: { type: Number, required: true, default: Date.now },
    sender: { type: String, required: true },
    recipient: { type: String, required: true },
    text: { type: String, required: true },
    media: { type: String, default: '' },
    read: { type: Boolean, default: false },
    timestamp: { type: Number, required: true, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

const transactionSchema = new mongoose.Schema({
    id: { type: Number, required: true, default: Date.now },
    username: { type: String, required: true },
    amount: { type: String, required: true },
    purpose: { type: String, required: true },
    status: { type: String, default: 'Paid' }, // Paid, Pending
    date: { type: String, required: true }
});
const Transaction = mongoose.model('Transaction', transactionSchema);

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
        const { username, password, name, role, phone, program, batch, designation, publicationsCount, education, jobStatus } = req.body;
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
            designation: designation || '',
            publicationsCount: Number(publicationsCount) || 0,
            education: education || '',
            jobStatus: jobStatus || '',
            phoneVisible: false,
            allowComments: 'everyone',
            allowDownloads: true,
            showAppreciations: true,
            phonePrivacy: 'none',
            profileStealth: false,
            statusPrivacy: 'everyone',
            connectionPolicy: 'everyone',
            tagline: '',
            lastActive: new Date()
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
        const { name, phone, password, profilePic, program, batch, phoneVisible, allowComments, allowDownloads, showAppreciations, phonePrivacy, profileStealth, statusPrivacy, connectionPolicy, tagline, designation, publicationsCount, education, jobStatus, showIndividualGraphs, showPublicationsChart, showStandingChart, showShareChart } = req.body;
        const user = await User.findOne({ username: req.params.username.toLowerCase().trim() });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        if (name) user.name = name;
        if (phone !== undefined) user.phone = phone;
        if (password) user.password = password;
        if (profilePic !== undefined) user.profilePic = profilePic;
        if (program !== undefined) user.program = program;
        if (batch !== undefined) user.batch = batch;
        if (designation !== undefined) user.designation = designation;
        if (publicationsCount !== undefined) user.publicationsCount = Number(publicationsCount) || 0;
        if (education !== undefined) user.education = education;
        if (jobStatus !== undefined) user.jobStatus = jobStatus;
        if (showIndividualGraphs !== undefined) user.showIndividualGraphs = showIndividualGraphs;
        if (showPublicationsChart !== undefined) user.showPublicationsChart = showPublicationsChart;
        if (showStandingChart !== undefined) user.showStandingChart = showStandingChart;
        if (showShareChart !== undefined) user.showShareChart = showShareChart;
        
        if (phoneVisible !== undefined) user.phoneVisible = phoneVisible;
        if (allowComments !== undefined) user.allowComments = allowComments;
        if (allowDownloads !== undefined) user.allowDownloads = allowDownloads;
        if (showAppreciations !== undefined) user.showAppreciations = showAppreciations;
        
        if (phonePrivacy !== undefined) user.phonePrivacy = phonePrivacy;
        if (profileStealth !== undefined) user.profileStealth = profileStealth;
        if (statusPrivacy !== undefined) user.statusPrivacy = statusPrivacy;
        if (connectionPolicy !== undefined) user.connectionPolicy = connectionPolicy;
        if (tagline !== undefined) user.tagline = tagline;
        
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
        const { author, name, role, category, text, files, originalAuthor, authorBatch, visibility, poll, targetProgram, targetBatch, targetSemester } = req.body;
        if (!text || !category) return res.status(400).json({ error: 'Missing fields' });
        
        const post = new Post({
            id: Date.now(),
            author,
            name,
            role,
            category,
            text,
            date: new Date().toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' }),
            files: files || [],
            originalAuthor,
            authorBatch,
            visibility: visibility || 'everyone',
            targetProgram: targetProgram || 'all',
            targetBatch: targetBatch || 'all',
            targetSemester: targetSemester || 'all',
            poll
        });
        await post.save();
        res.json(post);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error creating post' });
    }
});

app.post('/api/posts/:id/vote', async (req, res) => {
    try {
        const { optionIndex, username } = req.body;
        if (optionIndex === undefined || !username) {
            return res.status(400).json({ error: 'Missing optionIndex or username' });
        }
        const post = await Post.findOne({ id: Number(req.params.id) });
        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (!post.poll) return res.status(400).json({ error: 'Post has no poll' });
        
        // Remove username from all other options in this poll (to allow vote switching)
        post.poll.options.forEach((opt, idx) => {
            opt.votes = opt.votes.filter(u => u !== username);
        });
        
        // Add vote to target option
        if (post.poll.options[optionIndex]) {
            post.poll.options[optionIndex].votes.push(username);
        }
        
        post.markModified('poll');
        await post.save();
        res.json(post);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error casting vote' });
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

app.post('/api/posts/:id/react', async (req, res) => {
    try {
        const { username, reactionType } = req.body; // 'like', 'love', 'celebrate', 'insight', 'respect'
        if (!username || !reactionType) return res.status(400).json({ error: 'Missing username or reactionType' });
        
        const post = await Post.findOne({ id: Number(req.params.id) });
        if (!post) return res.status(404).json({ error: 'Post not found' });
        
        if (!post.reactions) post.reactions = [];
        
        const existingIdx = post.reactions.findIndex(r => r.username === username);
        if (existingIdx !== -1) {
            const currentReaction = post.reactions[existingIdx].type;
            if (currentReaction === reactionType) {
                // If same reaction, remove it (unreact)
                post.reactions.splice(existingIdx, 1);
            } else {
                // If different reaction, update it
                post.reactions[existingIdx].type = reactionType;
            }
        } else {
            // Add new reaction
            post.reactions.push({ username, type: reactionType });
        }
        
        // Sync legacy likes array so backwards compatibility doesn't break
        post.likes = post.reactions.map(r => r.username);
        
        await post.save();
        res.json({ reactions: post.reactions, likes: post.likes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error toggling reaction' });
    }
});

// ── STORIES ───────────────────────────────────────────────────────────────────
app.get('/api/stories', async (req, res) => {
    try {
        // Clear stories older than 24 hours
        const oneDayAgo = Date.now() - 24 * 3600 * 1000;
        await Story.deleteMany({ timestamp: { $lt: oneDayAgo } });
        
        const stories = await Story.find({}).sort({ timestamp: -1 });
        res.json(stories);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching stories' });
    }
});

app.post('/api/stories', async (req, res) => {
    try {
        const { id, username, name, profilePic, text, image, visibility, timestamp } = req.body;
        if (!text || !username) return res.status(400).json({ error: 'Missing fields' });
        
        // Remove previous story from same user if any
        await Story.deleteMany({ username });
        
        const story = new Story({
            id: id || 'user-' + Date.now(),
            username,
            name,
            profilePic: profilePic || '',
            text,
            image: image || '',
            visibility: visibility || 'everyone',
            timestamp: timestamp || Date.now()
        });
        await story.save();
        res.json(story);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error creating story' });
    }
});

app.delete('/api/stories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Story.deleteOne({ id });
        res.json({ success: true, message: 'Story deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error deleting story' });
    }
});

app.post('/api/users/:username/heartbeat', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username.toLowerCase().trim() });
        if (user) {
            user.lastActive = new Date();
            await user.save();
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Heartbeat error' });
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
        const { author, name, title, desc, link, files, visibility, targetProgram, targetBatch, targetSemester } = req.body;
        if (!title || !desc) return res.status(400).json({ error: 'Missing fields' });
        
        const sw = new Software({
            id: Date.now(),
            author,
            name,
            title,
            desc,
            link: link || '',
            date: new Date().toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' }),
            files: files || [],
            visibility: visibility || 'everyone',
            targetProgram: targetProgram || 'all',
            targetBatch: targetBatch || 'all',
            targetSemester: targetSemester || 'all',
            views: []
        });
        await sw.save();
        res.json(sw);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error creating software entry' });
    }
});

app.post('/api/posts/:id/view', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Missing username' });
        const post = await Post.findOne({ id: Number(req.params.id) });
        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (!post.views) post.views = [];
        if (!post.views.includes(username)) {
            post.views.push(username);
            await post.save();
        }
        res.json({ views: post.views });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error recording post view' });
    }
});

app.post('/api/software/:id/view', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Missing username' });
        const sw = await Software.findOne({ id: Number(req.params.id) });
        if (!sw) return res.status(404).json({ error: 'Software not found' });
        if (!sw.views) sw.views = [];
        if (!sw.views.includes(username)) {
            sw.views.push(username);
            await sw.save();
        }
        res.json({ views: sw.views });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error recording software view' });
    }
});

// ── JOBS ──────────────────────────────────────────────────────────────────────
app.get('/api/jobs', async (req, res) => {
    try {
        const jobs = await Job.find({}).sort({ id: -1 });
        res.json(jobs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching jobs' });
    }
});

app.post('/api/jobs', async (req, res) => {
    try {
        const { title, company, type, location, salary, desc, link, author } = req.body;
        if (!title || !company || !desc || !author) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const job = new Job({
            id: Date.now(),
            title,
            company,
            type: type || 'Full Time',
            location: location || 'Pakistan',
            salary: salary || 'Competitive',
            desc,
            link: link || '',
            date: new Date().toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' }),
            author,
            likes: [],
            comments: []
        });
        await job.save();
        res.json(job);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error creating job' });
    }
});

app.put('/api/jobs/:id', async (req, res) => {
    try {
        const { title, company, type, location, salary, desc, link } = req.body;
        const job = await Job.findOne({ id: Number(req.params.id) });
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        job.title = title || job.title;
        job.company = company || job.company;
        job.type = type || job.type;
        job.location = location || job.location;
        job.salary = salary || job.salary;
        job.desc = desc || job.desc;
        job.link = link || job.link;
        
        await job.save();
        res.json(job);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error updating job' });
    }
});

app.delete('/api/jobs/:id', async (req, res) => {
    try {
        const resJob = await Job.deleteOne({ id: Number(req.params.id) });
        if (resJob.deletedCount === 0) return res.status(404).json({ error: 'Job not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error deleting job' });
    }
});

app.post('/api/jobs/:id/like', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Missing username' });
        const job = await Job.findOne({ id: Number(req.params.id) });
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        if (!job.likes) job.likes = [];
        const idx = job.likes.indexOf(username);
        if (idx !== -1) {
            job.likes.splice(idx, 1);
        } else {
            job.likes.push(username);
        }
        await job.save();
        res.json(job);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error toggling like' });
    }
});

app.post('/api/jobs/:id/comments', async (req, res) => {
    try {
        const { author, name, role, text } = req.body;
        if (!author || !name || !role || !text) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const job = await Job.findOne({ id: Number(req.params.id) });
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        const comment = {
            author,
            name,
            role,
            text,
            date: new Date().toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' })
        };
        if (!job.comments) job.comments = [];
        job.comments.push(comment);
        await job.save();
        res.json(job);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error adding comment' });
    }
});

app.delete('/api/jobs/:id/comments/:commentId', async (req, res) => {
    try {
        const job = await Job.findOne({ id: Number(req.params.id) });
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        if (!job.comments) job.comments = [];
        job.comments = job.comments.filter(c => String(c._id || c.id) !== String(req.params.commentId));
        await job.save();
        res.json(job);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error deleting comment' });
    }
});

// ── EVENTS ────────────────────────────────────────────────────────────────────
app.get('/api/events', async (req, res) => {
    try {
        const events = await Event.find({}).sort({ id: -1 });
        res.json(events);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching events' });
    }
});

app.post('/api/events', async (req, res) => {
    try {
        const { title, desc, date, location, author } = req.body;
        if (!title || !desc || !date || !author) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const event = new Event({
            id: Date.now(),
            title,
            desc,
            date,
            location: location || 'UOG Stats Department',
            registeredUsers: [],
            author,
            likes: [],
            comments: []
        });
        await event.save();
        res.json(event);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error creating event' });
    }
});

app.put('/api/events/:id', async (req, res) => {
    try {
        const { title, desc, date, location } = req.body;
        const event = await Event.findOne({ id: Number(req.params.id) });
        if (!event) return res.status(404).json({ error: 'Event not found' });
        
        event.title = title || event.title;
        event.desc = desc || event.desc;
        event.date = date || event.date;
        event.location = location || event.location;
        
        await event.save();
        res.json(event);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error updating event' });
    }
});

app.delete('/api/events/:id', async (req, res) => {
    try {
        const resEv = await Event.deleteOne({ id: Number(req.params.id) });
        if (resEv.deletedCount === 0) return res.status(404).json({ error: 'Event not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error deleting event' });
    }
});

app.post('/api/events/:id/register', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Missing username' });
        const event = await Event.findOne({ id: Number(req.params.id) });
        if (!event) return res.status(404).json({ error: 'Event not found' });
        
        const idx = event.registeredUsers.indexOf(username);
        if (idx !== -1) {
            event.registeredUsers.splice(idx, 1); // Unregister
        } else {
            event.registeredUsers.push(username); // Register
        }
        await event.save();
        res.json(event);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error modifying event registration' });
    }
});

app.post('/api/events/:id/like', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Missing username' });
        const event = await Event.findOne({ id: Number(req.params.id) });
        if (!event) return res.status(404).json({ error: 'Event not found' });
        
        if (!event.likes) event.likes = [];
        const idx = event.likes.indexOf(username);
        if (idx !== -1) {
            event.likes.splice(idx, 1);
        } else {
            event.likes.push(username);
        }
        await event.save();
        res.json(event);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error toggling like' });
    }
});

app.post('/api/events/:id/comments', async (req, res) => {
    try {
        const { author, name, role, text } = req.body;
        if (!author || !name || !role || !text) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const event = await Event.findOne({ id: Number(req.params.id) });
        if (!event) return res.status(404).json({ error: 'Event not found' });
        
        const comment = {
            author,
            name,
            role,
            text,
            date: new Date().toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' })
        };
        if (!event.comments) event.comments = [];
        event.comments.push(comment);
        await event.save();
        res.json(event);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error adding comment' });
    }
});

app.delete('/api/events/:id/comments/:commentId', async (req, res) => {
    try {
        const event = await Event.findOne({ id: Number(req.params.id) });
        if (!event) return res.status(404).json({ error: 'Event not found' });
        
        if (!event.comments) event.comments = [];
        event.comments = event.comments.filter(c => String(c._id || c.id) !== String(req.params.commentId));
        await event.save();
        res.json(event);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error deleting comment' });
    }
});

// ── ELECTIONS ─────────────────────────────────────────────────────────────────
app.get('/api/elections', async (req, res) => {
    try {
        const elections = await Election.find({}).sort({ id: -1 });
        res.json(elections);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching elections' });
    }
});

app.post('/api/elections', async (req, res) => {
    try {
        const { title, candidates } = req.body; // candidates array of { name, role, photo }
        if (!title || !candidates || candidates.length === 0) {
            return res.status(400).json({ error: 'Election title and candidates are required' });
        }
        const election = new Election({
            id: Date.now(),
            title,
            candidates: candidates.map(c => ({
                name: c.name,
                role: c.role || 'Candidate',
                photo: c.photo || '',
                votes: []
            })),
            status: 'active'
        });
        await election.save();
        res.json(election);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error creating election' });
    }
});

app.post('/api/elections/:id/vote', async (req, res) => {
    try {
        const { candidateIndex, candidateName, username } = req.body;
        if (!username) {
            return res.status(400).json({ error: 'Missing username' });
        }
        const election = await Election.findOne({ id: Number(req.params.id) });
        if (!election) return res.status(404).json({ error: 'Election not found' });
        if (election.status !== 'active') return res.status(400).json({ error: 'Election is closed' });

        // Resolve candidate index
        let resolvedIdx = candidateIndex;
        if (resolvedIdx === undefined && candidateName) {
            resolvedIdx = election.candidates.findIndex(c => c.name === candidateName);
        }

        if (resolvedIdx === undefined || resolvedIdx === -1) {
            return res.status(400).json({ error: 'Missing or invalid candidate' });
        }

        // Ensure user hasn't voted for ANY candidate in this election
        let alreadyVoted = false;
        election.candidates.forEach(cand => {
            if (cand.votes && cand.votes.includes(username)) {
                alreadyVoted = true;
            }
        });

        if (alreadyVoted) {
            return res.status(400).json({ error: 'You have already cast your vote in this election' });
        }

        // Add vote to the chosen candidate
        if (election.candidates[resolvedIdx]) {
            if (!election.candidates[resolvedIdx].votes) {
                election.candidates[resolvedIdx].votes = [];
            }
            election.candidates[resolvedIdx].votes.push(username);
        }
        election.markModified('candidates');
        await election.save();
        res.json(election);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error casting vote' });
    }
});

// ── MESSAGES ──────────────────────────────────────────────────────────────────
app.get('/api/messages', async (req, res) => {
    try {
        const user1 = req.query.user1 || req.query.sender;
        const user2 = req.query.user2 || req.query.receiver || req.query.recipient;
        if (user1 && user2) {
            const msgs = await Message.find({
                $or: [
                    { sender: user1, recipient: user2 },
                    { sender: user2, recipient: user1 }
                ]
            }).sort({ timestamp: 1 });
            return res.json(msgs);
        }
        const msgs = await Message.find({}).sort({ timestamp: 1 });
        res.json(msgs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching messages' });
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const sender = req.body.sender;
        const recipient = req.body.recipient || req.body.receiver;
        const text = req.body.text || '';
        const media = req.body.media || '';
        
        if (!sender || !recipient || (!text && !media)) {
            return res.status(400).json({ error: 'Missing sender, recipient, or content' });
        }
        const message = new Message({
            id: Date.now(),
            sender,
            recipient,
            text,
            media,
            read: false,
            timestamp: Date.now()
        });
        await message.save();
        res.json(message);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error sending message' });
    }
});

app.post('/api/messages/mark-read', async (req, res) => {
    try {
        const { sender, recipient } = req.body;
        if (!sender || !recipient) {
            return res.status(400).json({ error: 'Missing sender or recipient' });
        }
        // Mark all messages sent BY 'sender' TO 'recipient' as read
        await Message.updateMany(
            { sender: sender, recipient: recipient, read: false },
            { $set: { read: true } }
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error marking messages as read' });
    }
});

// ── TRANSACTIONS ──────────────────────────────────────────────────────────────
app.get('/api/transactions', async (req, res) => {
    try {
        const { username } = req.query;
        let query = {};
        if (username) {
            query.username = username;
        }
        const txs = await Transaction.find(query).sort({ id: -1 });
        res.json(txs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error fetching transactions' });
    }
});

app.post('/api/transactions', async (req, res) => {
    try {
        const { username, amount, purpose, status } = req.body;
        if (!username || !amount || !purpose) {
            return res.status(400).json({ error: 'Missing required transaction fields' });
        }
        const tx = new Transaction({
            id: Date.now(),
            username,
            amount,
            purpose,
            status: status || 'Paid',
            date: new Date().toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' })
        });
        await tx.save();
        res.json(tx);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error creating transaction' });
    }
});

// ── Start Server ──────────────────────────────────────────────────────────────
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n✅ UOG Stats Portal running at: http://localhost:${PORT}\n`);
    });
}

module.exports = app;

