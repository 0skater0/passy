<template>
  <div class="rounded-lg border bg-card text-card-foreground">
    <button :aria-expanded="open" class="flex w-full items-center justify-between px-4 py-3" type="button" @click="toggle_open">
      <span class="text-sm font-medium"><slot name="title"/></span>
      <svg :class="chevron_class" class="h-4 w-4 transition-transform" fill="none" stroke="currentColor"
           stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <div v-show="open" class="border-t px-4 py-3">
      <slot/>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {computed, onMounted, ref} from 'vue';

const emit = defineEmits(['toggle']);

const props = withDefaults(defineProps<{ defaultOpen?: boolean; persistKey?: string }>(), {defaultOpen: false});
const open = ref(!!props.defaultOpen);

function storage_key(): string | null {
  return props.persistKey ? `passy_fold_${props.persistKey}` : null;
}

onMounted(() => {
  const key = storage_key();
  if (key) {
    try {
      const v = localStorage.getItem(key);
      if (v === '1') open.value = true;
      if (v === '0') open.value = false;
    } catch {
    }
  }
  emit('toggle', open.value);
});

function toggle_open() {
  open.value = !open.value;
  try {
    emit('toggle', open.value);
  } catch {
  }
  const key = storage_key();
  if (!key) return;
  try {
    localStorage.setItem(key, open.value ? '1' : '0');
  } catch {
  }
}

const chevron_class = computed(() => open.value ? 'rotate-180' : 'rotate-0');
</script>
