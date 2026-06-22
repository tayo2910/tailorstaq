<template>
  <div>
    <h2 class="font-display text-headline-md text-on-surface mb-4">Profile</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <LoadingSpinner :visible="loading" />
    <form @submit.prevent="handleUpdate" class="space-y-4 max-w-sm">
      <div>
        <label class="block font-label-md text-label-md text-on-surface mb-1">Full Name</label>
        <input v-model="fullName" class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
      </div>
      <div>
        <label class="block font-label-md text-label-md text-on-surface mb-1">Email</label>
        <input v-model="email" type="email" class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
      </div>
      <button type="submit" class="bg-primary text-on-primary px-6 py-3 rounded-lg font-label-md hover:bg-primary-container transition-all">Save</button>
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
  try { await api.patch('/customers/me/profile', { full_name: fullName.value, email: email.value || undefined }); }
  catch (err) { error.value = extractError(err); } finally { loading.value = false; }
}
</script>
