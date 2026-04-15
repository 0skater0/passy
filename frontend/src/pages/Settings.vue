<template>
  <div class="container">
    <h2 class="mb-6 text-xl font-semibold">{{ $t('app.settings') }}</h2>

    <!-- Settings section -->
    <UiAccordion persistKey="generator_settings">
      <template #title>{{ $t('settings_page.generator_settings') }}</template>
      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">{{ $t('settings_page.adjust_hint') }}</p>
        <div class="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <div class="mb-1 text-sm font-medium">{{ $t('settings_page.password_length') }}</div>
            <div class="flex items-center gap-2">
              <UiLabel class="text-xs text-muted-foreground">{{ $t('settings_page.min') }}</UiLabel>
              <UiInput v-model.number="bounds_password.min" class="w-24" min="1" step="1" type="number"/>
              <UiLabel class="text-xs text-muted-foreground">{{ $t('settings_page.max') }}</UiLabel>
              <UiInput v-model.number="bounds_password.max" class="w-24" min="1" step="1" type="number"/>
              <UiButton class="ml-2" size="sm" variant="outline" @click="save_bounds('password')">{{ $t('app.save') }}</UiButton>
            </div>
          </div>
          <div>
            <div class="mb-1 text-sm font-medium">{{ $t('settings_page.passphrase_words') }}</div>
            <div class="flex items-center gap-2">
              <UiLabel class="text-xs text-muted-foreground">{{ $t('settings_page.min') }}</UiLabel>
              <UiInput v-model.number="bounds_passphrase.min" class="w-24" min="1" step="1" type="number"/>
              <UiLabel class="text-xs text-muted-foreground">{{ $t('settings_page.max') }}</UiLabel>
              <UiInput v-model.number="bounds_passphrase.max" class="w-24" min="1" step="1" type="number"/>
              <UiButton class="ml-2" size="sm" variant="outline" @click="save_bounds('passphrase_words')">{{ $t('app.save') }}</UiButton>
            </div>
          </div>
          <div>
            <div class="mb-1 text-sm font-medium">{{ $t('settings_page.pin_length') }}</div>
            <div class="flex items-center gap-2">
              <UiLabel class="text-xs text-muted-foreground">{{ $t('settings_page.min') }}</UiLabel>
              <UiInput v-model.number="bounds_pin.min" class="w-24" min="1" step="1" type="number"/>
              <UiLabel class="text-xs text-muted-foreground">{{ $t('settings_page.max') }}</UiLabel>
              <UiInput v-model.number="bounds_pin.max" class="w-24" min="1" step="1" type="number"/>
              <UiButton class="ml-2" size="sm" variant="outline" @click="save_bounds('pin')">{{ $t('app.save') }}</UiButton>
            </div>
          </div>
          <div>
            <div class="mb-1 text-sm font-medium">{{ $t('settings_page.pronounceable_length') }}</div>
            <div class="flex items-center gap-2">
              <UiLabel class="text-xs text-muted-foreground">{{ $t('settings_page.min') }}</UiLabel>
              <UiInput v-model.number="bounds_pronounceable.min" class="w-24" min="1" step="1" type="number"/>
              <UiLabel class="text-xs text-muted-foreground">{{ $t('settings_page.max') }}</UiLabel>
              <UiInput v-model.number="bounds_pronounceable.max" class="w-24" min="1" step="1" type="number"/>
              <UiButton class="ml-2" size="sm" variant="outline" @click="save_bounds('pronounceable')">{{ $t('app.save') }}</UiButton>
            </div>
          </div>
        </div>
      </div>
    </UiAccordion>

    <!-- Language section -->
    <UiAccordion persistKey="language_settings">
      <template #title>{{ $t('settings_page.language') }}</template>
      <div class="space-y-3">
        <p class="text-sm text-muted-foreground">{{ $t('settings_page.language_hint') }}</p>
        <UiSelect v-model="current_locale" @update:model-value="on_locale_change">
          <option value="en">{{ $t('settings_page.language_en') }}</option>
          <option value="de">{{ $t('settings_page.language_de') }}</option>
        </UiSelect>
      </div>
    </UiAccordion>

    <!-- Encryption section (client-side PIN/build-key, works without backend) -->
    <UiAccordion persistKey="encryption_settings">
      <template #title>{{ $t('settings_page.encryption') }}</template>
      <div class="space-y-4">
        <p class="text-sm text-muted-foreground">{{ $t('settings_page.encryption_hint') }}</p>

        <div class="flex items-center gap-2 text-sm">
          <span class="font-medium">{{ $t('settings_page.encryption_mode') }}:</span>
          <span v-if="enc_mode === 'user_pin'" class="text-green-600 dark:text-green-400">{{ $t('settings_page.encryption_user_pin') }}</span>
          <span v-else-if="enc_mode === 'build_key'" class="text-blue-600 dark:text-blue-400">{{ $t('settings_page.encryption_build_key') }}</span>
          <span v-else class="text-muted-foreground">{{ $t('settings_page.encryption_none') }}</span>
        </div>

        <!-- PIN unlock (if PIN set but not unlocked) -->
        <div v-if="pin_set && enc_mode !== 'user_pin'" class="space-y-2">
          <p class="text-sm">{{ $t('settings_page.pin_unlock_hint') }}</p>
          <div class="flex items-center gap-2">
            <UiInput v-model="unlock_pin" :placeholder="$t('settings_page.pin_placeholder')" class="w-64" type="password"/>
            <UiButton size="sm" @click="do_unlock">{{ $t('settings_page.pin_unlock') }}</UiButton>
          </div>
        </div>

        <!-- PIN management -->
        <div v-else class="space-y-2">
          <div class="flex items-center gap-2">
            <UiInput v-model="new_pin" :placeholder="$t('settings_page.pin_placeholder')" class="w-64" type="password"/>
            <UiInput v-model="confirm_pin" :placeholder="$t('settings_page.pin_confirm_placeholder')" class="w-64" type="password"/>
            <UiButton size="sm" :disabled="pin_busy" @click="do_set_pin">
              {{ pin_set ? $t('settings_page.pin_change') : $t('settings_page.pin_set') }}
            </UiButton>
          </div>
          <UiButton v-if="pin_set" size="sm" variant="outline" :disabled="pin_busy" @click="do_remove_pin">
            {{ $t('settings_page.pin_remove') }}
          </UiButton>
        </div>
      </div>
    </UiAccordion>
  </div>
