<template>
  <div>
    <h2 class="text-xl font-bold text-brand-dark mb-4">Shop Setup</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <LoadingSpinner :visible="loading" />

    <div v-if="subscription" class="mb-4 p-3 bg-gray-50 rounded text-sm">
      <p><strong>Subscription:</strong> {{ subscription.tier }}</p>
      <p v-if="usage">
        Products: {{ usage.activeProducts }}/{{ usage.activeProductsLimit ?? '&infin;' }}
        &middot; Monthly Orders: {{ usage.monthlyOrders }}/{{ usage.monthlyOrdersLimit ?? '&infin;' }}
      </p>
    </div>

    <form @submit.prevent="handleSave" class="space-y-4 max-w-md" v-if="shop">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Shop Name</label>
        <input v-model="form.name" maxlength="100" class="w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
        <input v-model="form.address" maxlength="255" class="w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
        <input v-model="form.phone" class="w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
        <input v-model="form.contact_email" type="email" class="w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Logo</label>
        <input type="file" accept="image/png,image/jpeg,image/svg+xml" @change="onLogoChange" />
      </div>
      <button
        type="submit"
        class="bg-brand-dark text-white px-4 py-2 rounded hover:opacity-90"
      >
        Save
      </button>
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

  const shopId = 'me';
  await shopStore.fetchShop(shopId);
  shop.value = shopStore.shop;
  if (shop.value) {
    form.value = {
      name: shop.value.name || '',
      address: shop.value.address || '',
      phone: shop.value.phone || '',
      contact_email: shop.value.contact_email || '',
    };
  }
});

function onLogoChange(e) {
  logoFile.value = e.target.files[0] || null;
}

async function handleSave() {
  loading.value = true;
  error.value = '';
  try {
    const shopId = 'me';
    await shopStore.saveShop(shopId, form.value);
    if (logoFile.value) {
      await shopStore.uploadShopLogo(shopId, logoFile.value);
    }
    shop.value = shopStore.shop;
  } catch (err) {
    error.value = extractError(err);
  } finally {
    loading.value = false;
  }
}
</script>
