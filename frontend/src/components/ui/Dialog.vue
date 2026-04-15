<template>
  <teleport to="body">
    <div v-if="open" role="dialog" aria-modal="true" class="fixed inset-0 z-50 flex items-center justify-center"
         @keydown.escape="on_close" @keydown="handle_tab">
      <div class="absolute inset-0 bg-black/50" @click="on_close"/>
      <div ref="dialog_el" class="relative z-10 w-full max-w-lg rounded-lg border bg-background p-4 shadow-lg" tabindex="-1">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-semibold">
            <slot name="title"/>
          </h2>
          <button :aria-label="$t('app.close')" class="rounded p-1 hover:bg-muted" type="button" @click="on_close">✕</button>
        </div>
        <div>
          <slot/>
        </div>
        <div v-if="$slots.footer" class="mt-4 flex items-center justify-end gap-2">
          <slot name="footer"/>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script lang="ts" setup>
import {ref, watch, nextTick} from 'vue';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits(['close']);
const dialog_el = ref<HTMLDivElement | null>(null);

function on_close() {
  emit('close');
}

function handle_tab(e: KeyboardEvent) {
  if (e.key !== 'Tab' || !dialog_el.value) return;
  const focusable = Array.from(dialog_el.value.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// Focus the dialog panel when opened so Escape key works immediately
watch(() => props.open, (is_open) => {
  if (is_open) {
    nextTick(() => dialog_el.value?.focus());
  }
});
</script>
