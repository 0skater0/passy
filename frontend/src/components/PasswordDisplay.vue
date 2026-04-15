<template>
  <UiCard :aria-label="$t('generator.generated_value')" aria-live="polite" role="status">
    <div class="p-3">
      <div class="text-xs text-muted-foreground capitalize">{{ label }}</div>
      <div class="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="font-mono break-all min-h-[1.25rem] text-sm sm:text-base">
          <span v-if="loading" class="inline-flex items-center gap-1">
            <span class="animate-pulse">•</span><span class="animate-pulse delay-150">•</span><span
              class="animate-pulse delay-300">•</span>
          </span>
          <span v-else>{{ visible ? value : masked }}</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <UiButton :aria-label="$t('generator.toggle_visibility')" size="icon" variant="secondary" @click="visible = !visible">
            <EyeIcon v-if="visible" class="h-5 w-5"/>
            <EyeOffIcon v-else class="h-5 w-5"/>
          </UiButton>
          <UiButton :aria-label="$t('generator.regenerate')" size="icon" variant="secondary" @click="$emit('regenerate')">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
                 xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4v6h6M20 20v-6h-6" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5 15a7 7 0 0012 0M19 9a7 7 0 00-12 0" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </UiButton>
          <UiButton :aria-label="$t('generator.copy_value')" size="icon" variant="secondary" @click="copy_text">
            <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 1H4a2 2 0 00-2 2v12h2V3h12V1z"/>
              <path d="M20 5H8a2 2 0 00-2 2v14h14a2 2 0 002-2V7a2 2 0 00-2-2zm0 16H8V7h12v14z"/>
            </svg>
          </UiButton>
        </div>
      </div>
    </div>
  </UiCard>
</template>

<script lang="ts" setup>
import {computed, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import UiButton from './ui/Button.vue';
import EyeIcon from './icons/EyeIcon.vue';
import EyeOffIcon from './icons/EyeOffIcon.vue';
import UiCard from './ui/Card.vue';
import {toast} from './ui/Toast.vue';

const {t} = useI18n();
const props = defineProps<{ value: string; label: string; loading?: boolean }>();
defineEmits(['regenerate']);

const visible = ref(true);
const masked = computed(() => '•'.repeat(Math.min(props.value.length, 32)));

// Reveal the newly generated value after each regeneration.
watch(() => props.value, () => {
  visible.value = true;
});

async function copy_text() {
  try {
    await navigator.clipboard.writeText(props.value);
    toast(t('app.copied_to_clipboard'));
  } catch {
  }
}
</script>
