<template>
  <teleport to="body">
    <div class="pointer-events-none fixed inset-0 z-50 flex flex-col items-end gap-2 p-4">
      <div v-for="t in toasts" :key="t.id"
           :class="['pointer-events-auto w-full max-w-sm rounded-md text-white p-3 shadow-md', t.variant==='error' ? 'bg-red-600 border border-red-700' : 'bg-green-600 border border-green-700']">
        <div class="flex items-start gap-2">
          <div class="text-sm">{{ t.message }}</div>
          <button :aria-label="$t('app.close')" class="ml-auto text-sm leading-none hover:opacity-80"
                  @click="dismiss(t.id)">✕
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script lang="ts" setup>
import {onMounted, onUnmounted, reactive} from 'vue';

interface ToastItem {
  id: string;
  message: string;
  timeout: number;
  variant?: 'default' | 'error';
}

const toasts = reactive<ToastItem[]>([]);

function show(message: string, timeout = 1500, variant: 'default' | 'error' = 'default') {
  const id = crypto.randomUUID();
  toasts.push({id, message, timeout, variant});
  window.setTimeout(() => dismiss(id), timeout);
}

function dismiss(id: string) {
  const idx = toasts.findIndex(t => t.id === id);
  if (idx !== -1) toasts.splice(idx, 1);
}

function handle_event(e: Event) {
  const ce = e as CustomEvent<string | {message: string; timeout?: number; variant?: string}>;
  if (typeof ce.detail === 'string') show(ce.detail);
  else if (ce.detail && typeof ce.detail.message === 'string') show(ce.detail.message, ce.detail.timeout ?? 1500, ce.detail.variant === 'error' ? 'error' : 'default');
}

onMounted(() => window.addEventListener('app:toast', handle_event as EventListener));
onUnmounted(() => window.removeEventListener('app:toast', handle_event as EventListener));
</script>

<script lang="ts">
export function toast(message: string | { message: string; timeout?: number; variant?: 'default' | 'error' }) {
  const detail = typeof message === 'string' ? {message} : message;
  window.dispatchEvent(new CustomEvent('app:toast', {detail}));
}

export function toast_error(message: string, timeout = 2000) {
  window.dispatchEvent(new CustomEvent('app:toast', {detail: {message, timeout, variant: 'error'}}));
}
</script>
