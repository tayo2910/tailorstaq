<template>
  <div>
    <section class="mb-stack-md">
      <h2 class="font-display text-headline-md text-on-surface">Welcome back, Artisan</h2>
      <p class="font-body-md text-on-surface-variant">Here is your business performance for this month.</p>
    </section>
    <div class="grid grid-cols-1 md:grid-cols-4 gap-gutter mb-stack-md">
      <div class="md:col-span-2 bg-surface-container-lowest p-6 rounded-xl shadow-[0px_8px_24px_rgba(111,37,18,0.08)] border border-outline-variant/20">
        <div class="flex justify-between items-start mb-4">
          <div class="p-2 bg-primary-fixed rounded-lg">
            <span class="material-symbols-outlined text-primary">payments</span>
          </div>
          <span class="text-secondary font-label-md bg-secondary-fixed px-2 py-1 rounded-full text-xs">+12.5%</span>
        </div>
        <p class="font-label-md text-on-surface-variant uppercase tracking-wider mb-1">Total Revenue</p>
        <h3 class="font-display text-display-lg text-primary">$42,850.00</h3>
      </div>
      <div class="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_8px_24px_rgba(111,37,18,0.08)] border border-outline-variant/20">
        <div class="flex justify-between items-start mb-4">
          <div class="p-2 bg-tertiary-fixed rounded-lg">
            <span class="material-symbols-outlined text-tertiary">inventory_2</span>
          </div>
        </div>
        <p class="font-label-md text-on-surface-variant uppercase tracking-wider mb-1">Active Orders</p>
        <h3 class="font-display text-headline-lg text-on-surface">28</h3>
        <p class="text-on-surface-variant text-label-sm mt-2">4 due this week</p>
      </div>
      <div class="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_8px_24px_rgba(111,37,18,0.08)] border border-outline-variant/20">
        <div class="flex justify-between items-start mb-4">
          <div class="p-2 bg-secondary-fixed rounded-lg">
            <span class="material-symbols-outlined text-secondary">analytics</span>
          </div>
        </div>
        <p class="font-label-md text-on-surface-variant uppercase tracking-wider mb-1">AI Accuracy</p>
        <h3 class="font-display text-headline-lg text-on-surface">98.4%</h3>
        <p class="text-on-surface-variant text-label-sm mt-2">Measurement Precision</p>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-stack-md">
      <div class="md:col-span-2 bg-surface-container-lowest p-6 rounded-xl shadow-[0px_8px_24px_rgba(111,37,18,0.08)] border border-outline-variant/20">
        <div class="flex items-center justify-between mb-8">
          <h4 class="font-sans text-title-lg text-on-surface">Revenue Trends</h4>
          <div class="flex gap-2">
            <span class="text-label-sm text-on-surface-variant border border-outline-variant px-3 py-1 rounded-full cursor-pointer hover:bg-surface-container transition-colors">Daily</span>
            <span class="text-label-sm text-on-primary-container bg-primary-container px-3 py-1 rounded-full">Monthly</span>
          </div>
        </div>
        <div class="relative h-48 w-full rounded-lg border-b border-l border-outline-variant/30 overflow-hidden" style="background: linear-gradient(180deg, rgba(111, 37, 18, 0.1) 0%, rgba(111, 37, 18, 0) 100%);">
          <svg class="absolute bottom-0 w-full h-full text-primary" preserveAspectRatio="none" viewBox="0 0 400 100">
            <path d="M0,80 Q50,70 100,85 T200,40 T300,60 T400,20" fill="none" stroke="currentColor" stroke-width="3"></path>
            <path d="M0,80 Q50,70 100,85 T200,40 T300,60 T400,20 V100 H0 Z" fill="currentColor" fill-opacity="0.05"></path>
          </svg>
        </div>
        <div class="flex justify-between mt-4 text-label-sm text-on-surface-variant px-2">
          <span>Week 1</span>
          <span>Week 2</span>
          <span>Week 3</span>
          <span>Week 4</span>
        </div>
      </div>
      <div class="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_8px_24px_rgba(111,37,18,0.08)] border border-outline-variant/20 flex flex-col items-center justify-center text-center">
        <h4 class="font-sans text-title-lg text-on-surface mb-6">Client Retention</h4>
        <div class="relative w-32 h-32 flex items-center justify-center">
          <svg class="w-full h-full -rotate-90" viewBox="0 0 128 128">
            <circle class="text-surface-container-high" cx="64" cy="64" fill="transparent" r="58" stroke="currentColor" stroke-width="8"></circle>
            <circle class="text-primary" cx="64" cy="64" fill="transparent" r="58" stroke="currentColor" stroke-dasharray="364.4" stroke-dashoffset="54.6" stroke-width="8"></circle>
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="font-display text-headline-md text-primary">85%</span>
          </div>
        </div>
        <p class="font-label-md text-on-surface-variant mt-6 px-4">Loyalty rate grew by 4% since the last quarter.</p>
        <button class="mt-4 text-primary font-label-md hover:underline">View Analytics</button>
      </div>
    </div>
    <section>
      <div class="flex items-center justify-between mb-4">
        <h4 class="font-display text-title-lg text-on-surface">Recent Orders</h4>
        <router-link to="/tenant/orders" class="text-secondary font-label-md flex items-center gap-1 hover:underline">
          View all orders
          <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
        </router-link>
      </div>
      <div class="space-y-gutter">
        <div v-for="order in recentOrders" :key="order.id" class="bg-surface-container-lowest p-5 rounded-xl shadow-[0px_2px_8px_rgba(111,37,18,0.05)] border border-outline-variant/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center">
              <span class="material-symbols-outlined text-on-surface-variant">content_cut</span>
            </div>
            <div>
              <p class="font-sans text-body-lg text-on-surface">{{ order.customer_name || 'Client' }}</p>
              <p class="text-label-sm text-on-surface-variant">{{ order.product_name || 'Garment' }} • ID: #{{ order.reference || order.id }}</p>
            </div>
          </div>
          <div class="flex items-center justify-between md:gap-8">
            <div class="text-left md:text-right">
              <p class="font-label-md text-on-surface">${{ parseFloat(order.total || 0).toFixed(2) }}</p>
              <p class="text-label-sm text-on-surface-variant">{{ new Date(order.created_at).toLocaleDateString() }}</p>
            </div>
            <span class="flex items-center gap-1 px-3 py-1 rounded-full text-label-sm" :class="statusBadge(order.status)">
              <span class="w-2 h-2 rounded-full" :class="statusDot(order.status)"></span>
              {{ order.status || 'Received' }}
            </span>
          </div>
        </div>
        <div v-if="recentOrders.length === 0" class="text-center py-8 text-on-surface-variant font-body-md">No orders yet.</div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../api/index.js';

