<template>
  <UiDialog :open="open" @close="$emit('update:open', false)">
    <template #title>{{ $t('account.danger.delete_account') }}</template>
    <div class="space-y-3">
      <p class="text-sm text-red-600 dark:text-red-400 font-medium">{{ $t('account.danger.delete_confirm') }}</p>
      <template v-if="is_oidc">
        <label class="flex items-center gap-2 text-sm">
          <input v-model="oidc_confirmed" type="checkbox"/>
          {{ $t('account.sso.delete_confirm_oidc') }}
        </label>
      </template>
      <template v-else>
        <UiInput v-model="password" :placeholder="$t('account.danger.enter_password')" type="password"
                 autocomplete="current-password"/>
      </template>
      <div class="flex justify-end gap-2">
        <UiButton size="sm" variant="outline" @click="$emit('update:open', false)">{{ $t('app.cancel') }}</UiButton>
        <UiButton size="sm" variant="destructive" @click="handle_confirm">{{ $t('account.danger.delete_account') }}</UiButton>
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
    confirm: [payload: { password?: string; oidc_confirmed?: boolean }];
}>();

const password = ref('');
const oidc_confirmed = ref(false);

watch(() => props.open, (val) => {
    if (val) {
        password.value = '';
        oidc_confirmed.value = false;
    }
});

function handle_confirm() {
    if (props.is_oidc) {
        emit('confirm', {oidc_confirmed: oidc_confirmed.value});
    } else {
        emit('confirm', {password: password.value});
    }
}
</script>
