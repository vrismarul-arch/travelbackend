const express = require('express');
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// GET all trips (protected)
router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM trips ORDER BY created_at DESC');
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// CREATE a trip (protected)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { destination, start_date, end_date, price } = req.body;

    if (!destination || !start_date || !end_date) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const [result] = await pool.query(
      'INSERT INTO trips (destination, start_date, end_date, price, user_id) VALUES (?, ?, ?, ?, ?)',
      [destination, start_date, end_date, price || 0, req.user.id]
    );

    return res.status(201).json({ success: true, tripId: result.insertId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;