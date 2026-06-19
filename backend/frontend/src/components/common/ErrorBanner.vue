<template>
  <div
    v-if="message"
    class="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded relative mb-4"
  >
    <span>{{ message }}</span>
    <button
      v-if="dismissible"
      @click="$emit('dismiss')"
      class="absolute top-2 right-3 text-lg leading-none"
    >
      &times;
    </button>
  </div>
</template>

<script setup>
defineProps({
  message: { type: String, default: '' },
  dismissible: { type: Boolean, default: true },
});
defineEmits(['dismiss']);
</script>
