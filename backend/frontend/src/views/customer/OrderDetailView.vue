<template>
  <div>
    <router-link to="/customer/orders" class="text-brand-accent hover:underline text-sm">&larr; Back</router-link>
    <LoadingSpinner :visible="loading" />
    <ErrorBanner :message="error" @dismiss="error = ''" />

    <div v-if="order" class="mt-4">
      <h2 class="text-xl font-bold text-brand-dark mb-4">Order {{ order.order?.reference }}</h2>

      <div class="border rounded p-4 mb-4">
        <p><strong>Shop:</strong> {{ order.order?.shop_name }}</p>
        <p><strong>Product:</strong> {{ order.order?.product_name }}</p>
        <p><strong>Quantity:</strong> {{ order.order?.quantity }}</p>
        <p><strong>Status:</strong>
          <span class="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">{{ order.order?.status }}</span>
        </p>
      </div>

      <h3 class="font-semibold mb-2">Status History</h3>
      <div v-if="order.statusHistory" class="space-y-2">
        <div
          v-for="h in order.statusHistory"
          :key="h.id"
          class="flex justify-between text-sm border-b py-1"
        >
          <span>{{ h.status }}</span>
          <span class="text-gray-500">{{ new Date(h.recorded_at).toLocaleString() }}</span>
        </div>
      </div>

      <button
        v-if="order.order?.status === 'completed'"
        @click="handleDownload"
        class="mt-4 bg-brand-dark text-white px-4 py-2 rounded hover:opacity-90"
      >
        Download Receipt
      </button>
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
  try {
    const { data } = await api.get(`/customers/me/orders/${route.params.id}`);
    order.value = data;
  } catch (err) {
    error.value = extractError(err);
  } finally {
    loading.value = false;
  }
}

async function handleDownload() {
  try {
    const { data } = await api.get(`/customers/me/orders/${route.params.id}/receipt`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${order.value.order?.reference}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    error.value = extractError(err);
  }
}
</script>
