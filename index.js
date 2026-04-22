const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const users = [];
dotenv.config();

// Standard CORS configuration for Vite local development
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
}));

app.use(express.json());

const port = process.env.PORT || 5000;
const URI = process.env.MONGO_URI;

mongoose.connect(URI)
.then(() => {
    console.log('Connected to MongoDB');
})
.catch((err) => {
    console.log('Error connecting to MongoDB', err);
});

// --- MOCK API ENDPOINTS FOR TESTING ---

// Register User Endpoint
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    const newUser = { id: Date.now(), username, password };
    users.push(newUser);
    res.status(201).json({ message: 'User registered successfully', user: { id: newUser.id, username: newUser.username } });
});

// Login User Endpoint
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.status(200).json({ message: 'User logged in', token: 'mock-jwt-token-123' });
});

// Fetch Posts Endpoint
app.get('/api/posts', (req, res) => {
    const mockPosts = [
        { id: 1, title: 'First Post', content: 'This is the first mock post from the local backend.' },
        { id: 2, title: 'React + Node', content: 'Connecting frontend to backend works perfectly!' }
    ];
    res.status(200).json(mockPosts);
});

// ---------------------------------------

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});