<template>
  <div class="min-h-screen flex flex-col bg-background">
    <NavBar />
    <main class="flex-grow">
      <section class="relative w-full overflow-hidden py-12 md:py-20 px-container-padding-mobile md:px-container-padding-desktop bg-surface-container-low">
        <div class="absolute inset-0 hero-pattern pointer-events-none"></div>
        <div class="relative z-10 max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-8 md:gap-16">
          <div class="flex-1 text-center md:text-left">
            <span class="font-display text-4xl md:text-display-lg text-primary">TailorStaq</span>
            <p class="font-label-sm text-label-sm uppercase tracking-widest text-outline mt-1">Where Tailoring Meets Intelligence</p>
            <h1 class="font-display text-headline-lg-mobile md:text-headline-lg text-on-surface mt-6">Precision Craftsmanship. Scaled.</h1>
            <p class="font-body-lg text-body-lg text-on-surface-variant mt-3 max-w-lg">Empowering tailors with AI-powered measurements and digital business management.</p>
            <div class="flex flex-col sm:flex-row gap-4 mt-8">
              <router-link to="/register/tenant" class="inline-flex items-center justify-center gap-2 bg-primary text-on-primary px-8 py-4 rounded-xl font-sans text-title-lg hover:bg-primary-container transition-all active:scale-95">
                Join as a Tailor
                <span class="material-symbols-outlined">arrow_forward</span>
              </router-link>
              <router-link to="/login" class="inline-flex items-center justify-center gap-2 border-2 border-primary text-primary px-8 py-4 rounded-xl font-sans text-title-lg hover:bg-primary-fixed transition-all active:scale-95">
                Sign In
              </router-link>
            </div>
            <div class="flex gap-6 mt-6 justify-center md:justify-start">
              <div class="flex items-center gap-2 text-on-surface-variant">
                <span class="material-symbols-outlined text-[18px]">verified_user</span>
                <span class="text-sm font-medium">Verified Identity</span>
              </div>
              <div class="flex items-center gap-2 text-on-surface-variant">
                <span class="material-symbols-outlined text-[18px]">payments</span>
                <span class="text-sm font-medium">Instant Payouts</span>
              </div>
            </div>
          </div>
          <div class="flex-1 w-full max-w-md">
            <div class="bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-xl border border-outline-variant/20">
              <div class="space-y-4">
                <p class="font-display text-headline-md text-center text-primary mb-4">Get Started</p>
                <router-link to="/register/customer" class="flex items-center gap-3 p-4 bg-white border border-outline-variant/50 rounded-xl hover:bg-surface-container-low transition-colors">
                  <div class="w-12 h-12 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed-variant">
                    <span class="material-symbols-outlined">person_search</span>
                  </div>
                  <div>
                    <p class="font-label-md text-label-md text-on-surface">Find Your Tailor</p>
                    <p class="text-sm text-on-surface-variant">Discover local artisans</p>
                  </div>
                </router-link>
                <router-link to="/register/customer" class="flex items-center gap-3 p-4 bg-white border border-outline-variant/50 rounded-xl hover:bg-surface-container-low transition-colors">
                  <div class="w-12 h-12 rounded-full bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed">
                    <span class="material-symbols-outlined">straighten</span>
                  </div>
                  <div>
                    <p class="font-label-md text-label-md text-on-surface">Get Measured</p>
                    <p class="text-sm text-on-surface-variant">Start your digital profile</p>
                  </div>
                </router-link>
                <router-link to="/login" class="block text-center text-primary font-label-md hover:underline pt-2">Already part of the heritage? Sign In</router-link>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section class="max-w-6xl mx-auto px-container-padding-mobile md:px-container-padding-desktop py-12 md:py-20">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div class="text-center p-6">
            <span class="material-symbols-outlined text-4xl text-primary mb-4">inventory_2</span>
            <h3 class="font-sans text-title-lg text-on-surface mb-2">Management</h3>
            <p class="font-body-md text-on-surface-variant">Digital business management tools for modern tailoring shops.</p>
          </div>
          <div class="text-center p-6">
            <span class="material-symbols-outlined text-4xl text-primary mb-4">groups</span>
            <h3 class="font-sans text-title-lg text-on-surface mb-2">Community</h3>
            <p class="font-body-md text-on-surface-variant">Connect with artisans and collaborate on large orders.</p>
          </div>
          <div class="text-center p-6">
            <span class="material-symbols-outlined text-4xl text-primary mb-4">psychology</span>
            <h3 class="font-sans text-title-lg text-on-surface mb-2">AI Growth</h3>
            <p class="font-body-md text-on-surface-variant">AI-powered measurements and precision analytics.</p>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import NavBar from '../../components/common/NavBar.vue';
</script>
