<template>
  <div>
    <router-link to="/customer/orders" class="text-primary hover:underline font-label-md">&larr; Back</router-link>
    <LoadingSpinner :visible="loading" />
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <div v-if="order" class="mt-4">
      <h2 class="font-display text-headline-md text-on-surface mb-4">Order {{ order.order?.reference }}</h2>
      <div class="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/20 space-y-3 mb-4">
        <p class="font-body-md text-on-surface"><strong>Shop:</strong> {{ order.order?.shop_name }}</p>
        <p class="font-body-md text-on-surface"><strong>Product:</strong> {{ order.order?.product_name }}</p>
        <p class="font-body-md text-on-surface"><strong>Quantity:</strong> {{ order.order?.quantity }}</p>
        <p class="font-body-md text-on-surface"><strong>Status:</strong> <span class="px-3 py-1 rounded-full font-label-sm bg-secondary-fixed text-on-secondary-fixed-variant">{{ order.order?.status }}</span></p>
      </div>
      <h3 class="font-sans text-title-lg text-on-surface mb-2">Status History</h3>
      <div v-if="order.statusHistory" class="space-y-2">
        <div v-for="h in order.statusHistory" :key="h.id" class="flex justify-between font-body-md border-b border-outline-variant/20 py-2">
          <span class="text-on-surface">{{ h.status }}</span>
          <span class="text-on-surface-variant">{{ new Date(h.recorded_at).toLocaleString() }}</span>
        </div>
      </div>
      <button v-if="order.order?.status === 'completed'" @click="handleDownload" class="mt-4 bg-primary text-on-primary px-6 py-3 rounded-lg font-label-md hover:bg-primary-container transition-all">Download Receipt</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api, { extractError } from '../../api/index.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const route = useRoute();
const order = ref(null);
const loading = ref(false);
const error = ref('');

onMounted(() => fetchDetail());

async function fetchDetail() {
  loading.value = true;
  error.value = '';
  try { const { data } = await api.get(`/customers/me/orders/${route.params.id}`); order.value = data; }
  catch (err) { error.value = extractError(err); } finally { loading.value = false; }
}

async function handleDownload() {
  try {
    const { data } = await api.get(`/customers/me/orders/${route.params.id}/receipt`, { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    const a = document.createElement('a'); a.href = url; a.download = `receipt-${order.value.order?.reference}.pdf`; a.click();
    URL.revokeObjectURL(url);
  } catch (err) { error.value = extractError(err); }
}
</script>
