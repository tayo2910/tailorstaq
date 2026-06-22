<template>
  <div v-if="message" class="bg-error-container border border-error-container text-on-error-container px-4 py-3 rounded-xl relative mb-4 font-body-md">
    <span>{{ message }}</span>
    <button v-if="dismissible" @click="$emit('dismiss')" class="absolute top-2 right-3 text-lg leading-none">&times;</button>
  </div>
</template>

<script setup>
defineProps({ message: { type: String, default: '' }, dismissible: { type: Boolean, default: true } });
defineEmits(['dismiss']);
</script>
