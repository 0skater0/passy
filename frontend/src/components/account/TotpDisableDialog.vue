<template>
  <UiDialog :open="open" @close="$emit('update:open', false)">
    <template #title>{{ $t('account.totp.disable') }}</template>
    <div class="space-y-3">
      <p class="text-sm text-muted-foreground">{{ $t('account.totp.disable_hint') }}</p>
      <UiInput v-model="code" :placeholder="$t('account.totp.code_placeholder')" type="text" inputmode="numeric"
               maxlength="6" class="text-center text-lg tracking-widest"/>
      <div class="flex justify-end">
        <UiButton size="sm" variant="destructive" @click="$emit('confirm', code)">{{ $t('account.totp.disable') }}</UiButton>
      </div>
    </div>
  </UiDialog>
</template>

<script lang="ts" setup>
import {ref, watch} from 'vue';
import UiDialog from '@/components/ui/Dialog.vue';
import UiInput from '@/components/ui/Input.vue';
import UiButton from '@/components/ui/Button.vue';

const props = defineProps<{
    open: boolean;
}>();

defineEmits<{
    'update:open': [value: boolean];
    confirm: [code: string];
}>();

const code = ref('');

watch(() => props.open, (val) => {
    if (val) {
        code.value = '';
    }
});

defineExpose({
    reset_code() {
        code.value = '';
    }
});
</script>
