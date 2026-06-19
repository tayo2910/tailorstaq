<template>
  <div>
    <h2 class="text-xl font-bold text-brand-dark mb-4">My Orders</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <LoadingSpinner :visible="loading" />
    <div v-if="!loading && orders.length === 0" class="text-gray-500">No orders yet.</div>
    <div v-else class="space-y-3">
      <div
        v-for="o in orders"
        :key="o.id"
        class="border rounded p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50"
        @click="router.push(`/customer/orders/${o.id}`)"
      >
        <div>
          <p class="font-semibold">{{ o.reference }}</p>
          <p class="text-sm text-gray-500">
            {{ o.shop_name }} &middot; {{ o.product_name }} &middot; Qty: {{ o.quantity }}
          </p>
        </div>
        <span
          :class="statusClass(o.status)"
          class="px-2 py-0.5 rounded text-xs font-semibold"
        >
          {{ o.status }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api, { extractError } from '../../api/index.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const router = useRouter();
const orders = ref([]);
const loading = ref(false);
const error = ref('');

function statusClass(s) {
  const m = {
    'received': 'bg-blue-100 text-blue-800',
    'in-progress': 'bg-yellow-100 text-yellow-800',
    'ready-for-pickup': 'bg-purple-100 text-purple-800',
    'completed': 'bg-green-100 text-green-800',
    'cancelled': 'bg-red-100 text-red-800',
  };
  return m[s] || 'bg-gray-100';
}

onMounted(() => fetchOrders());

async function fetchOrders() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/customers/me/orders');
    orders.value = data.orders;
  } catch (err) {
    error.value = extractError(err);
  } finally {
    loading.value = false;
  }
}
</script>
