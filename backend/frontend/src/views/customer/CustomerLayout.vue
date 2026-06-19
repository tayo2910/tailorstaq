<template>
  <div class="min-h-screen flex flex-col">
    <NavBar />
    <div class="flex-1 flex">
      <aside class="w-56 bg-brand-dark text-white p-4 space-y-2">
        <router-link
          to="/customer/orders"
          class="block px-3 py-2 rounded hover:bg-brand-accent hover:text-brand-dark"
          active-class="bg-brand-accent text-brand-dark"
        >
          My Orders
        </router-link>
        <router-link
          to="/customer/profile"
          class="block px-3 py-2 rounded hover:bg-brand-accent hover:text-brand-dark"
          active-class="bg-brand-accent text-brand-dark"
        >
          Profile
        </router-link>
      </aside>
      <main class="flex-1 p-6">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import NavBar from '../../components/common/NavBar.vue';
</script>
