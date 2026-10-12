
const jwt = require('jsonwebtoken');

function signToken(user, extra = {}) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, ...extra },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m', issuer: 'secureaccess-api', audience: 'secureaccess-mobile' }
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'secureaccess-api', audience: 'secureaccess-mobile'
    });
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (req.user.role !== role) return res.status(403).json({ error: 'Insufficient permissions.' });
    next();
  };
}

module.exports = { signToken, authenticate, requireRole };
