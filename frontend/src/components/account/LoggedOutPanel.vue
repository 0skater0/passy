<template>
  <div v-if="auth.flags.value.accounts_enabled" class="max-w-md mx-auto">
    <UiCard padded>
      <!-- Login -->
      <form v-if="auth_mode === 'login'" class="space-y-4" @submit.prevent="do_login">
        <h3 class="text-lg font-semibold text-center">{{ $t('account.login.heading') }}</h3>
        <!-- SSO Login -->
        <div v-if="auth.flags.value.oidc_enabled" class="space-y-4">
          <UiButton type="button" class="w-full" variant="outline" @click="auth.oidc_login()">{{ $t('account.sso.login_button') }}</UiButton>
          <div class="relative">
            <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-border"></div></div>
            <div class="relative flex justify-center text-xs"><span class="bg-card px-2 text-muted-foreground">{{ $t('account.sso.or') }}</span></div>
          </div>
        </div>
        <UiInput v-model="login.identifier" name="username" :placeholder="$t('account.login.identifier_placeholder')" type="text"
                 autocomplete="username"/>
        <UiInput v-model="login.password" name="password" :placeholder="$t('account.login.password_placeholder')" type="password"
                 autocomplete="current-password"/>
        <UiButton type="submit" class="w-full">{{ $t('account.login.submit') }}</UiButton>
        <div class="text-xs text-muted-foreground text-center space-y-1">
          <div v-if="auth.flags.value.signup_enabled">
            {{ $t('account.login.no_account') }}
            <button type="button" class="underline" @click="auth_mode = 'register'">{{ $t('account.login.register_link') }}</button>
          </div>
          <div>
            {{ $t('account.login.forgot_password') }}
            <button type="button" class="underline" @click="show_reset = true">{{ $t('account.login.reset_link') }}</button>
          </div>
        </div>
      </form>

      <!-- Register -->
      <form v-else class="space-y-4" @submit.prevent="do_register">
        <h3 class="text-lg font-semibold text-center">{{ $t('account.register.heading') }}</h3>
        <UiInput v-model="signup.identifier" name="username" :placeholder="$t('account.login.identifier_placeholder')" type="text"
                 autocomplete="username"/>
        <UiInput v-model="signup.password" name="new-password" :placeholder="$t('account.login.password_placeholder')" type="password"
                 autocomplete="new-password"/>
        <UiButton type="submit" class="w-full">{{ $t('account.register.submit') }}</UiButton>
        <div class="text-xs text-muted-foreground text-center">
          {{ $t('account.register.has_account') }}
          <button type="button" class="underline" @click="auth_mode = 'login'">{{ $t('account.register.login_link') }}</button>
        </div>
      </form>
    </UiCard>

    <PasswordResetDialog v-model:open="show_reset" :sent="reset_sent" @submit="do_reset_request"/>
  </div>
  <div v-else class="text-sm text-muted-foreground text-center">{{ $t('account.disabled') }}</div>
</template>

<script lang="ts" setup>
import {reactive, ref} from 'vue';
import {useRouter} from 'vue-router';
import {useI18n} from 'vue-i18n';
import UiButton from '@/components/ui/Button.vue';
import UiInput from '@/components/ui/Input.vue';
import UiCard from '@/components/ui/Card.vue';
import {toast, toast_error} from '@/components/ui/Toast.vue';
import {api, extract_api_error} from '@/lib/api';
import {useAuth, set_pending_login} from '@/composables/useAuth';
import PasswordResetDialog from '@/components/account/PasswordResetDialog.vue';

const emit = defineEmits<{
    (e: 'authenticated'): void;
}>();

const {t} = useI18n();
const router = useRouter();
const auth = useAuth();

const auth_mode = ref<'login' | 'register'>('login');
const login = reactive({identifier: '', password: ''});
const signup = reactive({identifier: '', password: ''});

const show_reset = ref(false);
const reset_sent = ref(false);

async function do_login(): Promise<void> {
    try {
        await auth.login({identifier: login.identifier, password: login.password});
        toast(t('account.login.success'));
        auth.sync_after_login();
        emit('authenticated');
    } catch (e: unknown) {
        const err = extract_api_error(e);
        if (err.status === 401 && err.data?.requires_totp) {
            // Stash credentials in memory and move to the TOTP verification route.
            // A URL change is required for 1Password to trigger TOTP auto-fill.
            set_pending_login({identifier: login.identifier, password: login.password});
            await router.push('/login/verify');
        } else {
            toast_error(t('account.login.failed'));
        }
    }
}

async function do_register(): Promise<void> {
    try {
        const id = (signup.identifier || '').trim();
        if (!id) {
            toast_error(t('account.register.provide_username'));
            return;
        }
        const payload: { username?: string; email?: string; password: string } = {password: signup.password};
        if (id.includes('@')) {
            payload.email = id;
        } else {
            payload.username = id;
        }
        await api.auth_register(payload);
        toast(t('account.register.success'));
        auth_mode.value = 'login';
    } catch (e: unknown) {
        const err = extract_api_error(e);
        toast_error(err.data?.error || t('account.register.failed'));
    }
}

async function do_reset_request(identifier: string): Promise<void> {
    try {
        await api.auth_reset_request(identifier);
        reset_sent.value = true;
    } catch {
        toast_error(t('account.reset.request_failed'));
    }
}
</script>
