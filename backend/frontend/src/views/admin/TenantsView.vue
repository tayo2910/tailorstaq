<template>
  <div>
    <h2 class="font-display text-headline-md text-on-surface mb-4">Tenants</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <LoadingSpinner :visible="loading" />
    <div v-if="!loading && tenants.length === 0" class="text-on-surface-variant font-body-md">No tenants found.</div>
    <div v-else class="overflow-x-auto">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-container text-left">
            <th class="p-3 font-label-md text-on-surface-variant">Business Name</th>
            <th class="p-3 font-label-md text-on-surface-variant">Subscription</th>
            <th class="p-3 font-label-md text-on-surface-variant">Status</th>
            <th class="p-3 font-label-md text-on-surface-variant">Registered</th>
            <th class="p-3 font-label-md text-on-surface-variant">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tenants" :key="t.id" class="border-t border-outline-variant/20">
            <td class="p-3 font-body-md text-on-surface">{{ t.business_name }}</td>
            <td class="p-3 font-body-md text-on-surface-variant">{{ t.subscription_tier ?? 'N/A' }}</td>
            <td class="p-3">
              <span class="px-3 py-1 rounded-full font-label-sm" :class="t.status === 'active' ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-error-container text-on-error-container'">{{ t.status }}</span>
            </td>
            <td class="p-3 font-body-md text-on-surface-variant">{{ new Date(t.registration_date).toLocaleDateString() }}</td>
            <td class="p-3">
              <button v-if="t.status === 'active'" @click="handleSuspend(t.id)" class="bg-error text-on-error px-4 py-2 rounded-lg font-label-sm hover:opacity-90 transition-all">Suspend</button>
              <button v-else @click="handleReactivate(t.id)" class="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-sm hover:bg-primary-container transition-all">Reactivate</button>
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
  try { const { data } = await adminApi.listTenants(); tenants.value = data.tenants; }
  catch (err) { error.value = extractError(err); } finally { loading.value = false; }
}

async function handleSuspend(tenantId) {
  error.value = '';
  try { await adminApi.updateTenantStatus(tenantId, 'suspend'); await fetchTenants(); }
  catch (err) { error.value = extractError(err); }
}

async function handleReactivate(tenantId) {
  error.value = '';
  try { await adminApi.updateTenantStatus(tenantId, 'reactivate'); await fetchTenants(); }
  catch (err) { error.value = extractError(err); }
}
</script>
