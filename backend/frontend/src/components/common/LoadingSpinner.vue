<template>
  <div v-if="visible" class="flex items-center justify-center py-8">
    <div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
  </div>
</template>

<script setup>
defineProps({ visible: { type: Boolean, default: false } });
</script>
