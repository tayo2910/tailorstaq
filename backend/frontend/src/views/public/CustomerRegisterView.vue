<template>
  <div class="min-h-screen flex flex-col bg-background">
    <NavBar />
    <main class="flex-1 flex items-center justify-center px-4">
      <div v-if="submitted" class="text-center max-w-md">
        <h2 class="font-display text-headline-md text-primary mb-4">Check your email</h2>
        <p class="font-body-md text-on-surface-variant">A verification link has been sent to your email address. Please click the link to activate your account.</p>
      </div>
      <div v-else class="w-full max-w-sm">
        <h2 class="font-display text-headline-lg-mobile text-on-surface mb-6 text-center">Create Account</h2>
        <ErrorBanner :message="error" @dismiss="error = ''" />
        <form @submit.prevent="handleRegister" class="space-y-4">
          <div>
            <label class="block font-label-md text-label-md text-on-surface mb-1">Full Name</label>
            <input v-model="fullName" required class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
          </div>
          <div>
            <label class="block font-label-md text-label-md text-on-surface mb-1">Email</label>
            <input v-model="email" type="email" required class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
          </div>
          <div>
            <label class="block font-label-md text-label-md text-on-surface mb-1">Password</label>
            <input v-model="password" type="password" required minlength="8" class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
            <p class="font-label-sm text-label-sm text-on-surface-variant mt-1" v-if="password">{{ passwordStrength }}</p>
          </div>
          <LoadingSpinner :visible="auth.loading" />
          <button type="submit" :disabled="auth.loading" class="w-full bg-primary text-on-primary py-3 rounded-lg font-label-md hover:bg-primary-container transition-all disabled:opacity-50">Register</button>
        </form>
        <p class="font-label-md text-label-md text-on-surface-variant text-center mt-4">Already have an account? <router-link to="/login" class="text-primary hover:underline">Sign In</router-link></p>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAuthStore } from '../../stores/auth.store.js';
import NavBar from '../../components/common/NavBar.vue';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const auth = useAuthStore();
const fullName = ref('');
const email = ref('');
const password = ref('');
const error = ref('');
const submitted = ref(false);

const passwordStrength = computed(() => {
  const p = password.value; let score = 0;
  if (p.length >= 8) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[a-z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (score < 3) return 'Weak password';
  if (score < 5) return 'Moderate password';
  return 'Strong password';
});

async function handleRegister() {
  error.value = '';
  try { await auth.registerCustomer(fullName.value, email.value, password.value); submitted.value = true; }
  catch (err) { error.value = err.message; }
}
</script>
