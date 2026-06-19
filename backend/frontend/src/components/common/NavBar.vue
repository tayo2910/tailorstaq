<template>
  <nav class="bg-brand-dark text-white shadow-md">
    <div class="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
      <router-link to="/" class="text-xl font-bold tracking-wider">
        TAILORSTAQ
      </router-link>
      <div class="flex items-center gap-4">
        <template v-if="auth.isAuthenticated">
          <span class="text-sm text-gray-300">{{ auth.user?.fullName }}</span>
          <button
            @click="handleLogout"
            class="bg-brand-accent text-brand-dark px-3 py-1 rounded text-sm hover:opacity-90"
          >
            Logout
          </button>
        </template>
        <template v-else>
          <router-link to="/login" class="text-sm hover:text-brand-accent">Login</router-link>
          <router-link
            to="/register/tenant"
            class="bg-brand-accent text-brand-dark px-3 py-1 rounded text-sm hover:opacity-90"
          >
            Register Shop
          </router-link>
        </template>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store.js';

const auth = useAuthStore();
const router = useRouter();

function handleLogout() {
  auth.logout();
  router.push('/');
}
</script>
