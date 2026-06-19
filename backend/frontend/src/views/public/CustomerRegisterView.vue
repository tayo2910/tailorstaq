<template>
  <div class="min-h-screen flex flex-col">
    <NavBar />
    <main class="flex-1 flex items-center justify-center px-4">
      <div v-if="submitted" class="text-center max-w-md">
        <h2 class="text-2xl font-bold text-brand-dark mb-4">Check your email</h2>
        <p class="text-gray-600">
          A verification link has been sent to your email address. Please click the link to
          activate your account.
        </p>
      </div>
      <div v-else class="w-full max-w-sm">
        <h2 class="text-2xl font-bold text-brand-dark mb-6 text-center">Create Account</h2>
        <ErrorBanner :message="error" @dismiss="error = ''" />
        <form @submit.prevent="handleRegister" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              v-model="fullName"
              required
              class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
          </div>
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
              minlength="8"
              class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
            <p class="text-xs text-gray-400 mt-1" v-if="password">
              {{ passwordStrength }}
            </p>
          </div>
          <LoadingSpinner :visible="auth.loading" />
          <button
            type="submit"
            :disabled="auth.loading"
            class="w-full bg-brand-dark text-white py-2 rounded font-semibold hover:opacity-90 disabled:opacity-50"
          >
            Register
          </button>
        </form>
        <p class="text-sm text-gray-500 text-center mt-4">
          Already have an account?
          <router-link to="/login" class="text-brand-accent hover:underline">Sign In</router-link>
        </p>
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
  const p = password.value;
  let score = 0;
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
  try {
    await auth.registerCustomer(fullName.value, email.value, password.value);
    submitted.value = true;
  } catch (err) {
    error.value = err.message;
  }
}
</script>
