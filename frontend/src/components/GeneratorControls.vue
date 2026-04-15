<template>
  <div class="space-y-4">
    <PresetPicker v-model="model" :mode="mode"/>

    <div v-if="mode === 'password'" class="space-y-3">
      <div class="flex items-center gap-3">
        <UiLabel class="w-28" for="length">{{ $t('controls.length') }}</UiLabel>
        <UiSlider id="length" v-model="model.length" :max="limits_password.max" :min="limits_password.min"/>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <UiCheckbox v-model="model.include_upper">{{ $t('controls.uppercase') }}</UiCheckbox>
        <UiCheckbox v-model="model.include_lower">{{ $t('controls.lowercase') }}</UiCheckbox>
        <UiCheckbox v-model="model.include_digits">{{ $t('controls.digits') }}</UiCheckbox>
        <UiCheckbox v-model="model.include_symbols">{{ $t('controls.symbols') }}</UiCheckbox>
        <UiCheckbox v-model="model.include_extra_symbols">{{ $t('controls.extra_symbols') }}</UiCheckbox>
      </div>
      <UiCheckbox v-model="model.check_pwned">{{ $t('controls.check_pwned') }}</UiCheckbox>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <UiLabel class="block opacity-70">{{ $t('controls.custom_include') }}</UiLabel>
          <UiInput v-model="model.custom_include" :placeholder="$t('controls.custom_include_placeholder')" type="text"/>
        </div>
        <div>
          <UiLabel class="block opacity-70">{{ $t('controls.exclude') }}</UiLabel>
          <UiInput v-model="model.exclude" :placeholder="$t('controls.exclude_placeholder')" type="text"/>
        </div>
      </div>
      <div class="text-xs opacity-60">{{ $t('controls.charset') }}: {{ charset_summary }}</div>
    </div>

    <div v-else-if="mode === 'passphrase'" class="space-y-3">
      <div class="flex items-center gap-3">
        <UiLabel class="w-28" for="words">{{ $t('controls.words') }}</UiLabel>
        <UiSlider id="words" v-model="model.word_count" :max="limits_passphrase.max" :min="limits_passphrase.min"/>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <UiLabel class="block">{{ $t('controls.separator') }}</UiLabel>
          <UiInput v-model="model.separator" placeholder="-" type="text"/>
        </div>
        <div>
          <UiLabel class="block">{{ $t('controls.case_style') }}</UiLabel>
          <UiSelect v-model="model.case_style">
            <option value="lower">{{ $t('controls.case_lower') }}</option>
            <option value="upper">{{ $t('controls.case_upper') }}</option>
            <option value="title">{{ $t('controls.case_title') }}</option>
          </UiSelect>
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1">
          <UiLabel class="block">{{ $t('controls.custom_word_list') }}</UiLabel>
          <div class="flex items-center gap-2">
            <span v-if="custom_word_count > 0" class="text-xs text-muted-foreground">{{ $t('controls.words_count', {count: custom_word_count}) }}</span>
            <label class="inline-flex items-center gap-1 cursor-pointer text-xs text-primary hover:underline">
              <span>{{ $t('controls.load_file') }}</span>
              <input ref="file_input" accept=".txt,.csv,.list" class="hidden" type="file" @change="on_file_load"/>
            </label>
            <button v-if="model.custom_word_list" class="text-xs text-destructive hover:underline"
                    type="button" @click="model.custom_word_list = ''">{{ $t('controls.clear') }}
            </button>
          </div>
        </div>
        <textarea v-model="model.custom_word_list"
                  class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  :placeholder="$t('controls.word_list_placeholder')"
                  rows="3"/>
      </div>
    </div>

    <div v-else-if="mode === 'pin'" class="space-y-3">
      <div class="flex items-center gap-3">
        <UiLabel class="w-28" for="pinlen">{{ $t('controls.length') }}</UiLabel>
        <UiSlider id="pinlen" v-model="model.length" :max="limits_pin.max" :min="limits_pin.min"/>
      </div>
    </div>

    <div v-else-if="mode === 'uuid'" class="space-y-2">
      <div class="text-sm opacity-70">{{ $t('controls.uuid_hint') }}</div>
    </div>

    <div v-else-if="mode === 'totp'" class="space-y-3">
      <div class="flex items-center gap-3">
        <UiLabel class="w-28" for="totplen">{{ $t('controls.length') }}</UiLabel>
        <UiSlider id="totplen" v-model="model.length" :max="64" :min="16"/>
      </div>
      <div class="text-xs opacity-60">{{ $t('controls.totp_hint') }}</div>
    </div>
    <div v-else-if="mode === 'pronounceable'" class="space-y-3">
      <div class="flex items-center gap-3">
        <UiLabel class="w-28" for="plen">{{ $t('controls.length') }}</UiLabel>
        <UiSlider id="plen" v-model="model.length" :max="limits_pronounceable.max" :min="limits_pronounceable.min"/>
      </div>
    </div>

    <div v-else-if="mode === 'special'" class="space-y-3">
      <div class="flex items-center gap-3">
        <UiLabel class="w-28">{{ $t('controls.special_type') }}</UiLabel>
        <UiSelect v-model="model.special_type">
          <option v-for="st in special_types" :key="st" :value="st">{{ $t(`controls.special_types.${st}`) }}</option>
        </UiSelect>
      </div>

      <!-- JWT / HMAC / AES: bit length select -->
      <div v-if="model.special_type === 'jwt' || model.special_type === 'hmac' || model.special_type === 'aes'"
           class="flex items-center gap-3">
        <UiLabel class="w-28">{{ $t('controls.special_bits') }}</UiLabel>
        <UiSelect v-model.number="model.bits">
          <option v-for="b in bit_options[model.special_type]" :key="b" :value="b">{{ b }} bit</option>
        </UiSelect>
      </div>

      <!-- RSA: bit length -->
      <div v-if="model.special_type === 'rsa'" class="flex items-center gap-3">
        <UiLabel class="w-28">{{ $t('controls.special_bits') }}</UiLabel>
        <UiSelect v-model.number="model.bits">
          <option :value="2048">2048 bit</option>
          <option :value="4096">4096 bit</option>
        </UiSelect>
      </div>

      <!-- ECDSA: curve -->
      <div v-if="model.special_type === 'ecdsa'" class="flex items-center gap-3">
        <UiLabel class="w-28">{{ $t('controls.special_curve') }}</UiLabel>
        <UiSelect v-model="model.curve">
          <option value="P-256">P-256 (secp256r1)</option>
          <option value="P-384">P-384 (secp384r1)</option>
        </UiSelect>
      </div>

      <!-- API Token: format + byte length -->
      <template v-if="model.special_type === 'api_token'">
        <div class="flex items-center gap-3">
          <UiLabel class="w-28">{{ $t('controls.special_format') }}</UiLabel>
          <UiSelect v-model="model.format">
            <option v-for="f in ['hex', 'base64', 'base32', 'alphanumeric']" :key="f" :value="f">{{ $t(`controls.special_formats.${f}`) }}</option>
          </UiSelect>
        </div>
        <div class="flex items-center gap-3">
          <UiLabel class="w-28">{{ $t('controls.special_byte_length') }}</UiLabel>
          <UiSlider v-model="model.byte_length" :min="16" :max="128"/>
        </div>
      </template>

      <!-- SHA Hash: algorithm + input text -->
      <template v-if="model.special_type === 'sha_hash'">
        <div class="flex items-center gap-3">
          <UiLabel class="w-28">{{ $t('controls.special_sha_algorithm') }}</UiLabel>
          <UiSelect v-model="model.sha_algorithm">
            <option value="SHA-256">SHA-256</option>
            <option value="SHA-384">SHA-384</option>
            <option value="SHA-512">SHA-512</option>
          </UiSelect>
        </div>
        <div>
          <UiLabel class="block mb-1">{{ $t('controls.special_sha_input') }}</UiLabel>
          <textarea v-model="model.sha_input"
                    class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    :placeholder="$t('controls.special_sha_input_placeholder')" rows="3"/>
        </div>
      </template>

      <!-- CLI reference -->
      <div class="text-xs opacity-60">
        <span>{{ $t('controls.special_cli_hint') }}</span>
        <code class="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono">{{ cli_equivalent }}</code>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {computed, onUnmounted, ref, watch} from 'vue';
