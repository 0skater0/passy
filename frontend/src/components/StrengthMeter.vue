<template>
  <div class="space-y-2">
    <div class="text-xs font-medium text-muted-foreground">{{ $t('strength.crack_time') }}</div>
    <UiTabs v-model="active" :items="tabs"/>
    <!-- Custom rate input when "custom" tab is active -->
    <div v-if="active === 'custom'" class="flex items-center gap-2 mt-1">
      <span class="text-xs text-muted-foreground whitespace-nowrap">{{ $t('strength.rate_prefix') }} 10^</span>
      <UiInput v-model.number="custom_exponent" class="w-20" type="number" min="0" max="30" step="1"/>
      <span class="text-xs text-muted-foreground whitespace-nowrap">{{ $t('strength.rate_custom_label') }}</span>
    </div>
    <div class="text-sm mt-2 cursor-pointer select-none" @click="toggle_words">
      {{ show_words ? current_label_words : current_label_numeric }}
      <span class="text-xs text-muted-foreground">{{ $t('strength.avg_case') }}</span>
    </div>
    <div class="text-xs text-muted-foreground">{{ $t('strength.rate_prefix') }} ~{{ rate_range }}</div>
  </div>
</template>

<script lang="ts" setup>
import {computed, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import UiTabs from '@/components/ui/Tabs.vue';
import UiInput from '@/components/ui/Input.vue';
import {
  ATTACK_PROFILES,
  estimate_crack_custom,
  estimate_crack_profiles,
  to_non_exponential
} from '@/lib/crack-time';

const {t} = useI18n();
const props = defineProps<{ guessesLog10?: number; entropyBitsFallback?: number }>();

const CUSTOM_STORAGE_KEY = 'passy_custom_hashrate';

function load_custom_exponent(): number {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0 && n <= 30) return n;
    }
  } catch {
  }
  return 12;
}

const custom_exponent = ref(load_custom_exponent());

watch(custom_exponent, (val) => {
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, String(val));
  } catch {
  }
});

const profile_key_map: Record<string, string> = {
  online_strict: 'strength.profiles.online_strict',
  online_weak: 'strength.profiles.online_weak',
  offline_gpu_single: 'strength.profiles.offline_gpu',
  offline_gpu_multi: 'strength.profiles.offline_multi_gpu',
  sha2: 'strength.profiles.sha256',
  bcrypt: 'strength.profiles.bcrypt',
  scrypt: 'strength.profiles.scrypt',
  argon2id: 'strength.profiles.argon2',
  pbkdf2: 'strength.profiles.pbkdf2',
  supercomputer: 'strength.profiles.supercomputer'
};

const active = ref<string>(ATTACK_PROFILES[0].id);
const tabs = computed(() => [
  ...ATTACK_PROFILES.map(p => ({value: p.id, label: profile_key_map[p.id] ? t(profile_key_map[p.id]) : p.label})),
  {value: 'custom', label: t('strength.profiles.custom')}
]);

const all_estimates = computed(() => {
  const base = estimate_crack_profiles(props.guessesLog10 ?? 0, props.entropyBitsFallback);
  const rate = Math.pow(10, custom_exponent.value ?? 12);
  base.push(estimate_crack_custom(props.guessesLog10 ?? 0, rate, props.entropyBitsFallback));
  return base;
});

const current = computed(() => all_estimates.value.find(e => e.id === active.value) || all_estimates.value[0]);

const YEAR_SEC = 31557600;
const TIME_SCALES: {key: string; value: number}[] = [
  {key: 'thousand', value: 1e3},
  {key: 'million', value: 1e6},
  {key: 'billion', value: 1e9},
  {key: 'trillion', value: 1e12},
  {key: 'quadrillion', value: 1e15},
  {key: 'quintillion', value: 1e18},
  {key: 'sextillion', value: 1e21},
  {key: 'septillion', value: 1e24},
  {key: 'octillion', value: 1e27},
];
const DURATION_UNITS: {key: string; secs: number}[] = [
  {key: 'day', secs: 86400},
  {key: 'hour', secs: 3600},
  {key: 'minute', secs: 60},
  {key: 'second', secs: 1},
];

function localized_duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 1) return t('time.less_than_second');
  let remaining = s;
  const parts: string[] = [];
  for (const u of DURATION_UNITS) {
    const v = Math.floor(remaining / u.secs);
    if (v > 0) {
      parts.push(`${v} ${t(`time.${u.key}`, v)}`);
      remaining -= v * u.secs;
    }
    if (parts.length === 2) break;
  }
  return parts.join(', ') || t('time.less_than_second');
}

function localized_approx(seconds: number): string {
  if (seconds < YEAR_SEC) return localized_duration(seconds);
  const years = seconds / YEAR_SEC;
  let chosen = {key: '', value: 1};
  for (const s of TIME_SCALES) {
    if (years >= s.value) chosen = s;
    else break;
  }
  if (chosen.value === 1) {
    const v = Math.round(years);
    return `~${to_non_exponential(v)} ${t('time.year', v)}`;
  }
  const approx = Math.round(years / chosen.value);
  return `~${to_non_exponential(approx)} ${t(`time.scales.${chosen.key}`, approx)} ${t('time.year', 2)}`;
}

const current_label_numeric = computed(() => {
  const min = current.value?.secondsMin ?? 0;
  const max = current.value?.secondsMax ?? 0;
  const min_years = min / YEAR_SEC;
  const max_years = max / YEAR_SEC;
  if (max <= min || Math.abs(min_years - max_years) < 1) {
    return `${to_non_exponential(min_years)} ${t('time.year', 2)}`;
  }
  return `${to_non_exponential(min_years)} – ${to_non_exponential(max_years)} ${t('time.year', 2)}`;
});
const current_label_words = computed(() => {
  const min = current.value?.secondsMin ?? 0;
  const max = current.value?.secondsMax ?? 0;
  if (max <= min) return localized_approx(min);
  return `${localized_approx(min)} – ${localized_approx(max)}`;
});
const show_words = ref(true);

function toggle_words() {
  show_words.value = !show_words.value;
}

const rate_range = computed(() => {
  const e = current.value;
  if (!e) return '';
  const fmt = (n: number) => {
    const exp = Math.floor(Math.log10(n));
    return `10^${exp}`;
  };
  return `${fmt(e.rateMin)} – ${fmt(e.rateMax)} /s`;
});
</script>
