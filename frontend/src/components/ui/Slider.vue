<template>
  <div class="flex items-center gap-3">
    <input :id="id"
           :max="max"
           :min="min"
           :step="step"
           :style="{ '--percent': percent + '%' }"
           :value="modelValue"
           class="ui-range w-full"
           type="range"
           @input="on_input">
    <span v-if="!editing"
          class="w-10 text-sm text-right tabular-nums"
          tabindex="0"
          @click="start_edit"
          @keydown.enter.prevent="start_edit"
          @keydown.space.prevent="start_edit">{{ modelValue }}</span>
    <input v-else
           ref="input_el"
           v-model="temp_value"
           :max="max"
           :min="min"
           :step="step"
           class="w-10 text-sm text-right tabular-nums bg-transparent focus:outline-none focus:ring-0"
           type="number"
           @blur="commit_edit"
           @keydown.enter.prevent="commit_edit"
           @keydown.esc.prevent="cancel_edit"/>
  </div>
</template>

<script lang="ts" setup>
import {computed, nextTick, ref} from 'vue';

const props = withDefaults(defineProps<{
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
  id?: string
}>(), {
  step: 1,
  min: 0,
  max: 100,
});
const emit = defineEmits(['update:modelValue']);
const editing = ref(false);
const temp_value = ref<number>(0);
const input_el = ref<HTMLInputElement | null>(null);

function on_input(e: Event) {
  const target = e.target as HTMLInputElement;
  emit('update:modelValue', Number(target.value));
}

const percent = computed(() => {
  const range = Math.max(0, props.max - props.min);
  if (range === 0) return 0;
  const clamped = Math.min(props.max, Math.max(props.min, props.modelValue));
  return ((clamped - props.min) / range) * 100;
});

function start_edit() {
  editing.value = true;
  temp_value.value = props.modelValue;
  nextTick(() => input_el.value?.select());
}

function commit_edit() {
  let v = Number(temp_value.value);
  if (!Number.isFinite(v)) v = props.modelValue;
  v = Math.max(props.min, Math.min(props.max, Math.round(v)));
  emit('update:modelValue', v);
  editing.value = false;
}

function cancel_edit() {
  editing.value = false;
}
</script>

<style scoped>
.ui-range {
  -webkit-appearance: none;
  appearance: none;
  height: 0.5rem;
  border-radius: 9999px;
  background: linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) var(--percent), var(--color-muted) var(--percent), var(--color-muted) 100%);
  outline: none;
}

.ui-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  background: var(--color-background);
  border: 2px solid var(--color-primary);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
  cursor: pointer;
}

.ui-range::-moz-range-thumb {
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  background: var(--color-background);
  border: 2px solid var(--color-primary);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
  cursor: pointer;
}

.ui-range::-moz-range-track {
  height: 0.5rem;
  border-radius: 9999px;
  background: transparent;
}
</style>
