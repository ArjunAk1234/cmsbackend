require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- Config ---
const PORT = process.env.PORT || 5000;

// Use your SUPABASE_URL and the SUPABASE_ANON_KEY (not the service_role key for basic auth)
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_KEY
);

// --- Auth Middleware ---
const protect = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Access Denied" });

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return res.status(403).json({ message: "Invalid or expired token" });
    }

    req.user = user; // Add user info to request
    next();
};

// --- 1. AUTH API ---
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    // Use Supabase built-in Auth
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return res.status(400).json({ message: error.message });
    }

    // Return the session (contains access_token)
    res.json({
        token: data.session.access_token,
        user: data.user
    });
});

// --- 2. PUBLIC PORTFOLIO API (Read-Only) ---
app.get('/api/about', async (req, res) => {
    const { data } = await supabase.from('about').select('*').single();
    res.json(data);
});

const publicGet = (table) => async (req, res) => {
    const { data } = await supabase.from(table).select('*').order('id', { ascending: true });
    res.json(data);
};

app.get('/api/skills', publicGet('skills'));
app.get('/api/projects', publicGet('projects'));
app.get('/api/blogs', publicGet('blogs'));
app.get('/api/experience', publicGet('experience'));
app.get('/api/testimonials', publicGet('testimonials'));
app.get('/api/services', publicGet('services'));

app.post('/api/contact', async (req, res) => {
    const { error } = await supabase.from('messages').insert([req.body]);
    if (error) return res.status(400).json(error);
    res.json({ message: "Sent!" });
});


// --- 3. ADMIN CMS API (Protected) ---
const setupAdminCRUD = (table) => {
    app.get(`/api/admin/${table}`, protect, async (req, res) => {
        const { data } = await supabase.from(table).select('*').order('id', { ascending: false });
        res.json(data);
    });

    app.post(`/api/admin/${table}`, protect, async (req, res) => {
        const { data, error } = await supabase.from(table).insert([req.body]).select();
        if (error) return res.status(400).json(error);
        res.status(201).json(data[0]);
    });

    app.put(`/api/admin/${table}/:id`, protect, async (req, res) => {
        const { data, error } = await supabase.from(table).update(req.body).eq('id', req.params.id).select();
        if (error) return res.status(400).json(error);
        res.json(data[0]);
    });

    app.delete(`/api/admin/${table}/:id`, protect, async (req, res) => {
        const { error } = await supabase.from(table).delete().eq('id', req.params.id);
        if (error) return res.status(400).json(error);
        res.json({ message: "Deleted successfully" });
    });
};

['skills', 'projects', 'blogs', 'experience', 'testimonials', 'services'].forEach(setupAdminCRUD);

app.put('/api/admin/about', protect, async (req, res) => {
    const { data, error } = await supabase.from('about').update(req.body).eq('id', 1).select();
    if (error) return res.status(400).json(error);
    res.json(data[0]);
});

// app.get('/api/admin/messages', protect, async (req, res) => {
//     const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: false });
//     res.json(data);
// });
// Get all contact messages (Protected)
app.get('/api/admin/messages', authenticateToken, async (req, res) => {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) return res.status(400).json(error);
    res.json(data);
});

// Delete a message (Protected)
app.delete('/api/admin/messages/:id', authenticateToken, async (req, res) => {
    const { error } = await supabase.from('messages').delete().eq('id', req.params.id);
    if (error) return res.status(400).json(error);
    res.json({ message: "Message deleted" });
});
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
