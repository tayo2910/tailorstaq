<template>
  <div>
    <h2 class="font-display text-headline-md text-on-surface mb-4">My Orders</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <LoadingSpinner :visible="loading" />
    <div v-if="!loading && orders.length === 0" class="text-on-surface-variant font-body-md">No orders yet.</div>
    <div v-else class="space-y-gutter">
      <div v-for="o in orders" :key="o.id" class="bg-surface-container-lowest p-5 rounded-xl shadow-[0px_2px_8px_rgba(111,37,18,0.05)] border border-outline-variant/10 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-primary/30 transition-colors" @click="router.push(`/customer/orders/${o.id}`)">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center">
            <span class="material-symbols-outlined text-on-surface-variant">content_cut</span>
          </div>
          <div>
            <p class="font-sans text-body-lg text-on-surface">{{ o.shop_name || 'Shop' }}</p>
            <p class="text-label-sm text-on-surface-variant">{{ o.product_name }} • {{ o.reference }}</p>
          </div>
        </div>
        <div class="flex items-center gap-4 self-end md:self-auto">
          <span class="px-3 py-1 rounded-full font-label-sm" :class="statusBadge(o.status)">{{ o.status }}</span>
        </div>
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

const statusBadgeMap = {
  'received': 'bg-surface-container-high text-on-surface-variant',
  'in-production': 'bg-secondary-fixed text-on-secondary-fixed-variant',
  'ready-for-pickup': 'bg-primary-fixed text-on-primary-fixed-variant',
  'completed': 'bg-tertiary-fixed text-on-tertiary-fixed',
  'cancelled': 'bg-error-container text-on-error-container',
};

function statusBadge(s) { return statusBadgeMap[s?.toLowerCase()] || 'bg-surface-container-high text-on-surface-variant'; }

onMounted(() => fetchOrders());

async function fetchOrders() {
  loading.value = true;
  error.value = '';
  try { const { data } = await api.get('/customers/me/orders'); orders.value = data.orders; }
  catch (err) { error.value = extractError(err); } finally { loading.value = false; }
}
</script>
