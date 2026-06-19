<template>
  <div class="min-h-screen flex flex-col">
    <NavBar />
    <main class="flex-1 flex items-center justify-center px-4">
      <div class="text-center max-w-2xl">
        <h1 class="text-4xl font-bold text-brand-dark mb-4">TAILORSTAQ</h1>
        <p class="text-lg text-gray-600 mb-8">
          Multi-tenant tailoring platform for professional tailors and their customers.
        </p>
        <div class="flex justify-center gap-4">
          <router-link
            to="/register/tenant"
            class="bg-brand-accent text-brand-dark px-6 py-3 rounded font-semibold hover:opacity-90"
          >
            Register Your Shop
          </router-link>
          <router-link
            to="/login"
            class="border border-brand-dark text-brand-dark px-6 py-3 rounded font-semibold hover:bg-gray-50"
          >
            Sign In
          </router-link>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import NavBar from '../../components/common/NavBar.vue';
</script>
