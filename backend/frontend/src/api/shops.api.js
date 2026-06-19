import api from './index.js';

export function getShop(shopId) {
  return api.get(`/shops/${shopId}`);
}

export function updateShop(shopId, data) {
  return api.patch(`/shops/${shopId}`, data);
}

export function uploadLogo(shopId, file) {
  const form = new FormData();
  form.append('logo', file);
  return api.post(`/shops/${shopId}/logo`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
