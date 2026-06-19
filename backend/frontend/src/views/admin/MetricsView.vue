<template>
  <div>
    <h2 class="text-xl font-bold text-brand-dark mb-4">Platform Metrics</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <div class="flex gap-4 mb-4 items-end">
      <div>
        <label class="block text-sm text-gray-600">From</label>
        <input v-model="from" type="date" class="border rounded px-3 py-1" />
      </div>
      <div>
        <label class="block text-sm text-gray-600">To</label>
        <input v-model="to" type="date" class="border rounded px-3 py-1" />
      </div>
      <button
        @click="fetchMetrics"
        class="bg-brand-dark text-white px-4 py-1.5 rounded text-sm hover:opacity-90"
      >
        Apply
      </button>
    </div>
    <LoadingSpinner :visible="loading" />
    <div v-if="metrics" class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="border rounded p-4 text-center">
        <p class="text-3xl font-bold text-brand-dark">{{ metrics.totalTenants }}</p>
        <p class="text-sm text-gray-500">Total Tenants</p>
      </div>
      <div class="border rounded p-4 text-center">
        <p class="text-3xl font-bold text-brand-dark">{{ totalSubscriptions }}</p>
        <p class="text-sm text-gray-500">Active Subscriptions</p>
        <p class="text-xs text-gray-400">
          Free: {{ metrics.subscriptionsByTier?.free ?? 0 }}
          &middot; Paid: {{ metrics.subscriptionsByTier?.paid ?? 0 }}
        </p>
      </div>
      <div class="border rounded p-4 text-center">
        <p class="text-3xl font-bold text-brand-dark">{{ metrics.totalOrders }}</p>
        <p class="text-sm text-gray-500">Orders (in range)</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import * as adminApi from '../../api/admin.api.js';
import { extractError } from '../../api/index.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const metrics = ref(null);
const loading = ref(false);
const error = ref('');
const from = ref('');
const to = ref('');

const totalSubscriptions = computed(() => {
  if (!metrics.value?.subscriptionsByTier) return 0;
  const s = metrics.value.subscriptionsByTier;
  return (s.free ?? 0) + (s.paid ?? 0);
});

onMounted(() => fetchMetrics());

async function fetchMetrics() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await adminApi.getMetrics(from.value || undefined, to.value || undefined);
    metrics.value = data;
  } catch (err) {
    error.value = extractError(err);
  } finally {
    loading.value = false;
  }
}
</script>
