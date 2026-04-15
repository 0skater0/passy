<template>
  <UiDialog :open="open" @close="$emit('update:open', false)">
    <template #title>{{ $t('account.data.delete_all_history') }}</template>
    <div class="space-y-3">
      <p class="text-sm text-muted-foreground">{{ $t('account.data.clear_confirm') }}</p>
      <div class="flex justify-end gap-2">
        <UiButton size="sm" variant="outline" @click="$emit('update:open', false)">{{ $t('app.cancel') }}</UiButton>
        <UiButton size="sm" variant="destructive" @click="$emit('confirm')">{{ $t('app.delete') }}</UiButton>
      </div>
    </div>
  </UiDialog>
</template>

<script lang="ts" setup>
import UiDialog from '@/components/ui/Dialog.vue';
import UiButton from '@/components/ui/Button.vue';

defineProps<{
    open: boolean;
}>();

defineEmits<{
    'update:open': [value: boolean];
    confirm: [];
}>();
</script>
