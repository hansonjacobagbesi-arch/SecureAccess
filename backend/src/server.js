
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const argon2 = require('argon2');
const speakeasy = require('speakeasy');
const crypto = require('node:crypto');
const pool = require('./db');
const { signToken, authenticate, requireRole } = require('./auth');
const { encryptText, decryptText, hmacText, safeEqualHex } = require('./security');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN === '*' ? '*' : (process.env.CLIENT_ORIGIN || false) }));
app.use(express.json({ limit: '20kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 200, standardHeaders: true, legacyHeaders: false }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, message: { error: 'Too many authentication attempts. Try again later.' } });

function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validPassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128;
}
function totpKey() {
  const raw = process.env.TOTP_ENCRYPTION_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('TOTP_ENCRYPTION_KEY must be 64 hex characters.');
  return Buffer.from(raw, 'hex');
}
function sealTotp(secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', totpKey(), iv);
  const encrypted = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
function openTotp(value) {
  const [iv, tag, encrypted] = value.split('.');
  const d = crypto.createDecipheriv('aes-256-gcm', totpKey(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(encrypted, 'base64')), d.final()]).toString('utf8');
}
async function audit(userId, action, req) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
      [userId || null, action, (req.ip || '').slice(0, 45), (req.get('user-agent') || '').slice(0, 255)]
    );
  } catch (e) { console.error('Audit logging failed:', e.message); }
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'SecureAccess API' }));

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password;
    const name = String(req.body.name || '').trim().slice(0, 100);
    if (!validEmail(email) || !validPassword(password) || !name) {
      return res.status(400).json({ error: 'Provide a name, valid email, and password of at least 12 characters.' });
    }
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ error: 'An account with that email already exists.' });
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, 'USER']
    );
    await audit(result.insertId, 'REGISTER_SUCCESS', req);
    return res.status(201).json({ message: 'Account created. You can now sign in.' });
  } catch (e) { next(e); }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password;
    if (!validEmail(email) || typeof password !== 'string') return res.status(400).json({ error: 'Invalid email or password.' });
    const [rows] = await pool.execute(
      'SELECT id, name, email, password_hash, role, totp_secret, totp_enabled FROM users WHERE email = ?',
      [email]
    );
    const user = rows[0];
    if (!user || !(await argon2.verify(user.password_hash, password))) {
      await audit(user?.id, 'LOGIN_FAILED', req);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (user.totp_enabled && user.totp_secret) {
      const challenge = signToken(user, { purpose: '2fa' });
      await audit(user.id, 'LOGIN_PASSWORD_OK_2FA_REQUIRED', req);
      return res.json({ requires2FA: true, challengeToken: challenge });
    }
    const secret = speakeasy.generateSecret({ name: `SecureAccess (${user.email})`, issuer: 'SecureAccess' });
    const pending = signToken(user, { purpose: 'enroll2fa', secret: secret.base32 });
    await audit(user.id, 'LOGIN_SUCCESS_2FA_SETUP_REQUIRED', req);
    return res.json({
      requires2FASetup: true,
      setupToken: pending,
      otpauthUrl: secret.otpauth_url,
      message: 'Add this account to an authenticator app, then submit its six-digit code to /api/auth/enable-2fa.'
    });
  } catch (e) { next(e); }
});

app.post('/api/auth/enable-2fa', authLimiter, async (req, res, next) => {
  try {
    const { setupToken, code } = req.body;
    let claims;
    try { claims = require('jsonwebtoken').verify(setupToken, process.env.JWT_SECRET, { issuer: 'secureaccess-api', audience: 'secureaccess-mobile' }); }
    catch { return res.status(401).json({ error: 'Invalid setup session.' }); }
    if (claims.purpose !== 'enroll2fa' || !/^\d{6}$/.test(String(code || ''))) return res.status(400).json({ error: 'Invalid setup session or code.' });
    const valid = speakeasy.totp.verify({ secret: claims.secret, encoding: 'base32', token: String(code), window: 1 });
    if (!valid) return res.status(401).json({ error: 'Invalid authenticator code.' });
    await pool.execute('UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?', [sealTotp(claims.secret), claims.sub]);
    await audit(claims.sub, 'TWO_FACTOR_ENABLED', req);
    return res.json({ message: 'Two-factor authentication enabled. Sign in again to verify the full flow.' });
  } catch (e) { next(e); }
});

