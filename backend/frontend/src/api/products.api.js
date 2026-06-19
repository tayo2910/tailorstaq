import api from './index.js';

export function listProducts(shopId) {
  return api.get(`/shops/${shopId}/products`);
}

export function createProduct(shopId, data) {
  return api.post(`/shops/${shopId}/products`, data);
}

export function updateProduct(shopId, productId, data) {
  return api.patch(`/shops/${shopId}/products/${productId}`, data);
}

export function deleteProduct(shopId, productId) {
  return api.delete(`/shops/${shopId}/products/${productId}`);
}
