import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.store.js';

const routes = [
  { path: '/', name: 'landing', component: () => import('../views/public/LandingPage.vue') },
  { path: '/login', name: 'login', component: () => import('../views/public/LoginView.vue') },
  { path: '/register/customer', name: 'customer-register', component: () => import('../views/public/CustomerRegisterView.vue') },
  { path: '/register/tenant', name: 'tenant-register', component: () => import('../views/public/TenantRegisterView.vue') },
  { path: '/verify-email', name: 'verify-email', component: () => import('../views/public/EmailVerificationView.vue') },
  {
    path: '/admin',
    component: () => import('../views/admin/AdminLayout.vue'),
    meta: { role: 'platform_admin' },
    children: [
      { path: '', redirect: { name: 'admin-approvals' } },
      { path: 'approvals', name: 'admin-approvals', component: () => import('../views/admin/ApprovalsView.vue') },
      { path: 'tenants', name: 'admin-tenants', component: () => import('../views/admin/TenantsView.vue') },
      { path: 'metrics', name: 'admin-metrics', component: () => import('../views/admin/MetricsView.vue') },
    ],
  },
  {
    path: '/tenant',
    component: () => import('../views/tenant/TenantLayout.vue'),
    meta: { role: 'tenant_admin' },
    children: [
      { path: '', redirect: { name: 'tenant-dashboard' } },
      { path: 'dashboard', name: 'tenant-dashboard', component: () => import('../views/tenant/DashboardView.vue') },
      { path: 'orders', name: 'tenant-orders', component: () => import('../views/tenant/OrdersView.vue') },
      { path: 'storefront', name: 'tenant-storefront', component: () => import('../views/tenant/StorefrontView.vue') },
      { path: 'community', name: 'tenant-community', component: () => import('../views/tenant/CommunityHubView.vue') },
      { path: 'shop', name: 'tenant-shop', component: () => import('../views/tenant/ShopSetupView.vue') },
      { path: 'products', name: 'tenant-products', component: () => import('../views/tenant/ProductsView.vue') },
      { path: 'subscription', name: 'tenant-subscription', component: () => import('../views/tenant/SubscriptionView.vue') },
    ],
  },
  {
    path: '/customer',
    component: () => import('../views/customer/CustomerLayout.vue'),
    meta: { role: 'customer' },
    children: [
      { path: '', redirect: { name: 'customer-orders' } },
      { path: 'orders', name: 'customer-orders', component: () => import('../views/customer/OrdersView.vue') },
      { path: 'orders/:id', name: 'customer-order-detail', component: () => import('../views/customer/OrderDetailView.vue') },
      { path: 'measurements', name: 'customer-measurements', component: () => import('../views/customer/MeasurementsView.vue') },
      { path: 'profile', name: 'customer-profile', component: () => import('../views/customer/ProfileView.vue') },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore();
  if (to.meta?.role && !auth.isAuthenticated) return next({ name: 'login', query: { redirect: to.fullPath } });
  if (to.meta?.role && auth.user?.role !== to.meta.role) return next({ name: 'landing' });
  if (auth.isAuthenticated && to.name === 'login') return next({ name: 'landing' });
  next();
});

export default router;
