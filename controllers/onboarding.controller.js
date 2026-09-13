const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
require('dotenv').config();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/onboarding/check-domain/:domainId
exports.checkDomain = async (req, res) => {
  try {
    const { domainId } = req.params;
    const clean = (domainId || '').toLowerCase().trim();

    if (!clean || !/^[a-z0-9-]+$/.test(clean)) {
      return res.status(400).json({ success: false, available: false, message: 'Invalid domain format' });
    }

    const [rows] = await pool.query('SELECT id FROM organizations WHERE domain_id = ?', [clean]);
    return res.status(200).json({ success: true, available: rows.length === 0 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/onboarding/register
exports.register = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      fullName,
      email,
      phone,
      password,
      domainId,
      companyName,
      orgSize,
      branchType,
      website,
      industry,
      address,
      gst,
      description,
      branches,
    } = req.body;

    if (!fullName || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'Missing personal details' });
    }
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    if (!companyName || !orgSize || !branchType) {
      return res.status(400).json({ success: false, message: 'Missing company details' });
    }
    const cleanDomain = (domainId || '').toLowerCase().trim();
    if (!cleanDomain || !/^[a-z0-9-]+$/.test(cleanDomain)) {
      return res.status(400).json({ success: false, message: 'Invalid domain ID' });
    }
    if (branchType === 'multiple' && (!Array.isArray(branches) || branches.length === 0)) {
      return res.status(400).json({ success: false, message: 'At least one branch is required' });
    }

    await connection.beginTransaction();

    const [existingDomain] = await connection.query(
      'SELECT id FROM organizations WHERE domain_id = ?',
      [cleanDomain]
    );
    if (existingDomain.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Domain ID is already taken' });
    }

    const [existingEmail] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    const [orgResult] = await connection.query(
      `INSERT INTO organizations
        (company_name, domain_id, org_size, branch_type, website, industry, address, gst_number, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        companyName,
        cleanDomain,
        orgSize,
        branchType,
        website || null,
        industry || null,
        address || null,
        gst || null,
        description || null,
      ]
    );
    const organizationId = orgResult.insertId;

    const hashedPassword = await bcrypt.hash(password, 10);
    const [userResult] = await connection.query(
      `INSERT INTO users (organization_id, full_name, email, phone, password, role)
       VALUES (?, ?, ?, ?, ?, 'owner')`,
      [organizationId, fullName, email, phone, hashedPassword]
    );
    const userId = userResult.insertId;

    if (branchType === 'multiple') {
      const branchValues = branches.map((b) => [organizationId, b.name, b.location, b.contact]);
      await connection.query(
        'INSERT INTO branches (organization_id, name, location, contact) VALUES ?',
        [branchValues]
      );
    }

    await connection.commit();

    const token = jwt.sign(
      { id: userId, organizationId, role: 'owner', domain: cleanDomain },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Organization created successfully',
      token,
      organization: {
        id: organizationId,
        companyName,
        domainId: cleanDomain,
        branchType,
      },
      user: { id: userId, fullName, email, role: 'owner' },
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    connection.release();
  }
};