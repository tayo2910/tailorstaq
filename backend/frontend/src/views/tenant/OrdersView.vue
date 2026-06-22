<template>
  <div>
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
      <div>
        <h2 class="font-display text-headline-lg-mobile md:text-headline-lg text-primary mb-2">Production Tracking</h2>
        <p class="font-body-md text-on-surface-variant">Manage your active craftsmanship pipeline and client orders.</p>
      </div>
      <button class="bg-primary text-on-primary px-6 py-3 rounded-lg font-label-md flex items-center gap-2 shadow-sm hover:opacity-90 transition-all active:scale-95">
        <span class="material-symbols-outlined">add</span>
        Add New Order
      </button>
    </div>
    <div class="bg-surface-container-low p-4 rounded-xl mb-8 flex flex-col lg:flex-row gap-4 items-center border border-outline-variant/20 shadow-sm">
      <div class="relative w-full lg:flex-1">
        <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">search</span>
        <input v-model="search" class="w-full pl-10 pr-4 py-3 bg-surface border border-outline-variant rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none font-body-md" placeholder="Search by client or order ID..." type="text" />
      </div>
      <div class="flex flex-wrap gap-3 w-full lg:w-auto">
        <select v-model="statusFilter" class="bg-surface border border-outline-variant rounded-lg px-4 py-3 font-label-md text-on-surface-variant outline-none focus:ring-1 focus:ring-primary">
          <option value="">All Statuses</option>
          <option value="received">Received</option>
          <option value="measuring">Measuring</option>
          <option value="cutting">Cutting</option>
          <option value="sewing">Sewing</option>
          <option value="finishing">Finishing</option>
          <option value="ready-for-pickup">Ready for Pickup</option>
        </select>
      </div>
    </div>
    <LoadingSpinner :visible="loading" />
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-gutter">
      <div v-for="o in filteredOrders" :key="o.id" class="bg-surface-container-lowest border border-outline-variant/30 rounded-xl overflow-hidden shadow-[0px_2px_12px_rgba(111,37,18,0.08)] flex flex-col">
        <div class="p-6 relative textile-pattern">
          <div class="flex justify-between items-start mb-4">
            <div class="flex gap-4">
              <div class="w-16 h-16 rounded bg-surface-container overflow-hidden border border-outline-variant/20 flex items-center justify-center">
                <span class="material-symbols-outlined text-outline">content_cut</span>
              </div>
              <div>
                <h3 class="font-sans text-title-lg text-primary">{{ o.customer_name || 'Client' }}</h3>
                <p class="font-label-sm text-on-surface-variant">Order #{{ o.reference || o.id }} • {{ new Date(o.created_at).toLocaleDateString() }}</p>
              </div>
            </div>
            <span class="px-3 py-1 rounded-full font-label-sm flex items-center gap-1" :class="statusLabelClass(o.status)">
              <span class="w-1.5 h-1.5 rounded-full" :class="statusDotClass(o.status)"></span>
              {{ displayStatus(o.status) }}
            </span>
          </div>
          <div class="mt-6">
            <p class="font-label-sm text-on-surface-variant mb-3 uppercase tracking-wider">Production Timeline</p>
            <div class="flex items-center w-full">
              <div v-for="(step, i) in productionSteps" :key="step.key" class="flex items-center flex-1">
                <div :class="stepIndicator(i, o.status)" class="flex items-center justify-center text-[16px]">
                  <span v-if="isCompleted(i, o.status)" class="material-symbols-outlined text-[16px]">check</span>
                  <span v-else-if="isCurrent(i, o.status)" class="text-[14px] font-bold">{{ i + 1 }}</span>
                  <span v-else class="text-[14px] font-bold">{{ i + 1 }}</span>
                </div>
                <span class="font-label-sm mt-1 text-center w-full" :class="stepTextClass(i, o.status)">{{ step.label }}</span>
                <div v-if="i < productionSteps.length - 1" class="h-[2px] flex-1 mb-4 mx-1" :class="isCompleted(i, o.status) ? 'bg-primary' : 'bg-outline-variant'"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-auto border-t border-outline-variant/20 p-4 flex justify-between bg-surface-container-low">
          <button class="text-primary font-label-md hover:underline">View Details</button>
          <select
            v-if="!isTerminal(o.status)"
            :value="''"
            @change="handleStatusUpdate(o.id, $event.target.value)"
            class="text-label-sm text-on-surface-variant border border-outline-variant rounded px-2 py-1 bg-surface"
          >
            <option value="" disabled>Update Status</option>
            <option v-for="ns in nextStatuses(o.status)" :key="ns" :value="ns">{{ displayStatus(ns) }}</option>
          </select>
        </div>
      </div>
    </div>
    <div v-if="!loading && filteredOrders.length === 0" class="text-center py-12 text-on-surface-variant font-body-md">No orders found.</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api, { extractError } from '../../api/index.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const orders = ref([]);
