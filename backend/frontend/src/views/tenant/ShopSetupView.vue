<template>
  <div>
    <h2 class="font-display text-headline-md text-on-surface mb-4">Shop Setup</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <LoadingSpinner :visible="loading" />
    <div v-if="subscription" class="mb-4 p-4 bg-surface-container rounded-xl text-sm border border-outline-variant/20">
      <p><strong class="text-on-surface">Subscription:</strong> <span class="text-primary">{{ subscription.tier }}</span></p>
      <p v-if="usage" class="text-on-surface-variant mt-1">Products: {{ usage.activeProducts }}/{{ usage.activeProductsLimit ?? '∞' }} · Monthly Orders: {{ usage.monthlyOrders }}/{{ usage.monthlyOrdersLimit ?? '∞' }}</p>
    </div>
    <form @submit.prevent="handleSave" class="space-y-4 max-w-md" v-if="shop">
      <div>
        <label class="block font-label-md text-label-md text-on-surface mb-1">Shop Name</label>
        <input v-model="form.name" maxlength="100" class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
      </div>
      <div>
        <label class="block font-label-md text-label-md text-on-surface mb-1">Address</label>
        <input v-model="form.address" maxlength="255" class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
      </div>
      <div>
        <label class="block font-label-md text-label-md text-on-surface mb-1">Phone</label>
        <input v-model="form.phone" class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
      </div>
      <div>
        <label class="block font-label-md text-label-md text-on-surface mb-1">Contact Email</label>
        <input v-model="form.contact_email" type="email" class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" />
      </div>
      <div>
        <label class="block font-label-md text-label-md text-on-surface mb-1">Logo</label>
        <input type="file" accept="image/png,image/jpeg,image/svg+xml" @change="onLogoChange" class="font-body-md" />
      </div>
      <button type="submit" class="bg-primary text-on-primary px-6 py-3 rounded-lg font-label-md hover:bg-primary-container transition-all">Save</button>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useShopStore } from '../../stores/shop.store.js';
import { useSubscriptionStore } from '../../stores/subscription.store.js';
import { extractError } from '../../api/index.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const shopStore = useShopStore();
const subStore = useSubscriptionStore();
const shop = ref(null);
const subscription = ref(null);
const usage = ref(null);
const loading = ref(false);
const error = ref('');
const form = ref({ name: '', address: '', phone: '', contact_email: '' });
const logoFile = ref(null);

onMounted(async () => {
  await subStore.fetchSubscription();
  subscription.value = subStore.subscription;
  usage.value = subStore.usage;
  await shopStore.fetchShop('me');
  shop.value = shopStore.shop;
  if (shop.value) form.value = { name: shop.value.name || '', address: shop.value.address || '', phone: shop.value.phone || '', contact_email: shop.value.contact_email || '' };
});

function onLogoChange(e) { logoFile.value = e.target.files[0] || null; }

async function handleSave() {
  loading.value = true;
  error.value = '';
  try {
    await shopStore.saveShop('me', form.value);
    if (logoFile.value) await shopStore.uploadShopLogo('me', logoFile.value);
    shop.value = shopStore.shop;
  } catch (err) { error.value = extractError(err); } finally { loading.value = false; }
}
</script>
