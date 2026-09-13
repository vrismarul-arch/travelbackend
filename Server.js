const express = require('express');
const cors = require('cors');

require('dotenv').config();

const pool = require('./config/db');
const onboardingRoutes = require('./routes/onboarding.routes');
const authRoutes = require('./routes/auth.routes');

const app = express();

const PORT = process.env.PORT || 5000;

// ===============================
// Middleware
// ===============================

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || '*',
  })
);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

// ===============================
// Root Route
// ===============================

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Sync onboarding API is running 🚀',
  });
});

// ===============================
// Database Health Check
// ===============================

app.get('/api/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.status(200).json({
      success: true,
      message: 'Database connection OK',
    });
  } catch (err) {
    console.error(
      'Database health check error:',
      err
    );

    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: err.message,
    });
  }
});

// ===============================
// API Routes
// ===============================

app.use(
  '/api/onboarding',
  onboardingRoutes
);

app.use(
  '/api/auth',
  authRoutes
);

// ===============================
// 404
// ===============================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// ===============================
// Global Error Handler
// ===============================

app.use((err, req, res, next) => {
  console.error(
    'Server error:',
    err.stack
  );

  res.status(500).json({
    success: false,
    message: 'Something went wrong',
  });
});

// ===============================
// Start Server
// ===============================

app.listen(PORT, () => {
  console.log(
    `✅ Server running on http://localhost:${PORT}`
  );
});