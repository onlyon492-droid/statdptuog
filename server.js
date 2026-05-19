require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const mongoose = require('mongoose');

const app  = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/uog_stats_portal';

// ── Connect to MongoDB ────────────────────────────────────────────────────────
mongoose.connect(MONGODB_URI)
    .then(() => console.log(`\n✅ Connected to MongoDB successfully! [URI: ${MONGODB_URI.startsWith('mongodb://127.0.0.1') ? 'Local Database' : 'Cloud Database'}]\n`))
    .catch(err => {
        console.error('\n❌ MongoDB Connection Error:');
        console.error(err.message);
        console.log('\n💡 Tip: To run locally, make sure MongoDB is installed & running.');
        console.log('👉 To run on the Internet, please create a .env file in the project folder and add your Cloud Database URL like this:');
        console.log('   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname\n');
    });

// ── Schemas & Models ──────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, required: true },
    phone: { type: String, default: '' },
    profilePic: { type: String, default: '' } // holds base64
});
const User = mongoose.model('User', userSchema);

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
    ]
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
app.use('/api', (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            error: "Database connection is not established. If running locally, make sure MongoDB is installed & running. If hosting on the Internet, please configure MONGODB_URI in your environment."
        });
    }
    next();
});


// ── USERS ─────────────────────────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, name, role, phone } = req.body;
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
            profilePic: ''
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
        const { name, phone, password, profilePic } = req.body;
        const user = await User.findOne({ username: req.params.username.toLowerCase().trim() });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        if (name) user.name = name;
        if (phone !== undefined) user.phone = phone;
        if (password) user.password = password;
        if (profilePic !== undefined) user.profilePic = profilePic;
        
        await user.save();
        res.json({ message: 'Profile updated', user: safeUser(user.toObject()) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error updating profile' });
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

