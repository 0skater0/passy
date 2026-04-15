<template>
  <section class="space-y-6">
    <UiTabs v-model="mode" :items="translated_modes"/>

    <UiCard padded>
      <div class="space-y-4">
        <GeneratorControls v-model="options" :mode="mode"/>
        <PasswordDisplay :label="output_label" :loading="is_checking" :value="current" @regenerate="regenerate"/>
        <StrengthMeter v-if="mode !== 'uuid' && mode !== 'totp' && mode !== 'special'" :entropyBitsFallback="options.entropyBitsFallback"
                       :guessesLog10="strength.guessesLog10"/>
      </div>
    </UiCard>

    <div class="mt-6">
      <UiAccordion persistKey="history" @toggle="history_open = $event">
        <template #title>{{ $t('history.title') }}</template>
        <HistoryList :active="history_open" :type="mode"/>
      </UiAccordion>
    </div>
  </section>
</template>

<script lang="ts" setup>
import {computed, reactive, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import GeneratorControls from '@/components/GeneratorControls.vue';
import PasswordDisplay from '@/components/PasswordDisplay.vue';
import StrengthMeter from '@/components/StrengthMeter.vue';
import HistoryList from '@/components/HistoryList.vue';
import UiCard from '@/components/ui/Card.vue';
import UiAccordion from '@/components/ui/Accordion.vue';
import UiTabs from '@/components/ui/Tabs.vue';
import {generate_value, build_charset, type password_options} from '@/lib/generate';
import type {generator_type} from '@/lib/types';
import {get_strength} from '@/lib/strength';
// crack-time profiles handled in StrengthMeter via guessesLog10
import {api} from '@/lib/api';
import {load_settings, save_settings, push_settings_to_server} from '@/lib/storage';
import {toast, toast_error} from '@/components/ui/Toast.vue';
import {useAuth} from '@/composables/useAuth';

const {t} = useI18n();
const auth_state = useAuth();
const default_mode = ((import.meta.env.VITE_DEFAULT_MODE as string) || 'password') as generator_type;
const modes: generator_type[] = ['password', 'passphrase', 'pronounceable', 'pin', 'uuid', 'totp', 'special'];
const translated_modes = computed(() =>
    modes.map(m => ({value: m, label: t(`generator.modes.${m}`)}))
);
const mode = ref<generator_type>(default_mode);
const options = ref(load_settings(mode.value));
const current = ref('');
const strength = ref(get_strength(''));
const output_label = ref('');
const last_saved_value = ref('');
const last_generated = reactive<Partial<Record<generator_type, string>>>({});
const is_checking = ref(false);
const history_open = ref(false);

function update_entropy_metadata() {
  const m = mode.value;
  if (m === 'password') {
    const opts = options.value as password_options;
    const charset = build_charset(opts);
    const charset_size = [...charset].length;
    opts.charset_summary = `${charset_size} chars`;
    opts.entropyBitsFallback = current.value.length * Math.log2(charset_size || 1);
  } else if (m === 'passphrase') {
    const opts = options.value as Record<string, unknown>;
    const word_count = Number(opts.word_count) || 4;
    const custom_list = String(opts.custom_word_list || '').trim();
    const pool_size = custom_list ? custom_list.split(/[\n,]/).filter(w => w.trim()).length : 40;
    opts.entropyBitsFallback = word_count * Math.log2(pool_size || 1);
  } else if (m === 'pin') {
    const opts = options.value as Record<string, unknown>;
    const length = Number(opts.length) || 4;
    opts.entropyBitsFallback = length * Math.log2(10);
  } else if (m === 'pronounceable') {
    const opts = options.value as Record<string, unknown>;
    const length = Number(opts.length) || 8;
    // Alternating consonants (21) and vowels (5)
    opts.entropyBitsFallback = (length / 2) * Math.log2(21) + (length / 2) * Math.log2(5);
  }
}

async function regenerate() {
  const needs_check = mode.value === 'password' && options.value.check_pwned;
  if (!needs_check) {
    const result = generate_value(mode.value, options.value);
    current.value = result instanceof Promise ? await result : result;
    update_entropy_metadata();
    last_generated[mode.value] = current.value;
    if (current.value && current.value !== last_saved_value.value) {
      last_saved_value.value = current.value;
      save_item().catch(() => {
      });
    }
    return;
  }

  is_checking.value = true;
  const max_attempts = 10;
  current.value = '';
  for (let i = 0; i < max_attempts; i++) {
    const candidate = await Promise.resolve(generate_value(mode.value, options.value));
    try {
      const res = await api.pwned_check(candidate);
      if (res.error) {
        toast(t('generator.pwned_check_failed'));
        current.value = candidate;
        break;
      }
      if (!res.pwned) {
        current.value = candidate;
        break;
      }
      // leaked; try again
    } catch {
      // on error, accept candidate
      current.value = candidate;
      break;
    }
  }
  is_checking.value = false;
  if (!current.value) {
    toast_error(t('generator.pwned_error'));
    return;
  }
  update_entropy_metadata();
  last_generated[mode.value] = current.value;
  if (current.value && current.value !== last_saved_value.value) {
    last_saved_value.value = current.value;
    save_item().catch(() => {
    });
  }
}

async function save_item() {
  const masked = current.value.length <= 4
      ? current.value.replace(/./g, '*')
      : `${current.value.slice(0, 2)}***${current.value.slice(-2)}`;
  const localStrength = get_strength(current.value);
  const payload = {
    type: mode.value,
    masked,
    value: current.value,
    length: current.value.length,
    charset: options.value.charset_summary,
    entropy_bits: localStrength.entropyBits,
    zxcvbn_score: localStrength.score
  };
  await api.save_history(payload);
  try {
    window.dispatchEvent(new CustomEvent('history:saved', {
      detail: {type: mode.value, masked, value: current.value}
    }));
  } catch {
  }
}

watch(current, (val) => {
  strength.value = get_strength(val);
}, {immediate: true});

watch(options, () => {
  save_settings(mode.value, options.value);
  if (auth_state.is_logged_in.value) push_settings_to_server();
}, {deep: true});

watch(mode, (m) => {
  output_label.value = t(`generator.output_labels.${m}`);
  options.value = load_settings(m);
  last_saved_value.value = '';
  if (last_generated[m]) {
    current.value = last_generated[m];
  } else {
    regenerate();
  }
}, {immediate: true});
</script>
