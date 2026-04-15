<template>
  <div class="container">
    <h2 class="mb-6 text-xl font-semibold">{{ $t('account.title') }}</h2>

    <!-- Not logged in -->
    <LoggedOutPanel v-if="!auth.is_logged_in.value" @authenticated="sync_profile"/>

    <!-- Logged in -->
    <div v-else class="space-y-6">

      <!-- Admin link (only for admins) -->
      <UiCard v-if="auth.is_admin.value" padded class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold">{{ $t('app.admin') }}</h3>
          <p class="text-sm text-muted-foreground">{{ $t('account.admin_hint') }}</p>
        </div>
        <UiButton variant="outline" @click="$router.push('/admin')">{{ $t('app.admin') }}</UiButton>
      </UiCard>

      <!-- SSO info banner -->
      <div v-if="auth.is_oidc.value" class="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950 px-4 py-3 text-sm text-purple-800 dark:text-purple-200 flex items-center gap-2">
        <span class="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200">SSO</span>
        {{ $t('account.sso.account_note') }}
      </div>

      <!-- Row 1: Profile + Password -->
      <div :class="auth.is_oidc.value ? 'space-y-6' : 'grid gap-6 sm:grid-cols-2'">
        <UiCard padded>
          <h3 class="text-lg font-semibold mb-4">{{ $t('account.profile.heading') }}</h3>
          <div class="space-y-3">
            <div>
              <UiLabel class="text-sm">{{ $t('account.profile.username') }}</UiLabel>
              <UiInput v-model="profile.username" type="text" autocomplete="username"/>
            </div>
            <div>
              <UiLabel class="text-sm">{{ $t('account.profile.email') }}</UiLabel>
              <UiInput v-model="profile.email" type="email" autocomplete="email"/>
            </div>
            <UiButton class="w-full" @click="save_profile">{{ $t('account.profile.save') }}</UiButton>
          </div>
        </UiCard>

        <UiCard v-if="!auth.is_oidc.value" padded>
          <h3 class="text-lg font-semibold mb-4">{{ $t('account.password.heading') }}</h3>
          <div class="space-y-3">
            <div>
              <UiLabel class="text-sm">{{ $t('account.password.current') }}</UiLabel>
              <UiInput v-model="pw.current" type="password" autocomplete="current-password"/>
            </div>
            <div>
              <UiLabel class="text-sm">{{ $t('account.password.next') }}</UiLabel>
              <UiInput v-model="pw.next" type="password" autocomplete="new-password"/>
            </div>
            <UiButton class="w-full" @click="change_password">{{ $t('account.password.change') }}</UiButton>
          </div>
        </UiCard>
      </div>

      <!-- Row 2: TOTP + Danger zone -->
      <div :class="auth.is_oidc.value ? 'space-y-6' : 'grid gap-6 sm:grid-cols-2'">
        <UiCard v-if="!auth.is_oidc.value" padded>
          <h3 class="text-lg font-semibold mb-4">{{ $t('account.totp.heading') }}</h3>
          <div class="flex items-center gap-3 mb-4">
            <span v-if="auth.user.value?.twofa_enabled"
                  class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
              {{ $t('account.totp.enabled') }}
            </span>
            <span v-else
                  class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-300">
              {{ $t('account.totp.disabled') }}
            </span>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <UiButton v-if="!auth.user.value?.twofa_enabled" size="sm" @click="do_totp_setup">{{ $t('account.totp.enable') }}</UiButton>
            <template v-else>
              <UiButton size="sm" variant="outline" @click="show_totp_disable = true">{{ $t('account.totp.disable') }}</UiButton>
              <UiButton size="sm" variant="outline" @click="show_regen_confirm = true">{{ $t('account.totp.regenerate_backup') }}</UiButton>
            </template>
          </div>
        </UiCard>

        <UiCard padded class="border-red-300 dark:border-red-800">
          <h3 class="text-lg font-semibold mb-2 text-red-600 dark:text-red-400">{{ $t('account.danger.heading') }}</h3>
          <p class="text-sm text-muted-foreground mb-4">{{ $t('account.danger.warning') }}</p>
          <div class="flex flex-wrap gap-2">
            <UiButton size="sm" variant="outline" @click="show_clear_history = true">{{ $t('account.data.delete_all_history') }}</UiButton>
            <UiButton size="sm" variant="destructive" @click="show_delete_account = true">{{ $t('account.danger.delete_account') }}</UiButton>
          </div>
        </UiCard>
      </div>

      <!-- Logout -->
      <div class="flex justify-end">
        <UiButton variant="outline" class="text-red-600 dark:text-red-400 border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950"
                  @click="do_logout">{{ $t('account.logout') }}</UiButton>
      </div>
    </div>

    <!-- Logged-in dialogs -->
    <TotpSetupDialog :open="show_totp_setup" :step="totp_setup_step" :otpauth_url="otpauth_url"
                     :backup_codes="backup_codes" @close="close_totp_setup" @confirm="do_totp_confirm"
                     @copy_secret="copy_totp_secret" @copy_codes="copy_backup_codes"/>
    <TotpDisableDialog ref="totp_disable_ref" v-model:open="show_totp_disable" @confirm="do_totp_disable"/>
    <BackupCodesDialog v-model:open="show_backup_codes" :backup_codes="backup_codes" @copy_codes="copy_backup_codes"/>
    <RegenConfirmDialog v-model:open="show_regen_confirm" :is_oidc="auth.is_oidc.value" @confirm="do_regenerate_backup"/>
    <ClearHistoryDialog v-model:open="show_clear_history" @confirm="do_clear_history"/>
    <DeleteAccountDialog v-model:open="show_delete_account" :is_oidc="auth.is_oidc.value" @confirm="do_delete_account"/>
  </div>
