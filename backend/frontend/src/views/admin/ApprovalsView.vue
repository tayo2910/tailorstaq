<template>
  <div>
    <h2 class="font-display text-headline-md text-on-surface mb-4">Approval Requests</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <div class="flex gap-2 mb-4">
      <button v-for="s in statuses" :key="s" @click="currentStatus = s; fetchApprovals()"
        :class="['px-4 py-2 rounded-lg font-label-md transition-all', currentStatus === s ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high']">
        {{ s }}
      </button>
    </div>
    <LoadingSpinner :visible="loading" />
    <div v-if="!loading && approvals.length === 0" class="text-on-surface-variant font-body-md">No approval requests.</div>
    <div v-else class="space-y-gutter">
      <div v-for="a in approvals" :key="a.id" class="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/10 flex items-center justify-between shadow-sm">
        <div>
          <p class="font-sans text-body-lg text-on-surface">{{ a.business_name }}</p>
          <p class="text-label-sm text-on-surface-variant">{{ a.contact_email }} · {{ a.status }}</p>
          <p v-if="a.rejection_reason" class="text-label-sm text-error-container mt-1">Reason: {{ a.rejection_reason }}</p>
        </div>
        <div v-if="a.status === 'pending'" class="flex gap-2">
          <button @click="handleApprove(a.id)" class="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-sm hover:bg-primary-container transition-all">Approve</button>
          <button @click="selectedRequestId = a.id; showRejectModal = true" class="border border-error text-error px-4 py-2 rounded-lg font-label-sm hover:bg-error-container transition-all">Reject</button>
        </div>
      </div>
    </div>
    <Modal :visible="showRejectModal" @close="showRejectModal = false">
      <h3 class="font-display text-headline-md text-on-surface mb-4">Rejection Reason</h3>
      <textarea v-model="rejectionReason" rows="3" class="w-full border border-outline-variant rounded-lg px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none bg-surface mb-4" placeholder="Enter reason (required)"></textarea>
      <div class="flex justify-end gap-2">
        <button @click="showRejectModal = false" class="px-6 py-3 rounded-lg border border-outline-variant font-label-md text-on-surface-variant">Cancel</button>
        <button @click="handleReject" :disabled="!rejectionReason.trim()" class="bg-error text-on-error px-6 py-3 rounded-lg font-label-md disabled:opacity-50">Reject</button>
      </div>
    </Modal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import * as adminApi from '../../api/admin.api.js';
import { extractError } from '../../api/index.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';
import Modal from '../../components/common/Modal.vue';

const approvals = ref([]);
const loading = ref(false);
const error = ref('');
const currentStatus = ref('pending');
const statuses = ['all', 'pending', 'approved', 'rejected'];
const showRejectModal = ref(false);
const selectedRequestId = ref(null);
const rejectionReason = ref('');

onMounted(() => fetchApprovals());

async function fetchApprovals() {
  loading.value = true;
  error.value = '';
  try {
    const status = currentStatus.value === 'all' ? undefined : currentStatus.value;
    const { data } = await adminApi.listApprovals(status);
    approvals.value = data.approvals;
  } catch (err) { error.value = extractError(err); } finally { loading.value = false; }
}

async function handleApprove(requestId) {
  error.value = '';
  try { await adminApi.processApproval(requestId, 'approve'); await fetchApprovals(); }
  catch (err) { error.value = extractError(err); }
}

async function handleReject() {
  error.value = '';
  try {
    await adminApi.processApproval(selectedRequestId.value, 'reject', rejectionReason.value);
    showRejectModal.value = false; rejectionReason.value = '';
    await fetchApprovals();
  } catch (err) { error.value = extractError(err); }
}
</script>
