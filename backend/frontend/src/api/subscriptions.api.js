import api from './index.js';

export function getMySubscription() {
  return api.get('/subscriptions/me');
}

export function initiateUpgrade(billingPeriod) {
  return api.post('/subscriptions/upgrade', { billingPeriod });
}

export function confirmUpgrade(paymentRecordId, paymentReference) {
  return api.post('/subscriptions/confirm', { paymentRecordId, paymentReference });
}
