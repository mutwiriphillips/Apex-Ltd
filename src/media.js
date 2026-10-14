// src/media.js
// Shared helpers for uploaded media: size limits, content sniffing, HTML
// escaping for notification emails, and HTTP Range serving of stored videos.
//
// We never trust the client's Content-Type header on its own: the stored
// type is derived from the file's magic bytes, and only a short allow-list
// is accepted (no SVG, so an upload can never carry script).

const MB = 1024 * 1024;
const MAX_PHOTO_BYTES = Math.max(1, Number(process.env.MAX_PHOTO_MB) || 3) * MB;
const MAX_VIDEO_BYTES = Math.max(1, Number(process.env.MAX_VIDEO_MB) || 30) * MB;
const MAX_UPLOADED_VIDEOS_PER_PLAYER = 10;

function sniffImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

function sniffVideo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') {
    // QuickTime (.mov) brand is "qt  "; everything else is treated as MP4.
    return buf.slice(8, 12).toString('latin1') === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  return null;
}

function escapeHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+()\-\s]{7,30}$/;

// Serve a stored video with HTTP Range support (required by Safari and for
// seeking). `fetchSlice(start, endInclusive)` must resolve to a Buffer.
async function sendVideo(req, res, { contentType, size, fetchSlice, cacheControl }) {
  res.set({
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': cacheControl,
    'Content-Disposition': 'inline',
  });
  const range = req.headers.range;
  if (!range) {
    res.set('Content-Length', String(size));
    return res.status(200).end(await fetchSlice(0, size - 1));
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!m || (m[1] === '' && m[2] === '')) {
    res.set('Content-Range', `bytes */${size}`);
    return res.status(416).end();
  }
  let start; let end;
  if (m[1] === '') { // suffix range: last N bytes
    const n = Number(m[2]);
    start = Math.max(size - n, 0);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) {
    res.set('Content-Range', `bytes */${size}`);
    return res.status(416).end();
  }
  res.set({
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Content-Length': String(end - start + 1),
  });
  return res.status(206).end(await fetchSlice(start, end));
}

module.exports = {
  MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, MAX_UPLOADED_VIDEOS_PER_PLAYER,
  sniffImage, sniffVideo, escapeHtml, EMAIL_RE, PHONE_RE, sendVideo,
};
