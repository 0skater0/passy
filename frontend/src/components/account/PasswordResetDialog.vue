<template>
  <UiDialog :open="open" @close="$emit('update:open', false)">
    <template #title>{{ $t('account.reset.dialog_title') }}</template>
    <div class="space-y-3">
      <p class="text-sm text-muted-foreground">{{ $t('account.reset.dialog_hint') }}</p>
      <UiInput v-model="identifier" autofocus :placeholder="$t('account.reset.email_placeholder')" type="email"
               @keydown.enter="$emit('submit', identifier)"/>
      <p v-if="sent" class="text-sm text-green-500">{{ $t('account.reset.sent') }}</p>
      <UiButton :disabled="!identifier || sent" class="w-full" @click="$emit('submit', identifier)">
        {{ sent ? $t('account.reset.label_sent') : $t('account.reset.submit') }}
      </UiButton>
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
    sent: boolean;
}>();

defineEmits<{
    'update:open': [value: boolean];
    submit: [identifier: string];
}>();

const identifier = ref('');

watch(() => props.open, (val) => {
    if (val) {
        identifier.value = '';
    }
});
</script>
