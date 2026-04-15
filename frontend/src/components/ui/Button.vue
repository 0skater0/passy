<template>
  <button :class="button_class" v-bind="$attrs">
    <slot/>
  </button>
</template>

<script lang="ts" setup>
import {computed} from 'vue';

type ButtonVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

const props = withDefaults(defineProps<{
  variant?: ButtonVariant;
  size?: ButtonSize;
}>(), {
  variant: 'default',
  size: 'default'
});

const base_class = 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background';

const variant_class_map: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  outline: 'border bg-background hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'underline underline-offset-4 hover:text-primary'
};

const size_class_map: Record<ButtonSize, string> = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 rounded-md px-3',
  lg: 'h-11 rounded-md px-8',
  icon: 'h-10 w-10'
};

const button_class = computed(() => [
  base_class,
  variant_class_map[props.variant],
  size_class_map[props.size]
].join(' '));
</script>
