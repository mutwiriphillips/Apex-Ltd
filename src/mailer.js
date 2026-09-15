// src/mailer.js
// Sends admin notification emails (e.g. "new player signed up") over SMTP.
//
// Configuration is entirely via environment variables (see .env.example):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ADMIN_NOTIFICATION_EMAIL
//
// If SMTP isn't configured, notifications are skipped with a console warning
// rather than throwing — a missing/broken mail setup must never break player
// registration or account creation. Every call site wraps this in a
// best-effort call and never awaits it in a way that can fail the request.

let transporter = null;
let warnedMissingConfig = false;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    if (!warnedMissingConfig) {
      console.warn(
        '[mailer] SMTP_HOST/SMTP_USER/SMTP_PASS not set — admin notification emails are disabled. ' +
        'See .env.example to enable them.'
      );
      warnedMissingConfig = true;
    }
    return null;
  }

  // Lazy-require so a missing/broken nodemailer install can't crash boot —
  // it only matters once someone actually triggers a notification.
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

// Fire-and-forget: never throws, never rejects in a way the caller must
// handle. Failures are logged so they're visible in Render logs without
// ever affecting the HTTP response already sent to the end user.
function notifyAdmin(subject, lines) {
  const tx = getTransporter();
  if (!tx) return;

  const to = process.env.ADMIN_NOTIFICATION_EMAIL || 'skywalkerstalents@gmail.com';
  const from = process.env.SMTP_USER;
  const text = lines.join('\n');
  const html = `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#191933;">
    ${lines.map((l) => `<p style="margin:0 0 8px;">${l}</p>`).join('')}
  </div>`;

  tx.sendMail({ from, to, subject, text, html }).catch((err) => {
    console.error('[mailer] failed to send admin notification:', err.message);
  });
}

module.exports = { notifyAdmin };
