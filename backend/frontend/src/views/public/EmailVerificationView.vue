<template>
  <div class="min-h-screen flex flex-col">
    <NavBar />
    <main class="flex-1 flex items-center justify-center px-4">
      <div class="text-center max-w-md">
        <h2 class="text-2xl font-bold text-brand-dark mb-4">Email Verification</h2>
        <LoadingSpinner :visible="verifying" />
        <p v-if="verifying" class="text-gray-600">Verifying your email...</p>
        <p v-else-if="success" class="text-green-600">
          Your email has been verified! You can now sign in.
        </p>
        <ErrorBanner v-else-if="error" :message="error" :dismissible="false" />
        <router-link
          v-if="success"
          to="/login"
          class="inline-block mt-4 bg-brand-dark text-white px-6 py-2 rounded font-semibold hover:opacity-90"
        >
          Sign In
        </router-link>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store.js';
import NavBar from '../../components/common/NavBar.vue';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const auth = useAuthStore();
const route = useRoute();
const verifying = ref(true);
const success = ref(false);
const error = ref('');

onMounted(async () => {
  const token = route.query.token;
  if (!token) {
    error.value = 'No verification token provided.';
    verifying.value = false;
    return;
  }
  try {
    await auth.verifyEmail(token);
    success.value = true;
  } catch (err) {
    error.value = err.message;
  } finally {
    verifying.value = false;
  }
});
</script>
