<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
    @click.self="$emit('close')"
  >
    <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({ visible: { type: Boolean, default: false } });
defineEmits(['close']);
</script>
