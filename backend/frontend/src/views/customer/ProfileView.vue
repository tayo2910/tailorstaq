<template>
  <div>
    <h2 class="text-xl font-bold text-brand-dark mb-4">Profile</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <LoadingSpinner :visible="loading" />
    <form @submit.prevent="handleUpdate" class="space-y-4 max-w-sm">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
        <input
          v-model="fullName"
          class="w-full border rounded px-3 py-2"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          v-model="email"
          type="email"
          class="w-full border rounded px-3 py-2"
        />
      </div>
      <button
        type="submit"
        class="bg-brand-dark text-white px-4 py-2 rounded hover:opacity-90"
      >
        Save
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAuthStore } from '../../stores/auth.store.js';
import api, { extractError } from '../../api/index.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const auth = useAuthStore();
const fullName = ref(auth.user?.fullName || '');
const email = ref('');
const loading = ref(false);
const error = ref('');

async function handleUpdate() {
  loading.value = true;
  error.value = '';
  try {
    await api.patch('/customers/me/profile', {
      fullName: fullName.value,
      email: email.value || undefined,
    });
  } catch (err) {
    error.value = extractError(err);
  } finally {
    loading.value = false;
  }
}
</script>
