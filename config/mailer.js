const nodemailer = require('nodemailer');
require('dotenv').config();

// Works with Gmail (use an App Password, not your normal password),
// or any SMTP provider (Hostinger mail, SendGrid SMTP, Mailgun SMTP, etc.)
// Just fill in the SMTP_* values in .env — no code change needed either way.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465, // true for port 465, false for 587/25
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendOtpEmail(toEmail, otp) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: 'Your Sync password reset code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 420px; margin: auto;">
        <h2 style="color: #111;">Reset your password</h2>
        <p>Use the code below to reset your Sync account password. This code expires in 10 minutes.</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0; text-align: center;">
          ${otp}
        </div>
        <p style="color: #666; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { transporter, sendOtpEmail };