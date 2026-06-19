<template>
  <div>
    <h2 class="text-xl font-bold text-brand-dark mb-4">Subscription</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <LoadingSpinner :visible="subStore.loading" />

    <div v-if="subStore.subscription" class="mb-6">
      <div class="border rounded p-4 mb-4">
        <p><strong>Current Tier:</strong> {{ subStore.subscription.tier }}</p>
        <p><strong>Status:</strong> {{ subStore.subscription.status }}</p>
        <p v-if="subStore.subscription.expiresAt">
          <strong>Expires:</strong> {{ new Date(subStore.subscription.expiresAt).toLocaleDateString() }}
        </p>
      </div>

      <div v-if="subStore.usage" class="border rounded p-4 mb-4">
        <p class="font-semibold mb-2">Usage</p>
        <p>Active Products: {{ subStore.usage.activeProducts }}/{{ subStore.usage.activeProductsLimit ?? 'Unlimited' }}</p>
        <p>Monthly Orders: {{ subStore.usage.monthlyOrders }}/{{ subStore.usage.monthlyOrdersLimit ?? 'Unlimited' }}</p>
      </div>

      <div v-if="subStore.upgradeOptions" class="space-y-3">
        <h3 class="font-semibold">Upgrade Options</h3>
        <div
          v-for="opt in subStore.upgradeOptions"
          :key="opt.billingPeriod"
          class="border rounded p-4"
        >
          <p class="font-semibold">{{ opt.billingPeriod }}</p>
          <p class="text-lg">{{ opt.currency }} {{ opt.amount.toFixed(2) }}</p>
          <ul class="text-sm text-gray-500 list-disc list-inside mt-2">
            <li v-for="f in opt.features" :key="f">{{ f }}</li>
          </ul>
          <button
            @click="handleUpgrade(opt.billingPeriod)"
            class="mt-3 bg-brand-accent text-brand-dark px-4 py-2 rounded hover:opacity-90"
          >
            Upgrade
          </button>
        </div>
      </div>

      <div v-if="pendingRecord" class="border rounded p-4 border-brand-accent">
        <p class="font-semibold">Pending upgrade</p>
        <p class="text-sm text-gray-500">
          Payment record {{ pendingRecord.id }} is pending confirmation.
        </p>
        <button
          @click="handleConfirm(pendingRecord.id)"
          class="mt-2 bg-green-600 text-white px-4 py-2 rounded hover:opacity-90"
        >
          Confirm Payment
        </button>
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
  try {
    const result = await subStore.upgrade(billingPeriod);
    pendingRecord.value = result.paymentRecord;
  } catch (err) {
    error.value = extractError(err);
  }
}

async function handleConfirm(recordId) {
  error.value = '';
  try {
    await subStore.confirmPayment(recordId, 'manual-' + Date.now());
    pendingRecord.value = null;
    await subStore.fetchSubscription();
  } catch (err) {
    error.value = extractError(err);
  }
}
</script>
