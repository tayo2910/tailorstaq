<template>
  <div class="min-h-screen flex flex-col">
    <NavBar />
    <div class="flex-1 flex">
      <aside class="w-56 bg-brand-dark text-white p-4 space-y-2">
        <router-link
          to="/admin/approvals"
          class="block px-3 py-2 rounded hover:bg-brand-accent hover:text-brand-dark"
          active-class="bg-brand-accent text-brand-dark"
        >
          Approvals
        </router-link>
        <router-link
          to="/admin/tenants"
          class="block px-3 py-2 rounded hover:bg-brand-accent hover:text-brand-dark"
          active-class="bg-brand-accent text-brand-dark"
        >
          Tenants
        </router-link>
        <router-link
          to="/admin/metrics"
          class="block px-3 py-2 rounded hover:bg-brand-accent hover:text-brand-dark"
          active-class="bg-brand-accent text-brand-dark"
        >
          Metrics
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
