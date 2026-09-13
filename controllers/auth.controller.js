const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { sendOtpEmail } = require('../config/mailer');
require('dotenv').config();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_EXPIRY_MINUTES = 10;

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit code
}

// Normalize email the same way everywhere (signup, login, reset)
// so "User@Gmail.com " and "user@gmail.com" are treated as the same account.
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    email = normalizeEmail(email);
    // Do NOT trim password — a trailing space could legitimately be part of
    // someone's password, and trimming here while not trimming at signup
    // (or vice versa) is a classic cause of "Invalid credentials" bugs.

    const [rows] = await pool.query(
      `SELECT u.*, o.domain_id, o.company_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE LOWER(TRIM(u.email)) = ?`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = rows[0];

    if (!user.password) {
      // Defensive: account exists but has no password hash stored
      // (e.g. row inserted manually or via an incomplete migration).
      console.error(`Login blocked: user ${user.id} has no password hash set`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, organizationId: user.organization_id, role: user.role, domain: user.domain_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        organization: { id: user.organization_id, domainId: user.domain_id, companyName: user.company_name },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/auth/forgot-password  { email }
// Generates a 6-digit OTP, stores it, emails it via nodemailer.
exports.forgotPassword = async (req, res) => {
  try {
    let { email } = req.body;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email is required' });
    }
    email = normalizeEmail(email);

    const [users] = await pool.query('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?', [email]);
    // Always respond success even if the email isn't found — avoids leaking
    // which emails are registered. We just skip sending in that case.
    if (users.length === 0) {
      return res.status(200).json({ success: true, message: 'If that email exists, a code has been sent.' });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // invalidate any previous unused OTPs for this email, then insert the new one
    await pool.query('UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0', [email]);
    await pool.query(
      'INSERT INTO password_resets (email, otp, expires_at) VALUES (?, ?, ?)',
      [email, otp, expiresAt]
    );

    await sendOtpEmail(email, otp);

    return res.status(200).json({ success: true, message: 'If that email exists, a code has been sent.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/auth/reset-password  { email, otp, password }
exports.resetPassword = async (req, res) => {
  try {
    let { email, otp, password } = req.body;
    if (!email || !otp || !password) {
      return res.status(400).json({ success: false, message: 'Email, code, and new password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    email = normalizeEmail(email);

    const [rows] = await pool.query(
      `SELECT * FROM password_resets
       WHERE email = ? AND otp = ? AND used = 0 AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [email, otp]
    );

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password = ? WHERE LOWER(TRIM(email)) = ?', [hashedPassword, email]);
    await pool.query('UPDATE password_resets SET used = 1 WHERE id = ?', [rows[0].id]);

    return res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/auth/resend-otp  { email }  — same as forgotPassword, exposed separately for clarity
exports.resendOtp = exports.forgotPassword;

// GET /api/auth/me
// Protected route (needs verifyToken middleware). Reads the user id from
// the decoded JWT (req.user.id) and returns fresh details from the DB —
// including login-related info like when the account was created.
exports.getMe = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.created_at,
              u.organization_id, o.domain_id, o.company_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = rows[0];

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        createdAt: user.created_at, // account creation date
        organization: {
          id: user.organization_id,
          domainId: user.domain_id,
          companyName: user.company_name,
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ---------------------------------------------------------------------
// TEMPORARY DIAGNOSTIC — remove this export and its route once the bug
// is confirmed fixed. Do NOT leave this in production; it exists only
// to tell you *why* a login is failing without exposing password data
// in normal logs.
// ---------------------------------------------------------------------
exports.debugLoginCheck = async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }
    email = normalizeEmail(email);

    const [rows] = await pool.query('SELECT id, email, password FROM users WHERE LOWER(TRIM(email)) = ?', [email]);
    if (rows.length === 0) {
      return res.status(200).json({ found: false, reason: 'No user row matches that (normalized) email.' });
    }

    const user = rows[0];
    const hasHash = !!user.password;
    const looksLikeBcrypt = hasHash && /^\$2[aby]\$\d{2}\$/.test(user.password);
    const isMatch = hasHash ? await bcrypt.compare(password, user.password) : false;

    return res.status(200).json({
      found: true,
      storedEmail: user.email,
      hasHash,
      looksLikeBcryptHash: looksLikeBcrypt,
      passwordMatches: isMatch,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};