const recentOrders = ref([]);

const statusBadgeMap = {
  'in-production': 'bg-secondary-fixed text-on-secondary-fixed-variant',
  'cutting': 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  'sewing': 'bg-secondary-fixed text-on-secondary-fixed-variant',
  'finishing': 'bg-primary-fixed text-on-primary-fixed-variant',
  'ready-for-pickup': 'bg-primary-fixed text-on-primary-fixed-variant',
  'completed': 'bg-tertiary-fixed text-on-tertiary-fixed',
  'received': 'bg-surface-container-high text-on-surface-variant',
};

const statusDotMap = {
  'in-production': 'bg-secondary',
  'cutting': 'bg-tertiary',
  'sewing': 'bg-secondary',
  'finishing': 'bg-primary',
  'ready-for-pickup': 'bg-primary',
  'completed': 'bg-tertiary',
  'received': 'bg-outline',
};

function statusBadge(s) { return statusBadgeMap[s?.toLowerCase()] || 'bg-surface-container-high text-on-surface-variant'; }
function statusDot(s) { return statusDotMap[s?.toLowerCase()] || 'bg-outline'; }

onMounted(async () => {
  try {
    const { data } = await api.get('/shops/me/orders');
    recentOrders.value = (data.orders || []).slice(0, 3);
  } catch { recentOrders.value = []; }
});
</script>
