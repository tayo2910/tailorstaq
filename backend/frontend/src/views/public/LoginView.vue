<template>
  <div class="min-h-screen flex flex-col">
    <NavBar />
    <main class="flex-1 flex items-center justify-center px-4">
      <div class="w-full max-w-sm">
        <h2 class="text-2xl font-bold text-brand-dark mb-6 text-center">Sign In</h2>
        <ErrorBanner :message="error" @dismiss="error = ''" />
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              v-model="email"
              type="email"
              required
              class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              v-model="password"
              type="password"
              required
              class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
          </div>
          <LoadingSpinner :visible="auth.loading" />
          <button
            type="submit"
            :disabled="auth.loading"
            class="w-full bg-brand-dark text-white py-2 rounded font-semibold hover:opacity-90 disabled:opacity-50"
          >
            Sign In
          </button>
        </form>
        <p class="text-sm text-gray-500 text-center mt-4">
          Don't have an account?
          <router-link to="/register/customer" class="text-brand-accent hover:underline"
            >Register</router-link
          >
        </p>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store.js';
import NavBar from '../../components/common/NavBar.vue';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const error = ref('');

async function handleLogin() {
  error.value = '';
  try {
    const data = await auth.login(email.value, password.value);
    const redirectMap = {
      platform_admin: '/admin',
      tenant_admin: '/tenant',
      customer: '/customer',
    };
    const target = redirectMap[data.role] || route.query.redirect || '/';
    router.push(target);
  } catch (err) {
    error.value = err.message;
  }
}
</script>
