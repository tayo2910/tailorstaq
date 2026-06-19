<template>
  <div>
    <h2 class="text-xl font-bold text-brand-dark mb-4">Tenants</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <LoadingSpinner :visible="loading" />
    <div v-if="!loading && tenants.length === 0" class="text-gray-500">No tenants found.</div>
    <div v-else class="overflow-x-auto">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-gray-100 text-left">
            <th class="p-2">Business Name</th>
            <th class="p-2">Subscription</th>
            <th class="p-2">Status</th>
            <th class="p-2">Registered</th>
            <th class="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tenants" :key="t.id" class="border-t">
            <td class="p-2">{{ t.business_name }}</td>
            <td class="p-2">{{ t.subscription_tier ?? 'N/A' }}</td>
            <td class="p-2">
              <span
                :class="t.status === 'active' ? 'text-green-600' : 'text-red-500'"
              >
                {{ t.status }}
              </span>
            </td>
            <td class="p-2">{{ new Date(t.registration_date).toLocaleDateString() }}</td>
            <td class="p-2">
              <button
                v-if="t.status === 'active'"
                @click="handleSuspend(t.id)"
                class="bg-red-500 text-white px-2 py-1 rounded text-sm hover:opacity-90"
              >
                Suspend
              </button>
              <button
                v-else
                @click="handleReactivate(t.id)"
                class="bg-green-600 text-white px-2 py-1 rounded text-sm hover:opacity-90"
              >
                Reactivate
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import * as adminApi from '../../api/admin.api.js';
import { extractError } from '../../api/index.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const tenants = ref([]);
const loading = ref(false);
const error = ref('');

onMounted(() => fetchTenants());

async function fetchTenants() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await adminApi.listTenants();
    tenants.value = data.tenants;
  } catch (err) {
    error.value = extractError(err);
  } finally {
    loading.value = false;
  }
}

async function handleSuspend(tenantId) {
  error.value = '';
  try {
    await adminApi.updateTenantStatus(tenantId, 'suspend');
    await fetchTenants();
  } catch (err) {
    error.value = extractError(err);
  }
}

async function handleReactivate(tenantId) {
  error.value = '';
  try {
    await adminApi.updateTenantStatus(tenantId, 'reactivate');
    await fetchTenants();
  } catch (err) {
    error.value = extractError(err);
  }
}
</script>
