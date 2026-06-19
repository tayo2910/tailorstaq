import api from './index.js';

export function listApprovals(status) {
  const params = status ? { status } : {};
  return api.get('/admin/approvals', { params });
}

export function processApproval(requestId, action, rejectionReason) {
  return api.patch(`/admin/approvals/${requestId}`, {
    action,
    ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
  });
}

export function listTenants() {
  return api.get('/admin/tenants');
}

export function updateTenantStatus(tenantId, action) {
  return api.patch(`/admin/tenants/${tenantId}/status`, { action });
}

export function getMetrics(from, to) {
  const params = {};
  if (from) params.from = from;
  if (to) params.to = to;
  return api.get('/admin/metrics', { params });
}
