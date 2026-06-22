<template>
  <div>
    <section class="mt-stack-md rounded-xl overflow-hidden relative min-h-[400px] flex items-center justify-center">
      <div class="absolute inset-0 bg-primary/40 backdrop-blur-[2px]"></div>
      <div class="relative z-10 text-center px-6">
        <div class="mb-4 inline-block px-4 py-2 bg-on-primary-container/80 backdrop-blur-md rounded-lg">
          <span class="font-label-md text-label-md text-primary uppercase tracking-widest">{{ shop?.name || 'Heritage Stitches' }}</span>
        </div>
        <h2 class="font-display text-headline-lg-mobile md:text-headline-lg text-white mb-6">Redefining Ancestral Craft for the Modern World</h2>
        <button class="bg-primary text-white font-label-md text-label-md px-8 py-4 rounded-[4px] shadow-lg hover:bg-primary-container transition-all active:scale-95">Book Appointment</button>
      </div>
    </section>
    <section class="mt-stack-lg flex flex-col md:flex-row gap-gutter items-center">
      <div class="flex-1 space-y-4">
        <span class="font-label-sm text-label-sm text-primary uppercase tracking-widest block">Our Philosophy</span>
        <h3 class="font-display text-headline-md text-on-surface">Modern Heritage. Timeless Precision.</h3>
        <p class="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
          At {{ shop?.name || 'our atelier' }}, we bridge the gap between ancestral weaving techniques and contemporary silhouettes. Our workshop leverages AI-driven measurement accuracy while honoring the slow, deliberate handwork of traditional artisans. Every stitch tells a story of identity, empowered by professional precision.
        </p>
        <div class="pt-4 flex gap-8">
          <div>
            <span class="block font-display text-headline-md text-primary">15+</span>
            <span class="font-label-sm text-label-sm text-on-surface-variant">Years of Craft</span>
          </div>
          <div>
            <span class="block font-display text-headline-md text-primary">2.4k</span>
            <span class="font-label-sm text-label-sm text-on-surface-variant">Custom Suits</span>
          </div>
        </div>
      </div>
      <div class="flex-1 w-full md:w-auto mt-stack-md md:mt-0">
        <div class="relative p-base border border-outline-variant rounded-xl textile-pattern">
          <div class="w-full aspect-[4/3] rounded-lg bg-surface-container flex items-center justify-center">
            <span class="material-symbols-outlined text-6xl text-outline">content_cut</span>
          </div>
        </div>
      </div>
    </section>
    <section class="mt-stack-lg">
      <div class="flex justify-between items-end mb-gutter">
        <div>
          <span class="font-label-sm text-label-sm text-primary uppercase tracking-widest block mb-1">Lookbook</span>
          <h3 class="font-display text-headline-md text-on-surface">Curated Collections</h3>
        </div>
        <button class="font-label-md text-label-md text-primary flex items-center gap-1 hover:underline">
          View All <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div v-for="(item, i) in portfolioItems" :key="i"
          class="relative rounded-xl overflow-hidden group aspect-square"
          :class="i === 0 ? 'col-span-2 row-span-2' : ''"
        >
          <div class="w-full h-full bg-surface-container flex items-center justify-center">
            <span class="material-symbols-outlined text-4xl text-outline-variant">{{ item.icon }}</span>
          </div>
          <div class="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span class="material-symbols-outlined text-white text-4xl">visibility</span>
          </div>
          <div v-if="i === 0" class="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent">
            <span class="bg-primary-fixed text-on-primary-fixed-variant px-3 py-1 rounded-full text-label-sm font-label-sm">Signature Piece</span>
            <h4 class="text-white font-sans text-title-lg mt-2">The Sovereign Collection</h4>
          </div>
        </div>
      </div>
    </section>
    <section class="mt-stack-lg mb-stack-lg py-stack-md bg-surface-container rounded-xl px-gutter border border-outline-variant/30 shadow-sm">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-stack-md">
        <div>
          <h3 class="font-display text-headline-md text-on-surface mb-4">Visit Our Atelier</h3>
          <div class="space-y-4">
            <div class="flex items-start gap-3">
              <span class="material-symbols-outlined text-primary mt-1">location_on</span>
              <p class="font-body-md text-body-md text-on-surface-variant">{{ shop?.address || 'Your shop address' }}</p>
            </div>
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined text-primary">mail</span>
              <p class="font-body-md text-body-md text-on-surface-variant">{{ shop?.contact_email || 'your@email.com' }}</p>
            </div>
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined text-primary">call</span>
              <p class="font-body-md text-body-md text-on-surface-variant">{{ shop?.phone || '+1234567890' }}</p>
            </div>
          </div>
        </div>
        <div class="flex flex-col justify-between">
          <div>
            <h4 class="font-sans text-title-lg text-on-surface mb-4">Follow Our Journey</h4>
            <div class="flex gap-4">
              <a v-for="social in socialLinks" :key="social.icon" class="w-12 h-12 rounded-full border border-outline flex items-center justify-center text-primary hover:bg-primary-container hover:text-white transition-colors" :href="social.url">
                <span class="material-symbols-outlined">{{ social.icon }}</span>
              </a>
            </div>
          </div>
          <div class="mt-6">
            <label class="font-label-md text-label-md text-on-surface block mb-2">Subscribe to our newsletter</label>
            <div class="flex gap-2">
              <input class="flex-1 bg-surface border border-outline-variant rounded-[4px] px-4 py-2 focus:ring-1 focus:ring-primary focus:border-primary outline-none font-body-md" placeholder="Your email" type="email" />
              <button class="bg-primary text-white px-6 py-2 rounded-[4px] font-label-md text-label-md hover:bg-primary-container transition-colors">Join</button>
            </div>
          </div>
        </div>
      </div>
    </section>
    <section class="mt-stack-lg">
      <div class="flex items-center justify-between mb-4">
        <h4 class="font-display text-title-lg text-on-surface">Products</h4>
        <router-link to="/tenant/products" class="text-secondary font-label-md flex items-center gap-1 hover:underline">
          Manage Products
          <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
        </router-link>
      </div>
      <LoadingSpinner :visible="loading" />
      <ErrorBanner :message="error" @dismiss="error = ''" />
      <div v-if="!loading && products.length === 0" class="text-center py-8 text-on-surface-variant">No products yet. Add your first product.</div>
      <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div v-for="p in products" :key="p.id" class="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20">
          <div class="aspect-square bg-surface-container rounded-lg flex items-center justify-center mb-3">
            <span class="material-symbols-outlined text-3xl text-outline-variant">checkroom</span>
          </div>
          <p class="font-sans text-title-lg text-on-surface truncate">{{ p.name }}</p>
          <p class="font-label-md text-primary">${{ parseFloat(p.price).toFixed(2) }}</p>
        </div>
      </div>
    </section>
    <section class="mt-stack-lg mb-stack-lg">
      <h4 class="font-sans text-title-lg text-on-surface mb-4">Shop Settings</h4>
      <router-link to="/tenant/shop" class="text-primary font-label-md hover:underline">Edit shop details →</router-link>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api, { extractError } from '../../api/index.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.vue';
import ErrorBanner from '../../components/common/ErrorBanner.vue';

const shop = ref(null);
const products = ref([]);
const loading = ref(false);
const error = ref('');

const portfolioItems = [
  { icon: 'checkroom' },
  { icon: 'content_cut' },
  { icon: 'straighten' },
  { icon: 'tailoring' },
  { icon: 'style' },
];

const socialLinks = [
  { icon: 'share', url: '#' },
  { icon: 'public', url: '#' },
  { icon: 'thumb_up', url: '#' },
];

onMounted(async () => {
  try {
    const { data } = await api.get('/shops/me');
    shop.value = data.shop || data;
  } catch { shop.value = null; }
  try {
    const { data } = await api.get('/shops/me/products');
    products.value = (data.products || []).slice(0, 4);
  } catch { products.value = []; }
});
</script>
