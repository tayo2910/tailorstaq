import { defineStore } from 'pinia';
import { ref } from 'vue';
import * as ordersApi from '../api/orders.api.js';
import { extractError } from '../api/index.js';

export const useOrdersStore = defineStore('orders', () => {
  const orders = ref([]);
  const currentOrder = ref(null);
  const loading = ref(false);

  async function fetchShopOrders(shopId) {
    loading.value = true;
    try {
      const { data } = await ordersApi.listShopOrders(shopId);
      orders.value = data.orders;
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  async function placeOrder(shopId, payload) {
    loading.value = true;
    try {
      const { data } = await ordersApi.placeOrder(shopId, payload);
      return data;
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  async function updateStatus(shopId, orderId, status) {
    loading.value = true;
    try {
      const { data } = await ordersApi.updateOrderStatus(shopId, orderId, status);
      return data;
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  async function fetchMyOrders() {
    loading.value = true;
    try {
      const { data } = await ordersApi.listMyOrders();
      orders.value = data.orders;
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  async function fetchMyOrderDetail(orderId) {
    loading.value = true;
    try {
      const { data } = await ordersApi.getMyOrder(orderId);
      currentOrder.value = data;
      return data;
    } catch (err) {
      throw new Error(extractError(err));
    } finally {
      loading.value = false;
    }
  }

  return {
    orders, currentOrder, loading,
    fetchShopOrders, placeOrder, updateStatus,
    fetchMyOrders, fetchMyOrderDetail,
  };
});
