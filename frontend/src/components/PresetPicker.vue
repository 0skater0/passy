<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <UiLabel>{{ $t('preset.label') }}</UiLabel>
      <UiSelect v-model="selected" class="flex-1">
        <optgroup :label="$t('preset.builtin')">
          <option v-for="p in presets.builtin" :key="p" :value="p">{{ p }}</option>
        </optgroup>
        <optgroup v-if="presets.custom.length" :label="$t('preset.custom')">
          <option v-for="p in presets.custom" :key="'c_' + p" :value="p">{{ p }}</option>
        </optgroup>
      </UiSelect>
      <UiButton size="sm" :title="$t('preset.save_tooltip')" variant="outline" @click="open_save_dialog">
        <span class="text-xs">{{ $t('app.save') }}</span>
      </UiButton>
      <UiButton v-if="is_selected_custom" size="sm" :title="$t('preset.delete_tooltip')" variant="destructive"
                 @click="confirm_delete">
        <span class="text-xs">{{ $t('app.delete') }}</span>
      </UiButton>
    </div>

    <!-- Save preset dialog -->
    <UiDialog :open="show_save" @close="show_save = false">
      <template #title>{{ $t('preset.save_title') }}</template>
      <div class="space-y-3">
        <div>
          <UiLabel class="block mb-1">{{ $t('preset.name_label') }}</UiLabel>
          <UiInput v-model="new_preset_name" autofocus :placeholder="$t('preset.name_placeholder')" type="text"
                   @keydown.enter="do_save"/>
        </div>
        <p v-if="save_error" class="text-sm text-destructive">{{ save_error }}</p>
      </div>
      <template #footer>
        <UiButton variant="outline" @click="show_save = false">{{ $t('app.cancel') }}</UiButton>
        <UiButton :disabled="!new_preset_name.trim()" @click="do_save">{{ $t('app.save') }}</UiButton>
      </template>
    </UiDialog>

    <!-- Delete confirmation dialog -->
    <UiDialog :open="show_delete" @close="show_delete = false">
      <template #title>{{ $t('preset.delete_title') }}</template>
      <p class="text-sm">{{ $t('preset.delete_confirm', {name: selected}) }}</p>
      <template #footer>
        <UiButton variant="outline" @click="show_delete = false">{{ $t('app.cancel') }}</UiButton>
        <UiButton variant="destructive" @click="do_delete">{{ $t('app.delete') }}</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<script lang="ts" setup>
import {computed, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {
  all_preset_names,
  apply_preset,
  delete_custom_preset,
  is_custom_preset,
  save_custom_preset
} from '@/lib/presets';
import UiLabel from '@/components/ui/Label.vue';
import UiSelect from '@/components/ui/Select.vue';
import UiButton from '@/components/ui/Button.vue';
import UiDialog from '@/components/ui/Dialog.vue';
import UiInput from '@/components/ui/Input.vue';
import {push_settings_to_server} from '@/lib/storage';
import {useAuth} from '@/composables/useAuth';

const {t} = useI18n();
const auth_state = useAuth();
const props = defineProps<{ mode: string; modelValue: Record<string, unknown> }>();
const emit = defineEmits(['update:modelValue']);

// Reactive preset version counter — incremented on save/delete to force recomputation
const version = ref(0);

const presets = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  version.value; // dependency to trigger recomputation
  return all_preset_names(props.mode);
});

const selected = ref(presets.value.builtin[0] ?? '');

const is_selected_custom = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  version.value;
  return is_custom_preset(props.mode, selected.value);
});

// Apply preset when selection changes
watch(selected, (name) => {
  if (!name) return;
  const updated = apply_preset(props.mode, name);
  if (updated) emit('update:modelValue', updated);
});

// Reset selection when mode changes
watch(() => props.mode, () => {
  selected.value = presets.value.builtin[0] ?? '';
});

// --- Save dialog ---
const show_save = ref(false);
const new_preset_name = ref('');
const save_error = ref('');

function open_save_dialog() {
  new_preset_name.value = '';
  save_error.value = '';
  show_save.value = true;
}

function do_save() {
  const name = new_preset_name.value.trim();
  if (!name) return;
  // Prevent overwriting built-in presets
  if (presets.value.builtin.includes(name)) {
    save_error.value = t('preset.overwrite_error');
    return;
  }
  save_custom_preset(props.mode, name, props.modelValue);
  version.value++;
  selected.value = name;
  show_save.value = false;
  if (auth_state.is_logged_in.value) push_settings_to_server();
}

// --- Delete dialog ---
const show_delete = ref(false);

function confirm_delete() {
  show_delete.value = true;
}

function do_delete() {
  const name = selected.value;
  delete_custom_preset(props.mode, name);
  version.value++;
  // Fall back to first built-in preset
  selected.value = presets.value.builtin[0] ?? '';
  show_delete.value = false;
  if (auth_state.is_logged_in.value) push_settings_to_server();
}
</script>
