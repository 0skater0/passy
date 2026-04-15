<template>
  <UiDialog :open="open" @close="$emit('update:open', false)">
    <template #title>{{ $t('account.totp.backup_title') }}</template>
    <div class="space-y-3">
      <p class="text-sm text-muted-foreground">{{ $t('account.totp.regenerate_hint') }}</p>
      <div class="grid grid-cols-2 gap-2 p-3 bg-muted rounded-md font-mono text-sm">
        <div v-for="code in backup_codes" :key="code" class="text-center py-1">{{ code }}</div>
      </div>
      <div class="flex items-center justify-between">
        <UiButton size="sm" variant="outline" @click="$emit('copy_codes')">{{ $t('account.totp.copy_codes') }}</UiButton>
        <UiButton size="sm" @click="$emit('update:open', false)">{{ $t('account.totp.done') }}</UiButton>
      </div>
    </div>
  </UiDialog>
</template>

<script lang="ts" setup>
import UiDialog from '@/components/ui/Dialog.vue';
import UiButton from '@/components/ui/Button.vue';

defineProps<{
    open: boolean;
    backup_codes: string[];
}>();

defineEmits<{
    'update:open': [value: boolean];
    copy_codes: [];
}>();
</script>
