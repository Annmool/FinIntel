function createRequireAuth(verifyIdToken) {
  return async function requireAuth(req, res, next) {
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return res.status(401).json({ error: 'Authentication required.' });

    try {
      req.user = await verifyIdToken(token);
      return next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
  };
}

module.exports = { createRequireAuth };
