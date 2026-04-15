<template>
  <section class="max-w-md mx-auto space-y-6">
    <UiCard padded>
      <div class="space-y-4">
        <h2 class="text-xl font-semibold">{{ $t('password_reset.title') }}</h2>

        <template v-if="status === 'form'">
          <p class="text-sm text-muted-foreground">{{ $t('password_reset.description') }}</p>
          <div class="space-y-3">
            <div>
              <UiLabel class="block mb-1">{{ $t('password_reset.new_password') }}</UiLabel>
              <UiInput v-model="new_password" autofocus :placeholder="$t('password_reset.new_placeholder')" type="password"
                       autocomplete="new-password" @keydown.enter="do_reset"/>
            </div>
            <div>
              <UiLabel class="block mb-1">{{ $t('password_reset.confirm_password') }}</UiLabel>
              <UiInput v-model="confirm_password" :placeholder="$t('password_reset.confirm_placeholder')" type="password"
                       autocomplete="new-password" @keydown.enter="do_reset"/>
            </div>
            <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
            <UiButton :disabled="loading" class="w-full" @click="do_reset">
              {{ loading ? $t('password_reset.submitting') : $t('password_reset.submit') }}
            </UiButton>
          </div>
        </template>

        <template v-else-if="status === 'success'">
          <div class="text-center space-y-4 py-4">
            <div class="text-4xl">&#10003;</div>
            <p class="text-sm">{{ $t('password_reset.success') }}</p>
            <UiButton @click="$router.push('/account')">{{ $t('password_reset.go_to_login') }}</UiButton>
          </div>
        </template>

        <template v-else-if="status === 'error'">
          <div class="text-center space-y-4 py-4">
            <div class="text-4xl">&#10007;</div>
            <p class="text-sm text-destructive">{{ error }}</p>
            <UiButton variant="outline" @click="$router.push('/account')">{{ $t('password_reset.back_to_account') }}</UiButton>
          </div>
        </template>
      </div>
    </UiCard>
  </section>
</template>

<script lang="ts" setup>
import {ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {api, extract_api_error} from '@/lib/api';
import UiCard from '@/components/ui/Card.vue';
import UiLabel from '@/components/ui/Label.vue';
import UiInput from '@/components/ui/Input.vue';
import UiButton from '@/components/ui/Button.vue';

const {t} = useI18n();
const props = defineProps<{ token: string }>();

const new_password = ref('');
const confirm_password = ref('');
const error = ref('');
const loading = ref(false);
const status = ref<'form' | 'success' | 'error'>('form');

async function do_reset() {
  error.value = '';
  if (new_password.value.length < 8) {
    error.value = t('password_reset.error_min_length');
    return;
  }
  if (new_password.value !== confirm_password.value) {
    error.value = t('password_reset.error_mismatch');
    return;
  }
  loading.value = true;
  try {
    await api.auth_reset_confirm(props.token, new_password.value);
    status.value = 'success';
  } catch (e: unknown) {
    const err = extract_api_error(e);
    error.value = err.data?.error || t('password_reset.error_failed');
    status.value = 'error';
  } finally {
    loading.value = false;
  }
}
</script>