</template>

<script lang="ts" setup>
import {onMounted, reactive, ref} from 'vue';
import {useRouter} from 'vue-router';
import {useI18n} from 'vue-i18n';
import UiButton from '@/components/ui/Button.vue';
import UiInput from '@/components/ui/Input.vue';
import UiLabel from '@/components/ui/Label.vue';
import UiCard from '@/components/ui/Card.vue';
import {toast, toast_error} from '@/components/ui/Toast.vue';
import {api, extract_api_error} from '@/lib/api';
import {clear_local_history} from '@/lib/storage';
import {useAuth} from '@/composables/useAuth';
import LoggedOutPanel from '@/components/account/LoggedOutPanel.vue';
import TotpSetupDialog from '@/components/account/TotpSetupDialog.vue';
import TotpDisableDialog from '@/components/account/TotpDisableDialog.vue';
import BackupCodesDialog from '@/components/account/BackupCodesDialog.vue';
import RegenConfirmDialog from '@/components/account/RegenConfirmDialog.vue';
import ClearHistoryDialog from '@/components/account/ClearHistoryDialog.vue';
import DeleteAccountDialog from '@/components/account/DeleteAccountDialog.vue';

const {t} = useI18n();
const router = useRouter();
const auth = useAuth();

// --- Dialog visibility ---
const show_totp_setup = ref(false);
const totp_setup_step = ref<'qr' | 'backup'>('qr');
const otpauth_url = ref('');
const backup_codes = ref<string[]>([]);
const show_totp_disable = ref(false);
const show_backup_codes = ref(false);
const show_regen_confirm = ref(false);
const show_clear_history = ref(false);
const show_delete_account = ref(false);

// --- Component refs ---
const totp_disable_ref = ref<InstanceType<typeof TotpDisableDialog> | null>(null);

// --- Profile + password change state ---
const profile = reactive({username: '', email: ''});
const pw = reactive({current: '', next: ''});

// --- Init ---
onMounted(async () => {
    if (!auth.user.value && !auth.loading.value) {
        await auth.refresh();
    }
    sync_profile();
});

function sync_profile(): void {
    if (auth.user.value) {
        profile.username = auth.user.value.username || '';
        profile.email = auth.user.value.email || '';
    }
}

async function do_logout(): Promise<void> {
    await auth.logout();
    toast(t('account.logout'));
}

async function save_profile(): Promise<void> {
    try {
        const payload: { username?: string; email?: string } = {};
        if (profile.username) payload.username = profile.username;
        if (profile.email) payload.email = profile.email;
        await api.auth_update_profile(payload);
        toast(t('account.profile.updated'));
        await auth.refresh();
        sync_profile();
    } catch (e: unknown) {
        const err = extract_api_error(e);
        toast_error(err.data?.error || t('account.profile.update_failed'));
    }
}

async function change_password(): Promise<void> {
    if (!pw.current || !pw.next) {
        toast_error(t('account.password.fill_both'));
        return;
    }
    try {
        await auth.re_encrypt_for_password_change(pw.next, async () => {
            await api.auth_change_password({current_password: pw.current, new_password: pw.next});
        });
        toast(t('account.password.changed'));
        pw.current = '';
        pw.next = '';
    } catch (e: unknown) {
        const err = extract_api_error(e);
        toast_error(err.data?.error || t('account.password.change_failed'));
    }
}

