<template>
  <div :class="root_class">
    <slot/>
  </div>
</template>

<script lang="ts" setup>
import {computed} from 'vue';

const props = withDefaults(defineProps<{
  padded?: boolean;
}>(), {
  padded: false
});

const root_class = computed(() => [
  'rounded-lg border bg-card text-card-foreground shadow-xs',
  props.padded ? 'p-4' : ''
].join(' '));
</script>
