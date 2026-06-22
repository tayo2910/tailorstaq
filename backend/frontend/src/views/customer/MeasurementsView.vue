<template>
  <div class="pb-8">
    <div class="flex flex-col md:flex-row md:items-end justify-between mb-stack-lg gap-gutter">
      <div>
        <p class="font-label-sm text-label-sm text-primary uppercase tracking-widest mb-2">Client Profile</p>
        <h2 class="font-display text-headline-lg-mobile md:text-headline-lg text-on-surface">Saved Measurements</h2>
        <p class="font-body-md text-body-md text-on-surface-variant mt-2 max-w-lg">Last updated: {{ lastUpdated }}. Precision measurements calculated via AI textile mapping.</p>
      </div>
      <button class="bg-primary text-on-primary py-4 px-8 rounded flex items-center justify-center gap-2 hover:bg-primary-container transition-all active:scale-95">
        <span class="material-symbols-outlined">camera_alt</span>
        <span class="font-label-md text-label-md">Re-measure with AI</span>
      </button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-12 gap-gutter">
      <div class="md:col-span-8 grid grid-cols-2 lg:grid-cols-3 gap-gutter">
        <div v-for="m in measurements" :key="m.label" class="bg-surface-container-lowest p-stack-md rounded-lg shadow-sm border border-outline-variant/30 relative overflow-hidden">
          <div class="textile-pattern absolute inset-0 pointer-events-none"></div>
          <p class="font-label-sm text-label-sm text-outline mb-1 uppercase">{{ m.label }}</p>
          <p class="font-display text-headline-md text-primary">{{ m.value }} <span class="font-body-md text-on-surface-variant">{{ m.unit }}</span></p>
          <div class="mt-4 flex items-center gap-1" :class="m.trend === 'up' ? 'text-primary' : 'text-secondary'">
            <span class="material-symbols-outlined text-sm">{{ m.trendIcon }}</span>
            <span class="font-label-sm text-label-sm">{{ m.trendText }}</span>
          </div>
        </div>
        <div class="col-span-2 lg:col-span-3 bg-surface-container-low p-stack-md rounded-lg relative min-h-[280px]">
          <div class="flex justify-between items-start mb-6">
            <div>
              <h3 class="font-sans text-title-lg text-on-surface">Measurement History</h3>
              <p class="font-label-sm text-label-sm text-outline">Chest & Waist Consistency (Last 6 Months)</p>
            </div>
            <div class="flex gap-4">
              <div class="flex items-center gap-2"><div class="w-3 h-3 bg-primary rounded-full"></div><span class="font-label-sm text-label-sm">Chest</span></div>
              <div class="flex items-center gap-2"><div class="w-3 h-3 bg-secondary rounded-full"></div><span class="font-label-sm text-label-sm">Waist</span></div>
            </div>
          </div>
          <div class="relative h-40 w-full flex items-end justify-between px-4 mt-8">
            <div class="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
              <div v-for="i in 3" :key="i" class="border-b border-outline w-full h-0"></div>
            </div>
            <div v-for="(month, i) in months" :key="month" class="flex-1 flex flex-col items-center gap-2">
              <div class="relative rounded-t" :style="{ height: month.chest + 'px', width: '8px', background: i === months.length - 1 ? 'rgba(111,37,18,0.3)' : 'rgba(111,37,18,0.2)' }">
                <div class="absolute w-full h-2 rounded-full" :class="i === months.length - 1 ? 'bg-primary ring-4 ring-surface' : 'bg-primary'" :style="{ bottom: month.chest - 8 + 'px' }"></div>
              </div>
              <span class="font-label-sm text-label-sm" :class="i === months.length - 1 ? 'text-primary font-bold' : 'text-outline'">{{ month.label }}</span>
            </div>
          </div>
        </div>
      </div>
      <aside class="md:col-span-4 flex flex-col gap-gutter">
        <div class="bg-surface-container-highest p-stack-md rounded-lg">
          <h3 class="font-sans text-title-lg text-on-surface mb-stack-sm">Visual Profile</h3>
          <p class="font-body-md text-body-md text-on-surface-variant mb-6">AI Estimation Silhouettes</p>
          <div class="grid grid-cols-2 gap-4">
            <div class="aspect-[2/3] bg-surface rounded-lg overflow-hidden relative border border-outline-variant/50 flex items-center justify-center">
              <span class="material-symbols-outlined text-6xl text-outline-variant opacity-40">accessibility_new</span>
              <div class="absolute bottom-2 left-2 bg-primary/80 backdrop-blur-sm px-2 py-1 rounded"><span class="font-label-sm text-[10px] text-on-primary">FRONT</span></div>
            </div>
            <div class="aspect-[2/3] bg-surface rounded-lg overflow-hidden relative border border-outline-variant/50 flex items-center justify-center">
              <span class="material-symbols-outlined text-6xl text-outline-variant opacity-40 scale-x-[-1]">accessibility_new</span>
              <div class="absolute bottom-2 left-2 bg-primary/80 backdrop-blur-sm px-2 py-1 rounded"><span class="font-label-sm text-[10px] text-on-primary">SIDE</span></div>
            </div>
          </div>
          <div class="mt-8 pt-6 border-t border-outline-variant">
            <div class="flex items-center justify-between mb-4">
              <span class="font-label-md text-label-md text-on-surface-variant">Profile Confidence</span>
              <span class="font-label-md text-label-md text-primary">98%</span>
            </div>
            <div class="w-full bg-surface h-2 rounded-full overflow-hidden"><div class="bg-primary h-full w-[98%]"></div></div>
          </div>
        </div>
        <div class="bg-white p-stack-md rounded-lg shadow-sm border border-outline-variant/30">
          <h4 class="font-label-md text-label-md text-on-surface font-bold mb-4">Tailor's Notes</h4>
          <p class="font-body-md text-body-md text-on-surface-variant italic mb-6">"Client prefers a slim fit in the torso but standard ease in the sleeves. Measurements adjusted +0.2in for movement."</p>
          <button class="w-full border border-primary text-primary font-label-md text-label-md py-3 rounded hover:bg-surface-container transition-colors">Edit Notes</button>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const lastUpdated = ref(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

const measurements = [
  { label: 'Neck', value: '15.5', unit: 'in', trend: 'flat', trendIcon: 'trending_flat', trendText: 'Consistent' },
  { label: 'Chest', value: '42.2', unit: 'in', trend: 'up', trendIcon: 'trending_up', trendText: '+0.3 from last' },
  { label: 'Waist', value: '34.0', unit: 'in', trend: 'down', trendIcon: 'trending_down', trendText: '-0.5 from last' },
  { label: 'Hip', value: '40.5', unit: 'in', trend: 'flat', trendIcon: 'trending_flat', trendText: 'Consistent' },
  { label: 'Inseam', value: '31.2', unit: 'in', trend: 'flat', trendIcon: 'trending_flat', trendText: 'Stable' },
  { label: 'Arm Length', value: '25.8', unit: 'in', trend: 'verified', trendIcon: 'verified', trendText: 'Verified' },
];

const months = [
  { label: 'May', chest: 24 },
  { label: 'Jun', chest: 20 },
  { label: 'Jul', chest: 12 },
  { label: 'Aug', chest: 18 },
  { label: 'Sep', chest: 14 },
  { label: 'Oct', chest: 32 },
];
</script>
