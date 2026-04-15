<template>
  <div>
    <div class="flex items-center gap-2 border-b overflow-x-auto scrollbar-thin" role="tablist">
      <button v-for="it in normalized"
              :key="it.value"
              :aria-selected="it.value === modelValue"
              :class="it.value === modelValue ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'"
              class="relative -mb-px shrink-0 rounded-t px-3 py-2 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              role="tab"
              @click="$emit('update:modelValue', it.value)">
        {{ it.label }}
      </button>
    </div>
  </div>

</template>

<script lang="ts" setup>
import {computed} from 'vue';

type TabItem = string | { value: string; label: string };
const props = defineProps<{
  modelValue: string;
  items: TabItem[];
}>();
defineEmits(['update:modelValue']);

const normalized = computed(() => props.items.map(it => typeof it === 'string' ? ({value: it, label: it}) : it));
</script>
