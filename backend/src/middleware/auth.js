import jwt from 'jsonwebtoken';
import { config } from '../config.js';

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader) return String(apiKeyHeader);
  return null;
}

export function authMiddleware(req, res, next) {
  const token = extractToken(req);

  if (config.auth.apiKey && token && token === config.auth.apiKey) {
    req.auth = { type: 'api-key' };
    return next();
  }

  if (config.auth.jwtSecret && token) {
    try {
      const payload = jwt.verify(token, config.auth.jwtSecret);
      req.auth = { type: 'jwt', payload };
      return next();
    } catch {
      // fall through to anonymous/deny below
    }
  }

  if (config.auth.allowAnonymous) {
    req.auth = { type: 'anonymous' };
    return next();
  }

  res.status(401).json({ error: 'unauthorized' });
}
