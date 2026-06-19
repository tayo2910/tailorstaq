<template>
  <div>
    <h2 class="text-xl font-bold text-brand-dark mb-4">Products</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <LoadingSpinner :visible="loading" />

    <div v-if="limitError" class="bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-3 rounded mb-4">
      Free-tier product limit reached.
      <router-link to="/tenant/subscription" class="underline font-semibold">Upgrade to Paid</router-link>
    </div>

    <button
      @click="showForm = true; editProduct = null"
      class="bg-brand-dark text-white px-4 py-2 rounded mb-4 hover:opacity-90"
    >
      Add Product
    </button>

    <div v-if="!loading && products.length === 0" class="text-gray-500">No products yet.</div>
    <div v-else class="grid gap-3">
      <div v-for="p in products" :key="p.id" class="border rounded p-4 flex justify-between items-center">
        <div>
          <p class="font-semibold">{{ p.name }}</p>
          <p class="text-sm text-gray-500">${{ parseFloat(p.price).toFixed(2) }}</p>
        </div>
        <div class="flex gap-2">
          <button @click="editProduct = p; showForm = true" class="text-brand-dark underline text-sm">Edit</button>
          <button @click="handleDelete(p.id)" class="text-red-500 underline text-sm">Delete</button>
        </div>
      </div>
    </div>

    <Modal :visible="showForm" @close="showForm = false">
      <h3 class="text-lg font-semibold mb-3">{{ editProduct ? 'Edit Product' : 'Add Product' }}</h3>
      <form @submit.prevent="handleSubmit" class="space-y-3">
        <input v-model="form.name" placeholder="Name" maxlength="100" class="w-full border rounded px-3 py-2" required />
        <textarea v-model="form.description" placeholder="Description" maxlength="1000" class="w-full border rounded px-3 py-2" required></textarea>
        <input v-model="form.price" type="number" step="0.01" placeholder="Price" class="w-full border rounded px-3 py-2" required />
        <input type="file" accept="image/png,image/jpeg,image/svg+xml" @change="onImageChange" />
        <div class="flex justify-end gap-2">
          <button type="button" @click="showForm = false" class="px-4 py-2 rounded border">Cancel</button>
          <button type="submit" class="bg-brand-dark text-white px-4 py-2 rounded">{{ editProduct ? 'Update' : 'Create' }}</button>
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
  try {
    const { data } = await api.get('/shops/me/products');
    products.value = data.products;
  } catch (err) {
    error.value = extractError(err);
  } finally {
    loading.value = false;
  }
}

function onImageChange(e) {
  imageFile.value = e.target.files[0] || null;
}

async function handleSubmit() {
  loading.value = true;
  error.value = '';
  limitError.value = false;
  try {
    const payload = { ...form.value, price: parseFloat(form.value.price) };
    if (editProduct.value) {
      await api.patch(`/shops/me/products/${editProduct.value.id}`, payload);
    } else {
      await api.post('/shops/me/products', payload);
    }
    showForm.value = false;
    form.value = { name: '', description: '', price: '' };
    imageFile.value = null;
    await fetchProducts();
  } catch (err) {
    const msg = extractError(err);
    if (msg.includes('LIMIT_EXCEEDED') || msg.includes('limit')) {
      limitError.value = true;
    } else {
      error.value = msg;
    }
  } finally {
    loading.value = false;
  }
}

async function handleDelete(productId) {
  loading.value = true;
  error.value = '';
  try {
    await api.delete(`/shops/me/products/${productId}`);
    await fetchProducts();
  } catch (err) {
    error.value = extractError(err);
  } finally {
    loading.value = false;
  }
}
</script>
