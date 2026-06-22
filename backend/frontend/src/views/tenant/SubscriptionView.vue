<template>
  <div>
    <h2 class="font-display text-headline-md text-on-surface mb-4">Subscription</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <LoadingSpinner :visible="subStore.loading" />
    <div v-if="subStore.subscription" class="max-w-lg">
      <div class="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/20 mb-4 shadow-sm">
        <p class="font-body-md text-on-surface"><strong class="text-on-surface">Current Tier:</strong> <span class="text-primary font-semibold">{{ subStore.subscription.tier }}</span></p>
        <p class="font-body-md text-on-surface"><strong class="text-on-surface">Status:</strong> <span class="px-3 py-1 rounded-full font-label-sm bg-tertiary-fixed text-on-tertiary-fixed ml-2">{{ subStore.subscription.status }}</span></p>
        <p v-if="subStore.subscription.expiresAt" class="font-body-md text-on-surface mt-2"><strong>Expires:</strong> {{ new Date(subStore.subscription.expiresAt).toLocaleDateString() }}</p>
      </div>
      <div v-if="subStore.usage" class="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/20 mb-4 shadow-sm">
        <p class="font-sans text-title-lg text-on-surface mb-2">Usage</p>
        <p class="font-body-md text-on-surface-variant">Active Products: {{ subStore.usage.activeProducts }}/{{ subStore.usage.activeProductsLimit ?? 'Unlimited' }}</p>
        <p class="font-body-md text-on-surface-variant">Monthly Orders: {{ subStore.usage.monthlyOrders }}/{{ subStore.usage.monthlyOrdersLimit ?? 'Unlimited' }}</p>
      </div>
      <div v-if="subStore.upgradeOptions" class="space-y-gutter">
        <h3 class="font-sans text-title-lg text-on-surface">Upgrade Options</h3>
        <div v-for="opt in subStore.upgradeOptions" :key="opt.billingPeriod" class="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/20 shadow-sm">
          <p class="font-sans text-title-lg text-on-surface">{{ opt.billingPeriod }}</p>
          <p class="font-display text-headline-md text-primary mt-2">{{ opt.currency }} {{ opt.amount.toFixed(2) }}</p>
          <ul class="font-body-md text-on-surface-variant list-disc list-inside mt-3 space-y-1">
            <li v-for="f in opt.features" :key="f">{{ f }}</li>
          </ul>
          <button @click="handleUpgrade(opt.billingPeriod)" class="mt-4 bg-primary text-on-primary px-6 py-3 rounded-lg font-label-md hover:bg-primary-container transition-all active:scale-95">Upgrade</button>
        </div>
      </div>
      <div v-if="pendingRecord" class="bg-surface-container-lowest p-6 rounded-xl border border-primary shadow-sm mt-4">
        <p class="font-sans text-title-lg text-on-surface">Pending upgrade</p>
        <p class="font-body-md text-on-surface-variant mt-1">Payment record {{ pendingRecord.id }} is pending confirmation.</p>
        <button @click="handleConfirm(pendingRecord.id)" class="mt-3 bg-primary text-on-primary px-6 py-3 rounded-lg font-label-md hover:bg-primary-container transition-all">Confirm Payment</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useSubscriptionStore } from '../../stores/subscription.store.js';
import { extractError } from '../../api/index.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const subStore = useSubscriptionStore();
const error = ref('');
const pendingRecord = ref(null);

onMounted(() => subStore.fetchSubscription());

async function handleUpgrade(billingPeriod) {
  error.value = '';
  try { const result = await subStore.upgrade(billingPeriod); pendingRecord.value = result.paymentRecord; }
  catch (err) { error.value = extractError(err); }
}

async function handleConfirm(recordId) {
  error.value = '';
  try {
    await subStore.confirmPayment(recordId, 'manual-' + Date.now());
    pendingRecord.value = null;
    await subStore.fetchSubscription();
  } catch (err) { error.value = extractError(err); }
}
</script>
