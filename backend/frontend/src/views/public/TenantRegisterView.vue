<template>
  <div class="min-h-screen flex flex-col">
    <NavBar />
    <main class="flex-1 flex items-center justify-center px-4">
      <div v-if="submitted" class="text-center max-w-md">
        <h2 class="text-2xl font-bold text-brand-dark mb-4">Registration submitted</h2>
        <p class="text-gray-600">
          Your shop registration request has been received. We'll review it and notify you
          once it's approved.
        </p>
      </div>
      <div v-else class="w-full max-w-sm">
        <h2 class="text-2xl font-bold text-brand-dark mb-6 text-center">Register Your Shop</h2>
        <ErrorBanner :message="error" @dismiss="error = ''" />
        <form @submit.prevent="handleRegister" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
            <input
              v-model="businessName"
              required
              maxlength="100"
              class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
            <input
              v-model="contactEmail"
              type="email"
              required
              class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              v-model="phone"
              required
              class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              v-model="description"
              required
              maxlength="500"
              rows="3"
              class="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
            ></textarea>
          </div>
          <LoadingSpinner :visible="loading" />
          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-brand-dark text-white py-2 rounded font-semibold hover:opacity-90 disabled:opacity-50"
          >
            Submit Registration
          </button>
        </form>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import api, { extractError } from '../../api/index.js';
import NavBar from '../../components/common/NavBar.vue';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const businessName = ref('');
const contactEmail = ref('');
const phone = ref('');
const description = ref('');
const error = ref('');
const loading = ref(false);
const submitted = ref(false);

async function handleRegister() {
  error.value = '';
  loading.value = true;
  try {
    await api.post('/tenants/register', {
      businessName: businessName.value,
      contactEmail: contactEmail.value,
      phone: phone.value,
      description: description.value,
    });
    submitted.value = true;
  } catch (err) {
    error.value = extractError(err);
  } finally {
    loading.value = false;
  }
}
</script>
