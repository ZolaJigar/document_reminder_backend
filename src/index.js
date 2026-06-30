const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const documentRoutes = require('./routes/documentRoutes');
const documentTypeRoutes = require('./routes/documentTypeRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const userRoutes = require('./routes/userRoutes');
const roleRoutes = require('./routes/roles');
const permissionRoutes = require('./routes/permissions');
const loginLogRoutes = require('./routes/loginLogRoutes');
const emailLogRoutes = require('./routes/emailLogRoutes');
const fcmRoutes = require('./routes/fcmRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const { startCronJobs } = require('./controllers/cronController');
const { getFirebaseApp } = require('./config/firebase');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Document Reminder API is running', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/document-types', documentTypeRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/login-logs', loginLogRoutes);
app.use('/api/email-logs', emailLogRoutes);
app.use('/api/fcm', fcmRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'File too large. Max size is 10MB.' });
  }
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Document Reminder API running on port ${PORT}`);
  console.log(`📖 Health check: http://localhost:${PORT}/health`);
  console.log(`📦 API Base URL: http://localhost:${PORT}/api\n`);
  // Initialise Firebase Admin SDK eagerly so any config errors surface at boot
  getFirebaseApp();
  startCronJobs();
});

module.exports = app;
