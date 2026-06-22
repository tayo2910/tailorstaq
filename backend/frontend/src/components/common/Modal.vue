<template>
  <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" @click.self="$emit('close')">
    <div class="bg-surface-container-lowest rounded-xl shadow-lg max-w-md w-full mx-4 p-6 border border-outline-variant/20">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({ visible: { type: Boolean, default: false } });
defineEmits(['close']);
</script>
