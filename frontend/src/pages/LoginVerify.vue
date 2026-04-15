<template>
  <section class="max-w-md mx-auto">
    <UiCard padded>
      <div class="space-y-4">
        <h2 class="text-lg font-semibold text-center">{{ $t('account.totp.login_title') }}</h2>

        <!-- TOTP step -->
        <form v-if="!backup_mode" class="space-y-3" @submit.prevent="verify_totp">
          <p class="text-sm text-muted-foreground">{{ $t('account.totp.login_enter_code') }}</p>
          <UiInput v-model="code" name="totp-code" autocomplete="one-time-code" inputmode="numeric"
                   type="text" maxlength="6" autofocus
                   class="text-center text-lg tracking-widest"
                   :placeholder="$t('account.totp.code_placeholder')" @input="on_code_input"/>
          <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
          <div class="text-xs text-muted-foreground text-center">
            {{ $t('account.totp.login_no_access') }}
            <button type="button" class="underline" @click="backup_mode = true; error = ''">
              {{ $t('account.totp.login_use_backup') }}
            </button>
          </div>
        </form>

        <!-- Backup-code step -->
        <form v-else class="space-y-3" @submit.prevent="verify_backup">
          <p class="text-sm text-muted-foreground">{{ $t('account.totp.login_enter_backup') }}</p>
          <UiInput v-model="backup_code" name="backup-code" type="text" autofocus
                   placeholder="XXXX-XXXX" class="text-center text-lg tracking-widest"/>
          <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
          <div class="flex items-center justify-between">
            <button type="button" class="text-xs text-muted-foreground underline"
                    @click="backup_mode = false; error = ''">
              {{ $t('account.totp.login_back_totp') }}
            </button>
            <UiButton size="sm" type="submit">{{ $t('account.login.submit') }}</UiButton>
          </div>
        </form>
      </div>
    </UiCard>
  </section>
</template>

<script lang="ts" setup>
import {onMounted, ref} from 'vue';
import {useRouter} from 'vue-router';
import {useI18n} from 'vue-i18n';
import {useAuth, get_pending_login, set_pending_login} from '@/composables/useAuth';
import {extract_api_error} from '@/lib/api';
import {toast, toast_error} from '@/components/ui/Toast.vue';
import UiCard from '@/components/ui/Card.vue';
import UiInput from '@/components/ui/Input.vue';
import UiButton from '@/components/ui/Button.vue';

const {t} = useI18n();
const router = useRouter();
const auth = useAuth();

const code = ref('');
const backup_code = ref('');
const backup_mode = ref(false);
const error = ref('');

onMounted(() => {
    // If no pending credentials (e.g. direct navigation, refresh) bounce back to login.
    if (!get_pending_login()) {
        void router.replace('/account');
    }
});

function on_code_input(): void {
    error.value = '';
    if (/^\d{6}$/.test(code.value)) {
        void verify_totp();
    }
}

async function verify_totp(): Promise<void> {
    if (!/^\d{6}$/.test(code.value)) return;
    const pending = get_pending_login();
    if (!pending) {
        await router.replace('/account');
        return;
    }
    try {
        await auth.login({identifier: pending.identifier, password: pending.password, totp: code.value});
        toast(t('account.login.success'));
        set_pending_login(null);
        auth.sync_after_login();
        await router.replace('/account');
    } catch (e: unknown) {
        const err = extract_api_error(e);
        error.value = err.data?.error === 'Invalid TOTP'
            ? t('account.totp.login_invalid_code')
            : t('account.totp.login_failed');
        code.value = '';
    }
}

async function verify_backup(): Promise<void> {
    const trimmed = backup_code.value.trim();
    if (!trimmed) return;
    const pending = get_pending_login();
    if (!pending) {
        await router.replace('/account');
        return;
    }
    try {
        await auth.login({identifier: pending.identifier, password: pending.password, backup_code: trimmed});
        toast(t('account.login.success'));
        set_pending_login(null);
        auth.sync_after_login();
        await router.replace('/account');
    } catch (e: unknown) {
        const err = extract_api_error(e);
        error.value = err.data?.error === 'Invalid backup code'
            ? t('account.totp.login_invalid_backup')
            : t('account.totp.login_failed');
        backup_code.value = '';
        toast_error(error.value);
    }
}
</script>
