<template>
  <UiDialog :open="open" @close="handle_close">
    <template #title>{{ $t('account.totp.regenerate_backup') }}</template>
    <div class="space-y-3">
      <p class="text-sm text-muted-foreground">{{ is_oidc ? $t('account.totp.regenerate_confirm_hint_oidc') : $t('account.totp.regenerate_confirm_hint') }}</p>
      <UiInput v-if="is_oidc" v-model="totp_code"
               :placeholder="$t('account.totp.code_placeholder')" type="text" inputmode="numeric"
               maxlength="6" autocomplete="one-time-code" class="text-center text-lg tracking-widest"/>
      <UiInput v-else v-model="password"
               :placeholder="$t('account.danger.enter_password')" type="password" autocomplete="current-password"/>
      <div class="flex justify-end">
        <UiButton size="sm" variant="destructive" @click="handle_confirm">{{ $t('account.totp.regenerate_backup') }}</UiButton>
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
    is_oidc: boolean;
}>();

const emit = defineEmits<{
    'update:open': [value: boolean];
    confirm: [payload: { password?: string; totp?: string }];
}>();

const password = ref('');
const totp_code = ref('');

watch(() => props.open, (val) => {
    if (val) {
        password.value = '';
        totp_code.value = '';
    }
});

function handle_close() {
    password.value = '';
    totp_code.value = '';
    emit('update:open', false);
}

function handle_confirm() {
    if (props.is_oidc) {
        emit('confirm', {totp: totp_code.value});
    } else {
        emit('confirm', {password: password.value});
    }
}
</script>
