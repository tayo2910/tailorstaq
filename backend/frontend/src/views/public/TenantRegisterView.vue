<template>
  <div class="min-h-screen flex flex-col bg-background">
    <NavBar />
    <main class="flex-1 flex items-center justify-center px-4">
      <div v-if="submitted" class="text-center max-w-lg">
        <h2 class="font-display text-headline-md text-primary mb-4">Welcome to TailorStaq</h2>
        <p class="font-body-md text-on-surface-variant mb-3">Your registration has been submitted successfully. You'll receive an email once your shop is approved.</p>
        <p class="font-body-md text-on-surface-variant">TailorStaq is a community of tailoring businesses in one marketplace — connecting independent tailors with customers who value quality craftsmanship. Together, we make bespoke fashion accessible to everyone.</p>
      </div>
      <div v-else class="w-full max-w-sm">
        <h2 class="font-display text-headline-lg-mobile text-on-surface mb-6 text-center">Register Your Shop</h2>
        <ErrorBanner :message="error" @dismiss="error = ''" />
        <form @submit.prevent="handleRegister" class="space-y-4">
          <div>
            <label class="block font-label-md text-label-md text-on-surface mb-1">Business Name</label>
            <input v-model="businessName" required maxlength="100" class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
          </div>
          <div>
            <label class="block font-label-md text-label-md text-on-surface mb-1">Contact Email</label>
            <input v-model="contactEmail" type="email" required class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
          </div>
          <div>
            <label class="block font-label-md text-label-md text-on-surface mb-1">Phone</label>
            <input v-model="phone" required class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
          </div>
          <div>
            <label class="block font-label-md text-label-md text-on-surface mb-1">Description</label>
            <textarea v-model="description" required maxlength="500" rows="3" class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface"></textarea>
          </div>
          <LoadingSpinner :visible="loading" />
          <button type="submit" :disabled="loading" class="w-full bg-primary text-on-primary py-3 rounded-lg font-label-md hover:bg-primary-container transition-all disabled:opacity-50">Submit Registration</button>
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
    await api.post('/tenants/register', { business_name: businessName.value, contact_email: contactEmail.value, phone: phone.value, business_description: description.value });
    submitted.value = true;
  } catch (err) { error.value = extractError(err); } finally { loading.value = false; }
}
</script>