import {get_effective_bounds} from '@/lib/limits';
import PresetPicker from '@/components/PresetPicker.vue';
import {build_charset_summary} from '@/lib/charset';
import UiLabel from '@/components/ui/Label.vue';
import UiInput from '@/components/ui/Input.vue';
import UiCheckbox from '@/components/ui/Checkbox.vue';
import UiSlider from '@/components/ui/Slider.vue';
import UiSelect from '@/components/ui/Select.vue';

type Mode = 'password' | 'passphrase' | 'pin' | 'uuid' | 'pronounceable' | 'totp' | 'special';
const props = defineProps<{ mode: Mode, modelValue: Record<string, unknown> }>();
const emit = defineEmits(['update:modelValue']);

const special_types = ['jwt', 'hmac', 'aes', 'fernet', 'api_token', 'rsa', 'ecdsa', 'ed25519', 'sha_hash'] as const;

const bit_options: Record<string, number[]> = {
    jwt: [256, 384, 512],
    hmac: [128, 256, 512],
    aes: [128, 192, 256]
};

const cli_equivalent = computed(() => {
    const o = props.modelValue;
    if (!o?.special_type) return '';
    const bits = typeof o.bits === 'number' ? o.bits : Number(o.bits) || 256;
    const bytes = bits / 8;
    switch (o.special_type) {
        case 'jwt': return `openssl rand -base64 ${bytes}`;
        case 'hmac': return `openssl rand -hex ${bytes}`;
        case 'aes': return `openssl rand -base64 ${bytes}`;
        case 'fernet': return 'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"';
        case 'api_token':
            if (o.format === 'hex') return `openssl rand -hex ${o.byte_length || 32}`;
            if (o.format === 'base64') return `openssl rand -base64 ${o.byte_length || 32}`;
            if (o.format === 'base32') return `openssl rand ${o.byte_length || 32} | base32`;
            return `openssl rand -hex ${o.byte_length || 32} | tr -dc 'a-zA-Z0-9'`;
        case 'rsa': return `openssl genrsa ${o.bits || 2048}`;
        case 'ecdsa': return `openssl ecparam -genkey -name ${o.curve === 'P-384' ? 'secp384r1' : 'prime256v1'} -noout`;
        case 'ed25519': return 'openssl genpkey -algorithm Ed25519';
        case 'sha_hash': return `echo -n "..." | ${(o.sha_algorithm || 'SHA-256').toLowerCase().replace('-', '')}sum`;
        default: return '';
    }
});

