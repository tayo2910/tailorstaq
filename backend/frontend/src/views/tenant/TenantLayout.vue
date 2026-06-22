<template>
  <div class="min-h-screen bg-background textile-pattern">
    <header class="w-full sticky top-0 bg-surface shadow-[0px_4px_20px_rgba(111,37,18,0.15)] z-40">
      <div class="flex items-center justify-between px-container-padding-mobile md:px-container-padding-desktop py-stack-sm w-full max-w-7xl mx-auto">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full overflow-hidden bg-primary-fixed flex items-center justify-center">
            <span class="font-display text-headline-md text-primary">TS</span>
          </div>
          <h1 class="font-display text-headline-md font-bold text-primary">TailorStaq</h1>
        </div>
        <div class="flex items-center gap-4">
          <button class="material-symbols-outlined text-on-surface-variant p-2 hover:bg-surface-container-low transition-colors rounded-full">notifications</button>
        </div>
      </div>
    </header>
    <div class="flex max-w-7xl mx-auto">
      <aside class="hidden md:flex flex-col w-56 bg-surface-container border-r border-outline-variant/20 min-h-[calc(100vh-64px)] p-4 gap-1 sticky top-16">
        <router-link
          v-for="link in navLinks"
          :key="link.name"
          :to="link.to"
          class="flex items-center gap-3 px-4 py-3 rounded-xl font-label-md transition-all"
          :class="isActive(link.to) ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant hover:bg-surface-container-high'"
        >
          <span class="material-symbols-outlined" :class="isActive(link.to) ? 'fill-icon' : ''">{{ link.icon }}</span>
          {{ link.name }}
        </router-link>
      </aside>
      <main class="flex-1 min-h-screen px-container-padding-mobile md:px-container-padding-desktop py-stack-md pb-24 md:pb-6">
        <router-view />
      </main>
    </div>
    <nav class="md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center px-4 py-3 bg-surface-container rounded-t-xl shadow-lg z-50 border-t border-outline-variant/30">
      <router-link
        :to="link.to"
        v-for="link in navLinks"
        :key="link.name"
        class="flex flex-col items-center justify-center py-1 px-4 transition-all duration-150"
        :class="isActive(link.to) ? 'bg-primary-container text-on-primary-container rounded-full active:scale-90' : 'text-on-surface-variant hover:text-primary'"
      >
        <span class="material-symbols-outlined" :class="isActive(link.to) ? 'fill-icon' : ''">{{ link.icon }}</span>
        <span class="font-label-sm text-label-sm">{{ link.name }}</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router';

const route = useRoute();
const navLinks = [
  { name: 'Dashboard', icon: 'dashboard', to: '/tenant/dashboard' },
  { name: 'Orders', icon: 'inventory_2', to: '/tenant/orders' },
  { name: 'Store', icon: 'storefront', to: '/tenant/storefront' },
  { name: 'Community', icon: 'groups', to: '/tenant/community' },
  { name: 'Settings', icon: 'settings', to: '/tenant/shop' },
  { name: 'Products', icon: 'checkroom', to: '/tenant/products' },
  { name: 'Subscription', icon: 'workspace_premium', to: '/tenant/subscription' },
];

function isActive(path) {
  return route.path.startsWith(path);
}
</script>
