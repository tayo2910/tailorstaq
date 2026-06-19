import api from './index.js';

export function placeOrder(shopId, data) {
  return api.post(`/shops/${shopId}/orders`, data);
}

export function listShopOrders(shopId) {
  return api.get(`/shops/${shopId}/orders`);
}

export function updateOrderStatus(shopId, orderId, status) {
  return api.patch(`/shops/${shopId}/orders/${orderId}/status`, { status });
}

export function listMyOrders() {
  return api.get('/customers/me/orders');
}

export function getMyOrder(orderId) {
  return api.get(`/customers/me/orders/${orderId}`);
}

export function downloadReceipt(orderId) {
  return api.get(`/customers/me/orders/${orderId}/receipt`, { responseType: 'blob' });
}
