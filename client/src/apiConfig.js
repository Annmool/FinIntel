// Centralized API URL configuration
// Allows overriding via REACT_APP_API_URL environment variable in production (e.g. Cloudflare Pages)
export const API_URL = process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://finintel-backend-4ujy.onrender.com'
    : 'http://localhost:5000');
