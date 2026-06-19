import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api, { extractError } from '../api/index.js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const token = ref(localStorage.getItem('auth_token') || null);
  const loading = ref(false);

  const isAuthenticated = computed(() => !!token.value);

  async function login(email, password) {
    loading.value = true;
    try {
      const { data } = await api.post('/auth/login', { email, password });
      token.value = data.token;
      user.value = { userId: data.userId, role: data.role, fullName: data.fullName };
      localStorage.setItem('auth_token', data.token);
      return data;
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  async function registerCustomer(fullName, email, password) {
    loading.value = true;
    try {
      await api.post('/auth/register/customer', { fullName, email, password });
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  async function verifyEmail(tokenValue) {
    loading.value = true;
    try {
      await api.post('/auth/verify-email', { token: tokenValue });
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  function logout() {
    user.value = null;
    token.value = null;
    localStorage.removeItem('auth_token');
  }

  return {
    user, token, loading, isAuthenticated,
    login, registerCustomer, verifyEmail, logout,
  };
});
