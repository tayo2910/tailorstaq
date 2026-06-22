<template>
  <div class="min-h-screen flex flex-col">
    <NavBar />
    <div class="flex-1 flex flex-col sm:flex-row">
      <aside class="sm:w-56 bg-primary text-on-primary sm:p-4 flex sm:block overflow-x-auto sm:overflow-visible">
        <div class="flex sm:flex-col gap-1 sm:space-y-2 px-2 sm:px-0 py-2 sm:py-0">
          <router-link
            to="/admin/approvals"
            class="whitespace-nowrap px-3 py-2 rounded text-sm sm:text-base hover:bg-primary-fixed-dim hover:text-on-primary-fixed"
            active-class="bg-primary-fixed-dim text-on-primary-fixed"
          >
            Approvals
          </router-link>
          <router-link
            to="/admin/tenants"
            class="whitespace-nowrap px-3 py-2 rounded text-sm sm:text-base hover:bg-primary-fixed-dim hover:text-on-primary-fixed"
            active-class="bg-primary-fixed-dim text-on-primary-fixed"
          >
            Tenants
          </router-link>
          <router-link
            to="/admin/metrics"
            class="whitespace-nowrap px-3 py-2 rounded text-sm sm:text-base hover:bg-primary-fixed-dim hover:text-on-primary-fixed"
            active-class="bg-primary-fixed-dim text-on-primary-fixed"
          >
            Metrics
          </router-link>
        </div>
      </aside>
      <main class="flex-1 p-4 sm:p-6 overflow-x-hidden bg-background">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import NavBar from '../../components/common/NavBar.vue';
</script>
