<template>
  <div>
    <h2 class="text-xl font-bold text-brand-dark mb-4">Orders</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <LoadingSpinner :visible="loading" />
    <div v-if="!loading && orders.length === 0" class="text-gray-500">No orders yet.</div>
    <div v-else class="space-y-3">
      <div v-for="o in orders" :key="o.id" class="border rounded p-4">
        <div class="flex justify-between items-start">
          <div>
            <p class="font-semibold">{{ o.reference }}</p>
            <p class="text-sm text-gray-500">{{ o.product_name }} &middot; Qty: {{ o.quantity }}</p>
            <p class="text-sm text-gray-500">{{ o.customer_name }} &middot; {{ new Date(o.created_at).toLocaleDateString() }}</p>
          </div>
          <div class="flex items-center gap-2">
            <span
              :class="statusClass(o.status)"
              class="px-2 py-0.5 rounded text-xs font-semibold"
            >
              {{ o.status }}
            </span>
            <select
              v-if="!isTerminal(o.status)"
              :value="''"
              @change="handleStatusUpdate(o.id, $event.target.value)"
              class="text-sm border rounded px-2 py-1"
            >
              <option value="" disabled>Update...</option>
              <option v-for="ns in nextStatuses(o.status)" :key="ns" :value="ns">
                {{ ns }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api, { extractError } from '../../api/index.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const orders = ref([]);
const loading = ref(false);
const error = ref('');

const STATUS_LIFECYCLE = {
  'received': ['in-progress', 'cancelled'],
  'in-progress': ['ready-for-pickup', 'cancelled'],
  'ready-for-pickup': ['completed', 'cancelled'],
};

const terminalStates = new Set(['completed', 'cancelled']);

function isTerminal(s) { return terminalStates.has(s); }
function nextStatuses(s) { return STATUS_LIFECYCLE[s] || []; }

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
    const { data } = await api.get('/shops/me/orders');
    orders.value = data.orders;
  } catch (err) {
    error.value = extractError(err);
  } finally {
    loading.value = false;
  }
}

async function handleStatusUpdate(orderId, newStatus) {
  if (!newStatus) return;
  error.value = '';
  try {
    await api.patch(`/shops/me/orders/${orderId}/status`, { status: newStatus });
    await fetchOrders();
  } catch (err) {
    error.value = extractError(err);
  }
}
</script>