async function do_totp_setup(): Promise<void> {
    try {
        const res = await api.auth_totp_setup();
        otpauth_url.value = res.otpauth_url || '';
        totp_setup_step.value = 'qr';
        backup_codes.value = [];
        show_totp_setup.value = true;
    } catch {
        toast_error(t('account.totp.setup_failed'));
    }
}

async function do_totp_confirm(code: string): Promise<void> {
    if (!code || code.length !== 6) return;
    try {
        const res = await api.auth_totp_confirm(code);
        toast(t('account.totp.activated'));
        otpauth_url.value = '';
        backup_codes.value = res.backup_codes || [];
        totp_setup_step.value = 'backup';
        await auth.refresh();
    } catch {
        toast_error(t('account.totp.invalid_code'));
    }
}

function close_totp_setup(): void {
    show_totp_setup.value = false;
    otpauth_url.value = '';
    backup_codes.value = [];
    totp_setup_step.value = 'qr';
}

async function copy_totp_secret(): Promise<void> {
    if (!otpauth_url.value) return;
    try {
        const m = otpauth_url.value.match(/secret=([^&]+)/i);
        const secret = m ? decodeURIComponent(m[1]) : '';
        if (secret) {
            await navigator.clipboard.writeText(secret);
            toast(t('account.totp.secret_copied'));
        }
    } catch {
    }
}

async function copy_backup_codes(): Promise<void> {
    if (!backup_codes.value.length) return;
    try {
        await navigator.clipboard.writeText(backup_codes.value.join('\n'));
        toast(t('account.totp.codes_copied'));
    } catch {
    }
}

async function do_totp_disable(code: string): Promise<void> {
    if (!code || code.length !== 6) {
        toast_error(t('account.totp.enter_6_digit'));
        return;
    }
    try {
        await api.auth_totp_disable(code);
        toast(t('account.totp.deactivated'));
        show_totp_disable.value = false;
        await auth.refresh();
    } catch (e: unknown) {
        const err = extract_api_error(e);
        toast_error(err.data?.error || t('account.totp.disable_failed'));
        totp_disable_ref.value?.reset_code();
    }
}

async function do_regenerate_backup(payload: { password?: string; totp?: string }): Promise<void> {
    const is_oidc = auth.is_oidc.value;
    if (is_oidc && !payload.totp) {
        toast_error(t('account.totp.totp_required'));
        return;
    }
    if (!is_oidc && !payload.password) {
        toast_error(t('account.danger.enter_password'));
        return;
    }
    try {
        const res = await api.auth_totp_regenerate_backup(payload);
        backup_codes.value = res.backup_codes || [];
        show_regen_confirm.value = false;
        show_backup_codes.value = true;
    } catch (e: unknown) {
        const err = extract_api_error(e);
        toast_error(err.data?.error || t('account.totp.regenerate_failed'));
    }
}

async function do_clear_history(): Promise<void> {
    try {
        await api.delete_all_history();
        clear_local_history();
        toast(t('account.data.history_deleted'));
        show_clear_history.value = false;
        window.dispatchEvent(new CustomEvent('history:saved'));
    } catch {
        toast_error(t('account.data.clear_failed'));
    }
}

async function do_delete_account(payload: { password?: string; oidc_confirmed?: boolean }): Promise<void> {
    if (auth.is_oidc.value) {
        if (!payload.oidc_confirmed) {
            toast_error(t('account.sso.delete_confirm_oidc'));
            return;
        }
        try {
            await api.auth_delete_account({confirm: true});
            clear_local_history();
            await auth.logout();
            show_delete_account.value = false;
            toast(t('account.danger.account_deleted'));
            router.push('/');
        } catch (e: unknown) {
            const err = extract_api_error(e);
            toast_error(err.data?.error || t('account.danger.delete_failed'));
        }
    } else {
        if (!payload.password) {
            toast_error(t('account.danger.enter_password'));
            return;
        }
        try {
            await api.auth_delete_account({password: payload.password});
            clear_local_history();
            await auth.logout();
            show_delete_account.value = false;
            toast(t('account.danger.account_deleted'));
            router.push('/');
        } catch (e: unknown) {
            const err = extract_api_error(e);
            toast_error(err.data?.error || t('account.danger.delete_failed'));
        }
    }
}
</script>