const loading = ref(false);
const error = ref('');
const search = ref('');
const statusFilter = ref('');

const productionSteps = [
  { key: 'measuring', label: 'Measuring' },
  { key: 'cutting', label: 'Cutting' },
  { key: 'sewing', label: 'Sewing' },
  { key: 'finishing', label: 'Finishing' },
];

const statusOrder = ['received', 'measuring', 'cutting', 'sewing', 'finishing', 'ready-for-pickup', 'completed'];
const terminalStates = new Set(['completed', 'cancelled']);

function isTerminal(s) { return terminalStates.has(s); }
function isCompleted(stepIdx, status) {
  const currentIdx = statusOrder.indexOf(status?.toLowerCase() || 'received');
  return stepIdx < currentIdx;
}
function isCurrent(stepIdx, status) {
  const currentIdx = statusOrder.indexOf(status?.toLowerCase() || 'received');
  return stepIdx === currentIdx;
}
function stepIndicator(stepIdx, status) {
  if (isCompleted(stepIdx, status)) return 'w-8 h-8 rounded-full bg-primary text-on-primary';
  if (isCurrent(stepIdx, status)) return 'w-8 h-8 rounded-full border-2 border-primary bg-surface text-primary';
  return 'w-8 h-8 rounded-full border-2 border-outline-variant bg-surface text-outline-variant';
}
function stepTextClass(stepIdx, status) {
  if (isCompleted(stepIdx, status)) return 'text-primary';
  if (isCurrent(stepIdx, status)) return 'text-primary';
  return 'text-on-surface-variant';
}

function displayStatus(s) {
  const m = {
    'received': 'Received',
    'measuring': 'Measuring',
    'cutting': 'Cutting',
    'sewing': 'Sewing',
    'finishing': 'Finishing',
    'ready-for-pickup': 'Ready for Pickup',
    'in-production': 'In Production',
    'completed': 'Completed',
  };
  return m[s?.toLowerCase()] || s;
}

function statusLabelClass(s) {
  const m = {
    'in-production': 'bg-secondary-fixed text-on-secondary-fixed-variant',
    'cutting': 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
    'sewing': 'bg-secondary-fixed text-on-secondary-fixed-variant',
    'finishing': 'bg-primary-fixed text-on-primary-fixed-variant',
    'ready-for-pickup': 'bg-primary-fixed text-on-primary-fixed-variant',
    'completed': 'bg-tertiary-fixed text-on-tertiary-fixed',
    'received': 'bg-surface-container-high text-on-surface-variant',
  };
  return m[s?.toLowerCase()] || 'bg-surface-container-high text-on-surface-variant';
}

function statusDotClass(s) {
  const m = {
    'in-production': 'bg-secondary',
    'cutting': 'bg-tertiary',
    'sewing': 'bg-secondary',
    'finishing': 'bg-primary',
    'ready-for-pickup': 'bg-primary',
    'completed': 'bg-tertiary',
    'received': 'bg-outline',
  };
  return m[s?.toLowerCase()] || 'bg-outline';
}

const filteredOrders = computed(() => {
  let result = orders.value;
  if (search.value) {
    const q = search.value.toLowerCase();
    result = result.filter(o =>
      (o.customer_name || '').toLowerCase().includes(q) ||
      (o.reference || '').toLowerCase().includes(q)
    );
  }
  if (statusFilter.value) {
    result = result.filter(o => o.status?.toLowerCase() === statusFilter.value);
  }
  return result;
});

function nextStatuses(s) {
  const map = {
    'received': ['measuring', 'cancelled'],
    'measuring': ['cutting', 'cancelled'],
    'cutting': ['sewing', 'cancelled'],
    'sewing': ['finishing', 'cancelled'],
    'finishing': ['ready-for-pickup', 'cancelled'],
    'ready-for-pickup': ['completed', 'cancelled'],
  };
  return map[s?.toLowerCase()] || [];
}

onMounted(() => fetchOrders());

async function fetchOrders() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/shops/me/orders');
    orders.value = data.orders || [];
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
