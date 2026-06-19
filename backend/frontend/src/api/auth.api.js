import api from './index.js';

export function login(email, password) {
  return api.post('/auth/login', { email, password });
}

export function registerCustomer(data) {
  return api.post('/auth/register/customer', data);
}

export function verifyEmail(token) {
  return api.post('/auth/verify-email', { token });
}