</template>

<script lang="ts" setup>
import {reactive, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import UiButton from '@/components/ui/Button.vue';
import UiInput from '@/components/ui/Input.vue';
import UiLabel from '@/components/ui/Label.vue';
import UiAccordion from '@/components/ui/Accordion.vue';
import UiSelect from '@/components/ui/Select.vue';
import {type Bounds, get_effective_bounds, set_user_bounds} from '@/lib/limits';
import {toast, toast_error} from '@/components/ui/Toast.vue';
import {clear_user_pin, get_encryption_mode, has_user_pin, set_user_pin, unlock_with_pin} from '@/lib/crypto';
import {get_locale, set_locale, type SupportedLocale} from '@/i18n';
const {t} = useI18n();

// --- Language ---
const current_locale = ref(get_locale());

function on_locale_change(val: string) {
  set_locale(val as SupportedLocale);
}

const bounds_password = reactive({...get_effective_bounds('password')});
const bounds_passphrase = reactive({...get_effective_bounds('passphrase_words')});
const bounds_pin = reactive({...get_effective_bounds('pin')});
const bounds_pronounceable = reactive({...get_effective_bounds('pronounceable')});

// --- Encryption / PIN state ---
const enc_mode = ref(get_encryption_mode());
const pin_set = ref(has_user_pin());
const new_pin = ref('');
const confirm_pin = ref('');
const unlock_pin = ref('');
const pin_busy = ref(false);

async function do_set_pin() {
  if (new_pin.value.length < 4) return toast_error(t('settings_page.pin_too_short'));
  if (new_pin.value !== confirm_pin.value) return toast_error(t('settings_page.pin_mismatch'));
  pin_busy.value = true;
  try {
    await set_user_pin(new_pin.value);
    enc_mode.value = get_encryption_mode();
    pin_set.value = true;
    new_pin.value = '';
    confirm_pin.value = '';
    toast(t('settings_page.pin_saved'));
  } catch {
    toast_error(t('settings_page.pin_wrong'));
  } finally {
    pin_busy.value = false;
  }
}

async function do_remove_pin() {
  pin_busy.value = true;
  try {
    await clear_user_pin();
    enc_mode.value = get_encryption_mode();
    pin_set.value = false;
    toast(t('settings_page.pin_removed'));
  } finally {
    pin_busy.value = false;
  }
}

async function do_unlock() {
  const ok = await unlock_with_pin(unlock_pin.value);
  if (ok) {
    enc_mode.value = get_encryption_mode();
    unlock_pin.value = '';
    toast(t('settings_page.pin_unlocked'));
  } else {
    unlock_pin.value = '';
    toast_error(t('settings_page.pin_wrong'));
  }
}

function save_bounds(key: 'password' | 'passphrase_words' | 'pin' | 'pronounceable') {
  const map: Record<string, Bounds> = {
    password: bounds_password,
    passphrase_words: bounds_passphrase,
    pin: bounds_pin,
    pronounceable: bounds_pronounceable
  } as const;
  const b = map[key];
  if (b.max < b.min) b.max = b.min;
  set_user_bounds(key, {min: Math.max(1, Math.floor(b.min)), max: Math.max(1, Math.floor(b.max))});
  const toast_key_map: Record<typeof key, string> = {
    password: 'settings_page.saved_range_password',
    passphrase_words: 'settings_page.saved_range_passphrase',
    pin: 'settings_page.saved_range_pin',
    pronounceable: 'settings_page.saved_range_pronounceable',
  };
  toast(t(toast_key_map[key]));
}
</script>