app.post('/api/auth/verify-2fa', authLimiter, async (req, res, next) => {
  try {
    const { challengeToken, code } = req.body;
    let claims;
    try { claims = require('jsonwebtoken').verify(challengeToken, process.env.JWT_SECRET, { issuer: 'secureaccess-api', audience: 'secureaccess-mobile' }); }
    catch { return res.status(401).json({ error: 'Invalid or expired challenge.' }); }
    if (claims.purpose !== '2fa' || !/^\d{6}$/.test(String(code || ''))) return res.status(400).json({ error: 'Invalid challenge or code.' });
    const [rows] = await pool.execute('SELECT id, name, email, role, totp_secret, totp_enabled FROM users WHERE id = ?', [claims.sub]);
    const user = rows[0];
    if (!user || !user.totp_enabled || !user.totp_secret) return res.status(401).json({ error: 'Two-factor authentication is not configured.' });
    const secret = openTotp(user.totp_secret);
    const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: String(code), window: 1 });
    if (!valid) { await audit(user.id, 'TWO_FACTOR_FAILED', req); return res.status(401).json({ error: 'Invalid authenticator code.' }); }
    await audit(user.id, 'LOGIN_SUCCESS', req);
    return res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { next(e); }
});

app.get('/api/me', authenticate, async (req, res, next) => {
  try {
    if (req.user.purpose) return res.status(401).json({ error: 'Complete authentication first.' });
    const [rows] = await pool.execute('SELECT id, name, email, role, totp_enabled, created_at FROM users WHERE id = ?', [req.user.sub]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: rows[0] });
  } catch (e) { next(e); }
});

app.get('/api/user/overview', authenticate, async (req, res) => {
  if (req.user.purpose) return res.status(401).json({ error: 'Complete authentication first.' });
  res.json({ message: 'Welcome to the standard user area.', permissions: ['view_own_profile'] });
});

app.get('/api/admin/overview', authenticate, requireRole('ADMIN'), async (req, res) => {
  if (req.user.purpose) return res.status(401).json({ error: 'Complete authentication first.' });
  const [[{ users }]] = await pool.query('SELECT COUNT(*) AS users FROM users');
  const [[{ events }]] = await pool.query('SELECT COUNT(*) AS events FROM audit_logs');
  res.json({ message: 'Administrator access granted.', stats: { users, auditEvents: events } });
});

app.post('/api/security/encrypt', authenticate, async (req, res, next) => {
  try {
    if (req.user.purpose) return res.status(401).json({ error: 'Complete authentication first.' });
    const text = req.body.text;
    if (typeof text !== 'string' || text.length > 5000) return res.status(400).json({ error: 'Text must be a string of at most 5000 characters.' });
    const encrypted = encryptText(text);
    return res.json({ encrypted, decryptedDemo: decryptText(encrypted), note: 'AES-256-GCM provides confidentiality and an authentication tag for tamper detection.' });
  } catch (e) { next(e); }
});

app.post('/api/security/integrity', authenticate, async (req, res, next) => {
  try {
    if (req.user.purpose) return res.status(401).json({ error: 'Complete authentication first.' });
    const text = req.body.text;
    if (typeof text !== 'string' || text.length > 5000) return res.status(400).json({ error: 'Text must be a string of at most 5000 characters.' });
    const signature = hmacText(text);
    const supplied = req.body.signature;
    return res.json({ signature, verified: supplied ? safeEqualHex(signature, supplied) : null, note: 'Keep the HMAC secret separate from the data being checked.' });
  } catch (e) { next(e); }
});

app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((err, req, res, next) => {
  console.error(err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, '0.0.0.0', () => console.log(`SecureAccess API listening on port ${port}`));
