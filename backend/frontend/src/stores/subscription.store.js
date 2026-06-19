import { defineStore } from 'pinia';
import { ref } from 'vue';
import * as subscriptionsApi from '../api/subscriptions.api.js';
import { extractError } from '../api/index.js';

export const useSubscriptionStore = defineStore('subscription', () => {
  const subscription = ref(null);
  const usage = ref(null);
  const upgradeOptions = ref(null);
  const loading = ref(false);

  async function fetchSubscription() {
    loading.value = true;
    try {
      const { data } = await subscriptionsApi.getMySubscription();
      subscription.value = data.subscription;
      usage.value = data.usage;
      upgradeOptions.value = data.upgradeOptions;
      return data;
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  async function upgrade(billingPeriod) {
    loading.value = true;
    try {
      const { data } = await subscriptionsApi.initiateUpgrade(billingPeriod);
      return data;
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  async function confirmPayment(paymentRecordId, paymentReference) {
    loading.value = true;
    try {
      const { data } = await subscriptionsApi.confirmUpgrade(paymentRecordId, paymentReference);
      return data;
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  return {
    subscription, usage, upgradeOptions, loading,
    fetchSubscription, upgrade, confirmPayment,
  };
});
