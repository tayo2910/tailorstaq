<template>
  <div>
    <section class="mb-stack-lg">
      <div class="flex justify-between items-end mb-4">
        <h2 class="font-display text-headline-md text-primary">Knowledge Hub</h2>
        <span class="font-label-md text-primary cursor-pointer">View all</span>
      </div>
      <div class="flex overflow-x-auto gap-4 pb-4 no-scrollbar">
        <div v-for="tip in knowledgeTips" :key="tip.title" class="min-w-[280px] bg-white p-6 rounded-xl shadow-[0_4px_20px_rgba(111,37,18,0.05)] border border-outline-variant/30 relative overflow-hidden">
          <div class="absolute top-0 right-0 p-2 opacity-10">
            <span class="material-symbols-outlined text-6xl">{{ tip.icon }}</span>
          </div>
          <span class="inline-block px-3 py-1 rounded-full font-label-sm mb-4" :class="tip.badgeClass">{{ tip.category }}</span>
          <h3 class="font-sans text-title-lg mb-2">{{ tip.title }}</h3>
          <p class="text-on-surface-variant font-body-md">{{ tip.description }}</p>
        </div>
      </div>
    </section>
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
      <div class="lg:col-span-8 space-y-stack-md">
        <h2 class="font-display text-headline-md text-primary">Community Feed</h2>
        <article v-for="story in communityStories" :key="story.title" class="bg-white rounded-xl shadow-[0_4px_20px_rgba(111,37,18,0.05)] overflow-hidden border border-outline-variant/20">
          <div class="p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" :class="story.avatarBg">{{ story.initials }}</div>
            <div>
              <p class="font-sans text-body-lg font-bold">{{ story.author }}</p>
              <p class="font-label-sm text-on-surface-variant">{{ story.time }} • {{ story.type }}</p>
            </div>
          </div>
          <div class="aspect-video w-full bg-surface-container flex items-center justify-center">
            <span class="material-symbols-outlined text-6xl text-outline-variant">image</span>
          </div>
          <div class="p-6">
            <h3 class="font-display text-title-lg text-primary mb-2 italic">{{ story.title }}</h3>
            <p class="text-on-surface-variant font-body-md mb-4">{{ story.content }}</p>
            <div class="flex items-center gap-6 text-on-surface-variant">
              <button class="flex items-center gap-2 hover:text-primary transition-colors">
                <span class="material-symbols-outlined">favorite</span>
                <span class="font-label-md">{{ story.likes }}</span>
              </button>
              <button class="flex items-center gap-2 hover:text-primary transition-colors">
                <span class="material-symbols-outlined">chat_bubble</span>
                <span class="font-label-md">{{ story.comments }}</span>
              </button>
              <button class="flex items-center gap-2 hover:text-primary transition-colors">
                <span class="material-symbols-outlined">share</span>
              </button>
            </div>
          </div>
        </article>
      </div>
      <aside class="lg:col-span-4 space-y-stack-md">
        <section class="bg-primary text-on-primary p-6 rounded-xl relative" style="background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0); background-size: 16px 16px;">
          <h2 class="font-display text-title-lg mb-4 text-on-primary">Collaborations</h2>
          <p class="font-body-md mb-6 opacity-90">Scale your business by partnering with fellow artisans for high-volume corporate orders.</p>
          <div class="space-y-4">
            <div v-for="collab in collaborations" :key="collab.title" class="bg-white/10 p-4 rounded-lg border border-white/20 backdrop-blur-sm">
              <div class="flex justify-between items-start mb-2">
                <h4 class="font-bold">{{ collab.title }}</h4>
                <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded" :class="collab.urgent ? 'bg-white text-primary' : 'bg-secondary-fixed text-on-secondary-fixed'">{{ collab.urgent ? 'Urgent' : 'Standard' }}</span>
              </div>
              <p class="text-sm opacity-80 mb-3">{{ collab.description }}</p>
              <div class="flex items-center justify-between">
                <span class="text-xs">By {{ collab.author }}</span>
                <button class="bg-white text-primary px-4 py-1.5 rounded-lg font-label-sm hover:bg-surface-variant transition-all active:scale-95">Apply</button>
              </div>
            </div>
          </div>
          <button class="w-full mt-6 py-3 border border-white/40 rounded-lg font-label-md hover:bg-white/10 transition-colors text-on-primary">Post a Collaboration</button>
        </section>
        <section class="bg-surface-container p-6 rounded-xl">
          <h2 class="font-display text-title-lg text-primary mb-4">Top Contributors</h2>
          <ul class="space-y-4">
            <li v-for="contributor in topContributors" :key="contributor.name" class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold" :class="contributor.avatarBg">{{ contributor.initials }}</div>
              <div>
                <p class="font-bold">{{ contributor.name }}</p>
                <p class="text-xs text-on-surface-variant">{{ contributor.title }}</p>
              </div>
            </li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup>
const knowledgeTips = [
  { icon: 'inventory_2', category: 'Fabric Care', badgeClass: 'bg-secondary-fixed text-on-secondary-fixed', title: 'Sustainable Linen Preservation', description: 'Cold water wash and air-drying prevents natural fiber shrinkage in luxury linen blends.' },
  { icon: 'psychology', category: 'AI Optimization', badgeClass: 'bg-tertiary-fixed text-on-tertiary-fixed', title: 'Refining Digital Shoulders', description: 'Adjusting the AI tension point for drop shoulders ensures a better drape in silk garments.' },
  { icon: 'straighten', category: 'Pro Tip', badgeClass: 'bg-primary-fixed text-on-primary-fixed', title: 'Pattern Matching Hacks', description: 'Aligning complex geometric patterns across seams using laser-grid projection.' },
];

const communityStories = [
  { initials: 'AK', avatarBg: 'bg-primary-container', author: 'Adebayo Kweku', time: '2 hours ago', type: 'Craft Story', title: 'The Breath of the Loom', content: 'Just completed this 3-piece suit using hand-woven Bogolanfini accents. The challenge was maintaining the pattern alignment across the lapel using the new AI mapping tool.', likes: 124, comments: 18 },
  { initials: 'MD', avatarBg: 'bg-secondary', author: 'Mila Draven', time: 'Yesterday', type: 'Lookbook', title: 'Urban Heritage Winter Collection', content: 'Exploring the intersection of heavy wool structures and delicate silk linings. This collection focuses on modular versatility for the modern professional.', likes: 89, comments: 24 },
];

const collaborations = [
  { title: '120 Bespoke Blazers', urgent: true, description: 'Seeking 2 partners with AI cutting experience for a 3-week production run.', author: 'Sarah J. Studio' },
  { title: 'Luxury Resort Wear', urgent: false, description: 'Need specialized embroidery for silk kaftans. 500 units total.', author: 'Heritage Loom Ltd.' },
];

const topContributors = [
  { initials: 'MT', avatarBg: 'bg-outline-variant', name: 'Marcus Thorne', title: 'Master Draper • 42 Stories' },
  { initials: 'EV', avatarBg: 'bg-tertiary-fixed', name: 'Elena Vance', title: 'Tech Weaver • 31 Stories' },
];
</script>
