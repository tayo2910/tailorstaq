<template>
  <div>
    <h2 class="text-xl font-bold text-brand-dark mb-4">Approval Requests</h2>
    <ErrorBanner :message="error" @dismiss="error = ''" />
    <div class="flex gap-2 mb-4">
      <button
        v-for="s in statuses"
        :key="s"
        @click="currentStatus = s; fetchApprovals()"
        :class="['px-3 py-1 rounded text-sm', currentStatus === s ? 'bg-brand-dark text-white' : 'bg-gray-200']"
      >
        {{ s }}
      </button>
    </div>
    <LoadingSpinner :visible="loading" />
    <div v-if="!loading && approvals.length === 0" class="text-gray-500">No approval requests.</div>
    <div v-else class="space-y-3">
      <div
        v-for="a in approvals"
        :key="a.id"
        class="border rounded p-4 flex items-center justify-between"
      >
        <div>
          <p class="font-semibold">{{ a.business_name }}</p>
          <p class="text-sm text-gray-500">{{ a.contact_email }} &middot; {{ a.status }}</p>
          <p v-if="a.rejection_reason" class="text-sm text-red-500 mt-1">Reason: {{ a.rejection_reason }}</p>
        </div>
        <div v-if="a.status === 'pending'" class="flex gap-2">
          <button
            @click="handleApprove(a.id)"
            class="bg-green-600 text-white px-3 py-1 rounded text-sm hover:opacity-90"
          >
            Approve
          </button>
          <button
            @click="selectedRequestId = a.id; showRejectModal = true"
            class="bg-red-500 text-white px-3 py-1 rounded text-sm hover:opacity-90"
          >
            Reject
          </button>
        </div>
      </div>
    </div>

    <Modal :visible="showRejectModal" @close="showRejectModal = false">
      <h3 class="text-lg font-semibold mb-3">Rejection Reason</h3>
      <textarea
        v-model="rejectionReason"
        rows="3"
        class="w-full border border-gray-300 rounded px-3 py-2 mb-3"
        placeholder="Enter reason (required)"
      ></textarea>
      <div class="flex justify-end gap-2">
        <button @click="showRejectModal = false" class="px-4 py-2 rounded border">Cancel</button>
        <button
          @click="handleReject"
          :disabled="!rejectionReason.trim()"
          class="bg-red-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          Reject
        </button>
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
  } catch (err) {
    error.value = extractError(err);
  } finally {
    loading.value = false;
  }
}

async function handleApprove(requestId) {
  error.value = '';
  try {
    await adminApi.processApproval(requestId, 'approve');
    await fetchApprovals();
  } catch (err) {
    error.value = extractError(err);
  }
}

async function handleReject() {
  error.value = '';
  try {
    await adminApi.processApproval(selectedRequestId.value, 'reject', rejectionReason.value);
    showRejectModal.value = false;
    rejectionReason.value = '';
    await fetchApprovals();
  } catch (err) {
    error.value = extractError(err);
  }
}
</script>
