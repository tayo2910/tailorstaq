<template>
  <header class="w-full sticky top-0 bg-surface shadow-[0px_4px_20px_rgba(111,37,18,0.15)] z-50">
    <div class="flex items-center justify-between px-container-padding-mobile py-stack-sm w-full max-w-7xl mx-auto">
      <div class="flex items-center gap-3">
        <router-link to="/" class="font-display text-headline-md font-bold text-primary">TailorStaq</router-link>
      </div>
      <div class="flex items-center gap-4">
        <button
          class="sm:hidden material-symbols-outlined text-primary p-2"
          @click="mobileOpen = !mobileOpen"
        >
          {{ mobileOpen ? 'close' : 'menu' }}
        </button>
        <div class="hidden sm:flex items-center gap-4">
          <template v-if="auth.isAuthenticated">
            <span class="font-label-md text-on-surface-variant truncate max-w-[120px]">{{ auth.user?.fullName }}</span>
            <button
              @click="handleLogout"
              class="font-label-md text-label-md text-primary hover:underline whitespace-nowrap"
            >
              Logout
            </button>
          </template>
          <template v-else>
            <router-link to="/login" class="font-label-md text-label-md text-primary hover:underline">Sign In</router-link>
            <router-link
              to="/register/tenant"
              class="bg-primary text-on-primary px-6 py-2 rounded font-label-md hover:bg-primary-container transition-all active:scale-95"
            >
              Join as a Tailor
            </router-link>
          </template>
        </div>
      </div>
    </div>
    <div
      v-if="mobileOpen"
      class="sm:hidden bg-surface border-t border-outline-variant/30 px-container-padding-mobile py-stack-md space-y-3"
    >
      <template v-if="auth.isAuthenticated">
        <p class="font-label-md text-on-surface-variant">{{ auth.user?.fullName }}</p>
        <button
          @click="handleLogout"
          class="block w-full text-left font-label-md text-primary hover:underline py-2"
        >
          Logout
        </button>
      </template>
      <template v-else>
        <router-link to="/login" class="block font-label-md text-primary hover:underline py-1" @click="mobileOpen = false">Sign In</router-link>
        <router-link
          to="/register/tenant"
          class="block bg-primary text-on-primary px-6 py-2 rounded font-label-md text-center"
          @click="mobileOpen = false"
        >
          Join as a Tailor
        </router-link>
      </template>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store.js';

const auth = useAuthStore();
const router = useRouter();
const mobileOpen = ref(false);

function handleLogout() {
  auth.logout();
  mobileOpen.value = false;
  router.push('/');
}
</script>
