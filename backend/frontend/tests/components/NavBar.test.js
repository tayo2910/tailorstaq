import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createWebHistory } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import NavBar from '../../src/components/common/NavBar.vue';

const routes = [
  { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
  { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
  { path: '/register/tenant', name: 'register-tenant', component: { template: '<div>Register</div>' } },
];

function createTestRouter() {
  return createRouter({ history: createWebHistory(), routes });
}

function mountNavBar(options = {}) {
  const router = createTestRouter();
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(NavBar, {
    global: { plugins: [router, pinia] },
    ...options,
  });
}

describe('NavBar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders TAILORSTAQ brand text', () => {
    const wrapper = mountNavBar();
    expect(wrapper.text()).toContain('TAILORSTAQ');
  });

  it('shows Login and Register Shop when unauthenticated', () => {
    const wrapper = mountNavBar();
    expect(wrapper.text()).toContain('Login');
    expect(wrapper.text()).toContain('Register Shop');
  });

  it('does not show Logout when unauthenticated', () => {
    const wrapper = mountNavBar();
    expect(wrapper.text()).not.toContain('Logout');
  });

  it('shows Logout when authenticated', () => {
    localStorage.setItem('auth_token', 'test-token');
    localStorage.setItem('auth_user', JSON.stringify({ fullName: 'Test User', role: 'tenant_admin' }));
    const wrapper = mountNavBar();
    expect(wrapper.text()).toContain('Logout');
    expect(wrapper.text()).toContain('Test User');
  });

  it('shows user full name when authenticated', () => {
    localStorage.setItem('auth_token', 'test-token');
    localStorage.setItem('auth_user', JSON.stringify({ fullName: 'Jane Tailor', role: 'tenant_admin' }));
    const wrapper = mountNavBar();
    expect(wrapper.text()).toContain('Jane Tailor');
  });
});
