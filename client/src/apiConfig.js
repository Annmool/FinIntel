// Centralized API URL configuration
export const API_URL = process.env.NODE_ENV === 'production'
  ? 'https://finintel-backend-4ujy.onrender.com'
  : 'http://localhost:5000';
