<template>
  <label
      class="inline-flex items-center gap-2 rounded focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background select-none">
    <input :checked="modelValue" class="sr-only" type="checkbox" @change="on_change">
    <span :class="box_class">
      <svg v-if="modelValue" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-linecap="round"
           stroke-linejoin="round" stroke-width="3" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
    </span>
    <span><slot/></span>
  </label>
</template>

<script lang="ts" setup>
import {computed} from 'vue';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits(['update:modelValue']);

function on_change(e: Event) {
  const target = e.target as HTMLInputElement;
  emit('update:modelValue', !!target.checked);
}

const box_class = computed(() => [
  'h-4 w-4 rounded border flex items-center justify-center transition-colors',
  props.modelValue
      ? 'bg-primary text-primary-foreground border-primary'
      : 'bg-background border-input'
].join(' '));
</script>
