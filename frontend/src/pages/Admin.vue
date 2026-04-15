<template>
  <div class="container">
    <h2 class="mb-6 text-xl font-semibold">{{ $t('admin.title') }}</h2>

    <!-- Not admin -->
    <div v-if="!auth.is_admin.value" class="text-center text-sm text-muted-foreground">
      {{ $t('admin.no_access') }}
    </div>

    <!-- Admin panel -->
    <div v-else>
      <UiCard padded>
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-semibold">{{ $t('admin.users_heading') }}</h3>
          <UiButton size="sm" variant="outline" @click="load_users">{{ $t('admin.refresh') }}</UiButton>
        </div>

        <div v-if="loading" class="text-sm text-muted-foreground">{{ $t('admin.loading') }}</div>

        <div v-else-if="users.length === 0" class="text-sm text-muted-foreground">{{ $t('admin.no_users') }}</div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
            <tr class="border-b text-left text-xs text-muted-foreground">
              <th class="pb-2 pr-4">{{ $t('admin.table.username') }}</th>
              <th class="pb-2 pr-4">{{ $t('admin.table.email') }}</th>
              <th class="pb-2 pr-4">{{ $t('admin.table.created_at') }}</th>
              <th class="pb-2 pr-4">{{ $t('admin.table.last_login') }}</th>
              <th class="pb-2 pr-4">{{ $t('admin.table.totp') }}</th>
              <th class="pb-2 pr-4">{{ $t('admin.table.sso') }}</th>
              <th class="pb-2 pr-4">{{ $t('admin.table.admin') }}</th>
              <th class="pb-2">{{ $t('admin.table.actions') }}</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="u in users" :key="u.id" class="border-b last:border-0">
              <td class="py-2 pr-4 font-medium">{{ u.username || '–' }}</td>
              <td class="py-2 pr-4">{{ u.email || '–' }}</td>
              <td class="py-2 pr-4 whitespace-nowrap">{{ format_date(u.created_at) }}</td>
              <td class="py-2 pr-4 whitespace-nowrap">{{ u.last_login_at ? format_date(u.last_login_at) : '–' }}</td>
              <td class="py-2 pr-4">
                <span v-if="u.twofa_enabled"
                      class="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                  {{ $t('admin.badge_active') }}
                </span>
                <span v-else
                      class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                  {{ $t('admin.badge_off') }}
                </span>
              </td>
              <td class="py-2 pr-4">
                <span v-if="u.has_oidc"
                      class="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                  SSO
                </span>
              </td>
              <td class="py-2 pr-4">
                <span v-if="u.is_admin"
                      class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {{ $t('admin.badge_admin') }}
                </span>
              </td>
              <td class="py-2">
                <div class="flex items-center gap-1 flex-wrap">
                  <UiButton v-if="u.email" size="sm" variant="outline"
                            @click="confirm_action = {type: 'reset', user: u}">
                    {{ $t('admin.action_reset_password') }}
                  </UiButton>
                  <UiButton v-if="u.twofa_enabled" size="sm" variant="outline"
                            @click="confirm_action = {type: 'totp', user: u}">
                    {{ $t('admin.action_disable_totp') }}
                  </UiButton>
                  <UiButton v-if="u.id !== auth.user.value?.id" size="sm" variant="destructive"
                            @click="confirm_action = {type: 'delete', user: u}">
                    {{ $t('admin.action_delete') }}
                  </UiButton>
                </div>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
      </UiCard>
    </div>

    <!-- Confirmation dialog -->
    <UiDialog :open="!!confirm_action" @close="confirm_action = null">
      <template #title>{{ dialog_title }}</template>
      <div class="space-y-3">
        <p class="text-sm" :class="confirm_action?.type === 'delete' ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'">
          {{ dialog_message }}
        </p>
        <div class="flex justify-end gap-2">
          <UiButton size="sm" variant="outline" @click="confirm_action = null">{{ $t('app.cancel') }}</UiButton>
          <UiButton size="sm" :variant="confirm_action?.type === 'delete' ? 'destructive' : 'default'"
                    @click="do_action">
            {{ $t('app.confirm') }}
          </UiButton>
        </div>
      </div>
    </UiDialog>
  </div>
</template>

<script lang="ts" setup>
import {computed, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {get_locale} from '@/i18n';
import UiButton from '@/components/ui/Button.vue';
import UiCard from '@/components/ui/Card.vue';
import UiDialog from '@/components/ui/Dialog.vue';
import {toast, toast_error} from '@/components/ui/Toast.vue';
import {api, extract_api_error} from '@/lib/api';
import type {admin_user_summary} from '@/lib/types';
import {useAuth} from '@/composables/useAuth';

const {t} = useI18n();

type ConfirmAction = {
    type: 'reset' | 'totp' | 'delete';
    user: admin_user_summary;
} | null;

const auth = useAuth();
const users = ref<admin_user_summary[]>([]);
const loading = ref(false);
const confirm_action = ref<ConfirmAction>(null);

const dialog_title = computed(() => {
    if (!confirm_action.value) return '';
    switch (confirm_action.value.type) {
        case 'reset':
            return t('admin.dialog_reset_title');
        case 'totp':
            return t('admin.dialog_disable_totp_title');
        case 'delete':
            return t('admin.dialog_delete_title');
    }
});

const dialog_message = computed(() => {
    if (!confirm_action.value) return '';
    const target = confirm_action.value.user;
    const name = target.username || target.email || `ID ${target.id}`;
    switch (confirm_action.value.type) {
        case 'reset':
            return t('admin.dialog_reset_message', {email: target.email || name});
        case 'totp':
            return t('admin.dialog_disable_totp_message', {username: name});
        case 'delete':
            return t('admin.dialog_delete_message', {username: name});
    }
});

function format_date(iso?: string | null): string {
    if (!iso) return '–';
    const d = new Date(iso);
    const locale = get_locale();
    return d.toLocaleDateString(locale, {day: '2-digit', month: '2-digit', year: 'numeric'})
        + ' ' + d.toLocaleTimeString(locale, {hour: '2-digit', minute: '2-digit'});
}

async function load_users() {
    loading.value = true;
    try {
        const res = await api.admin_list_users();
        users.value = res.users || [];
    } catch (e: unknown) {
        const err = extract_api_error(e);
        toast_error(err.data?.error || t('admin.toast_action_failed'));
    } finally {
        loading.value = false;
    }
}

async function do_action() {
    if (!confirm_action.value) return;
    const {type, user} = confirm_action.value;
    confirm_action.value = null;
    try {
        switch (type) {
            case 'reset':
                await api.admin_reset_password(user.id);
                toast(t('admin.toast_reset_sent'));
                break;
            case 'totp':
                await api.admin_disable_totp(user.id);
                toast(t('admin.toast_totp_disabled'));
                await load_users();
                break;
            case 'delete':
                await api.admin_delete_user(user.id);
                toast(t('admin.toast_user_deleted'));
                await load_users();
                break;
        }
    } catch (e: unknown) {
        const err = extract_api_error(e);
        toast_error(err.data?.error || t('admin.toast_action_failed'));
    }
}

onMounted(async () => {
    if (!auth.user.value && !auth.loading.value) {
        await auth.refresh();
    }
    if (auth.is_admin.value) {
        await load_users();
    }
});
</script>
