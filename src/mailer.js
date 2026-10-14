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

// Send a transactional email to a user (password reset, verification).
// Resolves true if handed to SMTP, false otherwise; never rejects.
// Without SMTP configured: in development the message (including its link)
// is printed to the console so flows can be tested locally; in production
// nothing sensitive is logged and the caller still returns a generic response.
async function sendMail({ to, subject, lines }) {
  const text = lines.join('\n');
  const tx = getTransporter();
  if (!tx) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[mailer:dev] To: ${to}\nSubject: ${subject}\n${text}\n`);
    }
    return false;
  }
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#101B2D;">
    ${lines.map((l) => `<p style="margin:0 0 12px;">${/^https?:\/\//.test(l) ? `<a href="${esc(l)}">${esc(l)}</a>` : esc(l)}</p>`).join('')}
  </div>`;
  try {
    await tx.sendMail({ from: `Josriri Sports Management <${process.env.SMTP_USER}>`, to, subject, text, html });
    return true;
  } catch (err) {
    console.error('[mailer] failed to send to user:', err.message);
    return false;
  }
}

module.exports = { notifyAdmin, sendMail };
