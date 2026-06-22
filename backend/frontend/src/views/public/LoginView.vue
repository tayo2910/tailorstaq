<template>
  <div class="min-h-screen flex flex-col bg-background">
    <NavBar />
    <main class="flex-1 flex items-center justify-center px-4">
      <div class="w-full max-w-sm">
        <h2 class="font-display text-headline-lg-mobile text-on-surface mb-6 text-center">Sign In</h2>
        <ErrorBanner :message="error" @dismiss="error = ''" />
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="block font-label-md text-label-md text-on-surface mb-1">Email</label>
            <input v-model="email" type="email" required class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none font-body-md bg-surface" />
          </div>
          <div>
            <label class="block font-label-md text-label-md text-on-surface mb-1">Password</label>
            <input v-model="password" type="password" required class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none font-body-md bg-surface" />
          </div>
          <LoadingSpinner :visible="auth.loading" />
          <button type="submit" :disabled="auth.loading" class="w-full bg-primary text-on-primary py-3 rounded-lg font-label-md hover:bg-primary-container transition-all disabled:opacity-50">Sign In</button>
        </form>
        <p class="font-label-md text-label-md text-on-surface-variant text-center mt-4">
          Don't have an account?
          <router-link to="/register/customer" class="text-primary hover:underline">Register</router-link>
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
    const redirectMap = { platform_admin: '/admin', tenant_admin: '/tenant', customer: '/customer' };
    router.push(redirectMap[data.role] || route.query.redirect || '/');
  } catch (err) {
    error.value = err.message;
  }
}
</script>