const model = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
});

const charset_summary = computed(() => build_charset_summary(props.modelValue));

// Debounced deduplication: remove duplicate characters after 750ms of inactivity
function dedupe(val: string): string {
  return [...new Set([...val])].join('');
}

let exclude_timer: ReturnType<typeof setTimeout> | null = null;
let include_timer: ReturnType<typeof setTimeout> | null = null;

watch(() => props.modelValue?.exclude, (val) => {
  if (!val) return;
  if (exclude_timer) clearTimeout(exclude_timer);
  const deduped = dedupe(val);
  if (deduped === val) return; // no duplicates → nothing to do
  exclude_timer = setTimeout(() => {
    if (props.modelValue?.exclude === val) emit('update:modelValue', {...props.modelValue, exclude: deduped});
  }, 750);
});

watch(() => props.modelValue?.custom_include, (val) => {
  if (!val) return;
  if (include_timer) clearTimeout(include_timer);
  const deduped = dedupe(val);
  if (deduped === val) return;
  include_timer = setTimeout(() => {
    if (props.modelValue?.custom_include === val) emit('update:modelValue', {...props.modelValue, custom_include: deduped});
  }, 750);
});

onUnmounted(() => {
  if (exclude_timer) clearTimeout(exclude_timer);
  if (include_timer) clearTimeout(include_timer);
});

// --- Custom word list helpers ---
const file_input = ref<HTMLInputElement | null>(null);

const custom_word_count = computed(() => {
  const raw = props.modelValue?.custom_word_list;
  if (!raw || typeof raw !== 'string') return 0;
  return raw.split(/[\n,]/).map((w: string) => w.trim()).filter((w: string) => w.length > 0).length;
});

function on_file_load(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      emit('update:modelValue', {...props.modelValue, custom_word_list: reader.result});
    }
  };
  reader.readAsText(file);
  // Reset input so the same file can be re-selected
  input.value = '';
}

const limits_password = computed(() => get_effective_bounds('password'));
const limits_passphrase = computed(() => get_effective_bounds('passphrase_words'));
const limits_pin = computed(() => get_effective_bounds('pin'));
const limits_pronounceable = computed(() => get_effective_bounds('pronounceable'));

</script>
