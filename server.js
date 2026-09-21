
const express = require('express');
const cors = require('cors');

require('dotenv').config();

const pool = require('./config/db');

const onboardingRoutes =
  require('./routes/onboarding.routes');

const authRoutes =
  require('./routes/auth.routes');


const app = express();

const PORT =
  process.env.PORT || 5000;


// =====================================================
// CORS
// =====================================================

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://travelerpdemo.netlify.app',
];

app.use(
  cors({
    origin: function (origin, callback) {

      // Allow Postman / server-to-server requests
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log('❌ CORS blocked:', origin);

      return callback(
        new Error('Not allowed by CORS')
      );
    },

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
    ],

    credentials: true,
  })
);


// =====================================================
// BODY PARSER
// =====================================================

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);


// =====================================================
// ROOT ROUTE
// =====================================================

app.get('/', (req, res) => {

  res.status(200).json({
    success: true,
    message: 'Sync Multi-Tenant CRM API is running 🚀',
  });

});


// =====================================================
// DATABASE HEALTH CHECK
// =====================================================

app.get('/api/health/db', async (req, res) => {

  try {

    await pool.query('SELECT 1');

    res.status(200).json({
      success: true,
      message: 'Database connection OK',
    });

  } catch (err) {

    console.error(
      '❌ Database health check error:',
      err
    );

    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: err.message,
    });

  }

});


// =====================================================
// API ROUTES
// =====================================================


// -----------------------------
// ONBOARDING
// -----------------------------

app.use(
  '/api/onboarding',
  onboardingRoutes
);


// -----------------------------
// AUTHENTICATION
// -----------------------------

app.use(
  '/api/auth',
  authRoutes
);


// -----------------------------
// CUSTOMERS
// -----------------------------




// =====================================================
// 404 HANDLER
// =====================================================

app.use((req, res) => {

  console.log(
    `❌ 404 - ${req.method} ${req.originalUrl}`
  );

  res.status(404).json({

    success: false,

    message: 'Route not found',

    method: req.method,

    path: req.originalUrl,

  });

});


// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use(
  (err, req, res, next) => {

    console.error(
      '❌ Server error:',
      err.stack
    );

    res.status(500).json({

      success: false,

      message: 'Something went wrong',

      error: err.message,

    });

  }
);


// =====================================================
// START SERVER
// =====================================================

app.listen(
  PORT,
  '0.0.0.0',
  () => {

    console.log('');
    console.log(
      '======================================'
    );

    console.log(
      `✅ Server running on port ${PORT}`
    );

    console.log(
      `🌐 API: http://localhost:${PORT}`
    );

    console.log(
      `🔐 Login: http://localhost:${PORT}/api/auth/login`
    );

    console.log(
      `👥 Customers: http://localhost:${PORT}/api/customers`
    );

    console.log(
      '🏢 Multi-tenant CRM enabled'
    );

    console.log(
      '======================================'
    );

    console.log('');

  }
);
