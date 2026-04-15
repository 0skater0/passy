<template>
  <div class="mt-4">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="font-medium">{{ $t('history.saved_items') }}</h3>
      <div class="flex items-center gap-2">
        <label class="text-xs opacity-70">{{ $t('history.show') }}</label>
        <select v-model="page_choice" class="text-xs rounded border px-2 py-1 bg-background">
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="all">{{ $t('history.all') }}</option>
        </select>
        <UiButton size="sm" variant="outline" @click="reload">{{ $t('history.refresh') }}</UiButton>
      </div>
    </div>
    <div v-if="loading && items.length === 0" class="text-sm opacity-70">{{ $t('app.loading') }}</div>
    <div v-else-if="items.length === 0" class="text-sm opacity-70">{{ $t('history.no_items') }}</div>
    <UiCard v-else>
      <div :class="container_class" class="rounded-lg overflow-y-auto">
        <ul class="divide-y">
          <li v-for="it in items" :key="it.id" class="flex items-center justify-between p-3">
            <div>
              <div class="font-mono text-sm">{{
                  visible_ids[it.id] ? (it.value || it.masked) : it.masked
                }}
              </div>
              <div class="text-xs opacity-70">{{ it.created_at }}</div>
            </div>
            <div class="flex items-center gap-2">
              <UiButton :aria-label="$t('history.toggle_visibility')" size="sm" variant="outline" @click="toggle_visible(it)">
                <EyeIcon v-if="visible_ids[it.id]" class="h-4 w-4"/>
                <EyeOffIcon v-else class="h-4 w-4"/>
              </UiButton>
              <UiButton :aria-label="$t('app.copy')" size="sm" variant="outline" @click="copy(it)">{{ $t('app.copy') }}</UiButton>
              <UiButton :aria-label="$t('app.delete')" size="sm" variant="outline" @click="remove(it.id)">{{ $t('app.delete') }}</UiButton>
            </div>
          </li>
        </ul>
      </div>
      <div class="flex items-center justify-between p-2">
        <div class="text-xs opacity-70">{{ $t('history.loaded_count', {count: items.length}) }}</div>
        <UiButton v-if="has_more && page_choice !== 'all'" :disabled="loading_more" size="sm" variant="outline"
                  @click="load_more">{{ $t('history.load_more') }}
        </UiButton>
      </div>
    </UiCard>
  </div>
</template>

<script lang="ts" setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {toast, toast_error} from '@/components/ui/Toast.vue';
import {api} from '@/lib/api';
import UiButton from '@/components/ui/Button.vue';
import UiCard from '@/components/ui/Card.vue';
import EyeIcon from '@/components/icons/EyeIcon.vue';
import EyeOffIcon from '@/components/icons/EyeOffIcon.vue';

const {t} = useI18n();
const props = defineProps<{ type?: string; active?: boolean }>();

interface Item {
  id: number;
  type: string;
  masked: string;
  value?: string;
  created_at: string
}

const items = ref<Item[]>([]);
const loading = ref(false);
const loading_more = ref(false);
const has_more = ref(false);
const page_choice = ref<'10' | '20' | 'all'>('10');
const limit_num = computed(() => page_choice.value === 'all' ? 1000 : Number(page_choice.value));
const container_class = 'h-96';
const visible_ids = ref<Record<number, boolean>>({});

async function reload() {
  loading.value = true;
  try {
    items.value = [];
    await load_more();
  } catch {
    toast_error(t('history.failed_load'));
  } finally {
    loading.value = false;
  }
}

async function load_more() {
  loading_more.value = true;
  try {
    if (page_choice.value === 'all') {
      // fetch all in chunks of 100 until exhausted
      const chunk = 100;
      let offset = items.value.length;
      while (true) {
        const res = await api.history({limit: chunk, offset, type: props.type || 'all'});
        const arr = res.items as Item[];
        items.value = items.value.concat(arr);
        offset += arr.length;
        if (arr.length < chunk) break;
      }
      has_more.value = false;
      return;
    }
    const res = await api.history({limit: limit_num.value, offset: items.value.length, type: props.type || 'all'});
    const arr = res.items as Item[];
    items.value = items.value.concat(arr);
    has_more.value = arr.length === limit_num.value;
  } catch {
    toast_error(t('history.failed_load'));
  } finally {
    loading_more.value = false;
  }
}

async function remove(id: number) {
  try {
    await api.delete_history(id);
    items.value = items.value.filter(it => it.id !== id);
    delete visible_ids.value[id];
    toast(t('history.deleted'));
  } catch {
    toast_error(t('history.failed_delete'));
  }
}

async function copy(it: Item) {
  if (!it.value) {
    // Nothing to copy if the item isn't revealed (encrypted and not yet decrypted).
    // Falling back to the masked value would silently copy "xx***yy" — confusing.
    toast_error(t('history.reveal_to_copy'));
    return;
  }
  try {
    await navigator.clipboard.writeText(it.value);
    toast(t('app.copied_to_clipboard'));
  } catch {
  }
}

function toggle_visible(it: Item) {
  if (visible_ids.value[it.id]) {
    delete visible_ids.value[it.id];
  } else {
    visible_ids.value[it.id] = true;
  }
}

onMounted(() => reload().then(apply_pending_reveals));
watch(page_choice, () => reload());
watch(() => props.type, () => reload());

// Reload when the accordion opens in case items were added in the meantime
const stale = ref(false);
watch(() => props.active, (active) => {
  if (active && stale.value) {
    stale.value = false;
    reload().then(apply_pending_reveals);
  }
});

const pending_reveals: { masked: string; value: string }[] = [];

// Auto-refresh when Home saves a new history item.
// Capture the actual value so copy/reveal work for recent items.
function on_history_saved(e: Event) {
  const detail = (e as CustomEvent).detail;
  if (detail?.masked && detail?.value) {
    pending_reveals.push({masked: detail.masked, value: detail.value});
  }
  if (props.active) {
    reload().then(apply_pending_reveals);
  } else {
    stale.value = true;
  }
}

onMounted(() => window.addEventListener('history:saved', on_history_saved));
onUnmounted(() => window.removeEventListener('history:saved', on_history_saved));

function apply_pending_reveals() {
  for (const pr of pending_reveals) {
    const match = items.value.find(it => it.masked === pr.masked && !it.value);
    if (match) match.value = pr.value;
  }
  pending_reveals.length = 0;
}
</script>
