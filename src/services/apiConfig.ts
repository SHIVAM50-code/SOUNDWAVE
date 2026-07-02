// src/services/apiConfig.ts
// Configuration for the backend API URL

// In production, use the environment variable VITE_API_URL or a fallback backend URL.
// In development, use relative '/api' which is proxied to http://localhost:3001 by Vite.
const isProd = import.meta.env.PROD;

export const API_BASE_URL = isProd
  ? (import.meta.env.VITE_API_URL || 'https://soundwave-backend-2o75.onrender.com')
  : '';
