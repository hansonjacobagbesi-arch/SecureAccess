
const crypto = require('node:crypto');

function keyFromEnv(name) {
  const value = process.env[name] || '';
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be exactly 64 hexadecimal characters (32 bytes).`);
  }
  return Buffer.from(value, 'hex');
}

function encryptText(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromEnv('DATA_ENCRYPTION_KEY'), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: 'AES-256-GCM',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64')
  };
}

function decryptText(payload) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keyFromEnv('DATA_ENCRYPTION_KEY'),
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function hmacText(value) {
  const key = keyFromEnv('DATA_ENCRYPTION_KEY');
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); }
  catch { return false; }
}

module.exports = { encryptText, decryptText, hmacText, safeEqualHex };
