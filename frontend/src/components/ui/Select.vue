<template>
  <select :class="select_class" :value="modelValue" @change="on_change">
    <slot/>
  </select>
</template>

<script lang="ts" setup>
defineProps<{ modelValue?: string | number }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

function on_change(e: Event) {
  emit('update:modelValue', (e.target as HTMLSelectElement).value);
}

const select_class = 'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
</script>
