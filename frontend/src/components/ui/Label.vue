<template>
  <label :class="label_class" v-bind="$attrs">
    <slot/>
  </label>
</template>

<script lang="ts" setup>
const label_class = 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70';
</script>
