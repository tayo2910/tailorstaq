import { defineStore } from 'pinia';
import { ref } from 'vue';
import * as shopsApi from '../api/shops.api.js';
import { extractError } from '../api/index.js';

export const useShopStore = defineStore('shop', () => {
  const shop = ref(null);
  const loading = ref(false);

  async function fetchShop(shopId) {
    loading.value = true;
    try {
      const { data } = await shopsApi.getShop(shopId);
      shop.value = data.shop;
      return data;
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  async function saveShop(shopId, payload) {
    loading.value = true;
    try {
      const { data } = await shopsApi.updateShop(shopId, payload);
      shop.value = data.shop;
      return data;
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  async function uploadShopLogo(shopId, file) {
    loading.value = true;
    try {
      const { data } = await shopsApi.uploadLogo(shopId, file);
      shop.value = data.shop;
      return data;
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  return { shop, loading, fetchShop, saveShop, uploadShopLogo };
});
