<template>
  <div>
    <h2 class="font-display text-headline-md text-on-surface mb-4">Products</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <LoadingSpinner :visible="loading" />
    <div v-if="limitError" class="bg-tertiary-fixed border border-tertiary-fixed-dim text-on-tertiary-fixed-variant px-4 py-3 rounded-xl mb-4 font-label-md">
      Free-tier product limit reached.
      <router-link to="/tenant/subscription" class="underline font-semibold">Upgrade to Paid</router-link>
    </div>
    <button @click="showForm = true; editProduct = null" class="bg-primary text-on-primary px-6 py-3 rounded-lg font-label-md mb-4 hover:bg-primary-container transition-all active:scale-95">Add Product</button>
    <div v-if="!loading && products.length === 0" class="text-on-surface-variant font-body-md">No products yet.</div>
    <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div v-for="p in products" :key="p.id" class="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20">
        <div class="aspect-square bg-surface-container rounded-lg flex items-center justify-center mb-3">
          <span class="material-symbols-outlined text-3xl text-outline-variant">checkroom</span>
        </div>
        <p class="font-sans text-title-lg text-on-surface truncate">{{ p.name }}</p>
        <p class="font-label-md text-primary">${{ parseFloat(p.price).toFixed(2) }}</p>
        <div class="flex gap-2 mt-2">
          <button @click="editProduct = p; showForm = true" class="text-primary font-label-sm text-label-sm hover:underline">Edit</button>
          <button @click="handleDelete(p.id)" class="text-error font-label-sm text-label-sm hover:underline">Delete</button>
        </div>
      </div>
    </div>
    <Modal :visible="showForm" @close="showForm = false">
      <h3 class="font-display text-headline-md mb-4">{{ editProduct ? 'Edit Product' : 'Add Product' }}</h3>
      <form @submit.prevent="handleSubmit" class="space-y-3">
        <input v-model="form.name" placeholder="Name" maxlength="100" class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" required />
        <textarea v-model="form.description" placeholder="Description" maxlength="1000" class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" required></textarea>
        <input v-model="form.price" type="number" step="0.01" placeholder="Price" class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface" required />
        <input type="file" accept="image/png,image/jpeg,image/svg+xml" @change="onImageChange" class="font-body-md" />
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" @click="showForm = false" class="px-6 py-3 rounded-lg border border-outline-variant font-label-md text-on-surface-variant">Cancel</button>
          <button type="submit" class="bg-primary text-on-primary px-6 py-3 rounded-lg font-label-md hover:bg-primary-container transition-all">{{ editProduct ? 'Update' : 'Create' }}</button>
        </div>
      </form>
    </Modal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api, { extractError } from '../../api/index.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';
import Modal from '../../components/common/Modal.vue';

const products = ref([]);
const loading = ref(false);
const error = ref('');
const limitError = ref(false);
const showForm = ref(false);
const editProduct = ref(null);
const imageFile = ref(null);
const form = ref({ name: '', description: '', price: '' });

onMounted(() => fetchProducts());

async function fetchProducts() {
  loading.value = true;
  error.value = '';
  try { const { data } = await api.get('/shops/me/products'); products.value = data.products; }
  catch (err) { error.value = extractError(err); } finally { loading.value = false; }
}

function onImageChange(e) { imageFile.value = e.target.files[0] || null; }

async function handleSubmit() {
  loading.value = true;
  error.value = '';
  limitError.value = false;
  try {
    const payload = { ...form.value, price: parseFloat(form.value.price) };
    if (editProduct.value) await api.patch(`/shops/me/products/${editProduct.value.id}`, payload);
    else await api.post('/shops/me/products', payload);
    showForm.value = false; form.value = { name: '', description: '', price: '' }; imageFile.value = null;
    await fetchProducts();
  } catch (err) {
    const msg = extractError(err);
    if (msg.includes('LIMIT_EXCEEDED') || msg.includes('limit')) limitError.value = true;
    else error.value = msg;
  } finally { loading.value = false; }
}

async function handleDelete(productId) {
  loading.value = true;
  error.value = '';
  try { await api.delete(`/shops/me/products/${productId}`); await fetchProducts(); }
  catch (err) { error.value = extractError(err); } finally { loading.value = false; }
}
</script>
