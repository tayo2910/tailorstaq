<template>
  <div class="min-h-screen flex flex-col bg-background">
    <NavBar />
    <main class="flex-1 flex items-center justify-center px-4">
      <div class="text-center max-w-md">
        <h2 class="font-display text-headline-md text-primary mb-4">Email Verification</h2>
        <p class="font-body-md text-on-surface-variant mb-4">{{ message }}</p>
        <LoadingSpinner :visible="loading" />
        <p v-if="verified" class="font-label-md text-label-md text-on-surface-variant mt-4">
          <router-link to="/login" class="text-primary hover:underline">Proceed to Sign In</router-link>
        </p>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api, { extractError } from '../../api/index.js';
import NavBar from '../../components/common/NavBar.vue';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';

const route = useRoute();
const message = ref('Verifying your email...');
const loading = ref(true);
const verified = ref(false);

onMounted(async () => {
  try {
    const token = route.query.token;
    if (!token) { message.value = 'No verification token provided.'; loading.value = false; return; }
    await api.post('/auth/verify-email', { token });
    message.value = 'Your email has been verified successfully!';
    verified.value = true;
  } catch (err) { message.value = extractError(err) || 'Verification failed. The link may be expired.'; }
  finally { loading.value = false; }
});
</script>
