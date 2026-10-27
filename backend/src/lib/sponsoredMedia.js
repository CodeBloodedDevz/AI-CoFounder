// Logos and advert pictures. The app sends the picture as base64 JSON (like voice recordings); the server checks
// what the file really is from its first bytes (never trusting the name or type the app claims), stores it under
// a random name in the public "sponsored-media" bucket (backend/supabase/sponsored.sql), and returns its address.
// Files are never overwritten, so a picture an admin approved can't be swapped for another one later.

const crypto = require('node:crypto');
const supabase = require('../supabaseClient');
const { HttpError, badRequest } = require('./http');

const BUCKET = 'sponsored-media';
const MAX_BYTES = 2 * 1024 * 1024;

/** Public address prefix of the bucket (what getPublicUrl returns, without the file path). */
const mediaBase = () => `${String(process.env.SUPABASE_URL || '').replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}`;
/** Where one business's files live: images in adverts / pages must be inside it. */
const mediaBaseFor = (businessId) => `${mediaBase()}/${businessId}`;

/** -> { ext, mime } from the file's magic bytes, or null for anything that isn't PNG / JPEG / WebP. */
function sniff(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

/** Accepts "data:image/png;base64,...." or plain base64. -> Buffer */
function decode(data) {
  if (typeof data !== 'string' || !data) throw badRequest('No picture was sent.');
  const b64 = data.replace(/^data:[^;,]+;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw badRequest('The picture could not be read.');
  if (b64.length > Math.ceil((MAX_BYTES * 4) / 3) + 8) throw new HttpError(413, 'That picture is too large. Use one under 2 MB.');
  return Buffer.from(b64, 'base64');
}

async function uploadImage(businessId, data) {
  const buf = decode(data);
  if (buf.length > MAX_BYTES) throw new HttpError(413, 'That picture is too large. Use one under 2 MB.');
  if (buf.length < 100) throw badRequest('The picture could not be read.');
  const kind = sniff(buf);
  if (!kind) throw badRequest('Use a PNG, JPEG or WebP picture.');
  const path = `${businessId}/${crypto.randomUUID()}.${kind.ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: kind.mime, upsert: false, cacheControl: '31536000' });
  if (error) {
    console.error('[sponsored] image upload failed:', error.message);
    if (/bucket not found/i.test(error.message || '')) throw new HttpError(503, 'Picture uploads are not set up yet. Run backend/supabase/sponsored.sql.');
    throw new HttpError(502, "The picture couldn't be saved. Please try again.");
  }
  return { url: `${mediaBase()}/${path}`, bytes: buf.length, type: kind.mime };
}

module.exports = { BUCKET, MAX_BYTES, mediaBase, mediaBaseFor, sniff, uploadImage };
