<template>
  <div>
    <h2 class="font-display text-headline-md text-on-surface mb-4">Platform Metrics</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <div class="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4 items-start sm:items-end">
      <div>
        <label class="block font-label-sm text-label-sm text-on-surface-variant mb-1">From</label>
        <input v-model="from" type="date" class="border border-outline-variant rounded-lg px-4 py-2 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
      </div>
      <div>
        <label class="block font-label-sm text-label-sm text-on-surface-variant mb-1">To</label>
        <input v-model="to" type="date" class="border border-outline-variant rounded-lg px-4 py-2 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
      </div>
      <button @click="fetchMetrics" class="bg-primary text-on-primary px-6 py-2 rounded-lg font-label-md hover:bg-primary-container transition-all">Apply</button>
    </div>
    <LoadingSpinner :visible="loading" />
    <div v-if="metrics" class="grid grid-cols-1 md:grid-cols-3 gap-gutter">
      <div class="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_8px_24px_rgba(111,37,18,0.08)] border border-outline-variant/20 text-center">
        <p class="font-display text-display-lg text-primary">{{ metrics.totalTenants }}</p>
        <p class="font-label-md text-on-surface-variant">Total Tenants</p>
      </div>
      <div class="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_8px_24px_rgba(111,37,18,0.08)] border border-outline-variant/20 text-center">
        <p class="font-display text-display-lg text-primary">{{ totalSubscriptions }}</p>
        <p class="font-label-md text-on-surface-variant">Active Subscriptions</p>
        <p class="font-label-sm text-label-sm text-on-surface-variant mt-2">Free: {{ metrics.subscriptionsByTier?.free ?? 0 }} · Paid: {{ metrics.subscriptionsByTier?.paid ?? 0 }}</p>
      </div>
      <div class="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_8px_24px_rgba(111,37,18,0.08)] border border-outline-variant/20 text-center">
        <p class="font-display text-display-lg text-primary">{{ metrics.totalOrders }}</p>
        <p class="font-label-md text-on-surface-variant">Orders (in range)</p>
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
  } catch (err) { error.value = extractError(err); } finally { loading.value = false; }
}
</script>
