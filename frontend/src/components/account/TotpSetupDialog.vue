<template>
  <UiDialog :open="open" @close="$emit('close')">
    <template #title>{{ step === 'backup' ? $t('account.totp.backup_title') : $t('account.totp.enable') }}</template>
    <div class="space-y-4">
      <div v-if="step === 'qr'">
        <p class="text-sm text-muted-foreground mb-3">{{ $t('account.totp.scan_qr') }}</p>
        <div class="flex justify-center">
          <canvas ref="qr_canvas" class="border rounded"></canvas>
        </div>
        <div class="flex justify-center mt-2">
          <UiButton size="sm" variant="outline" @click="$emit('copy_secret')">{{ $t('account.totp.copy_secret') }}</UiButton>
        </div>
        <div class="space-y-2 pt-3 mt-3 border-t border-border">
          <div class="text-sm font-medium">{{ $t('account.totp.enter_code') }}</div>
          <div class="flex items-center gap-2">
            <UiInput v-model="verify_code" :placeholder="$t('account.totp.code_placeholder')" type="text" inputmode="numeric"
                     maxlength="6" class="w-32 text-center tracking-widest" @input="on_verify_input"/>
            <UiButton size="sm" @click="$emit('confirm', verify_code)">{{ $t('app.confirm') }}</UiButton>
          </div>
        </div>
      </div>
      <div v-else-if="step === 'backup'">
        <p class="text-sm text-muted-foreground mb-3">{{ $t('account.totp.backup_save_hint') }}</p>
        <div class="grid grid-cols-2 gap-2 p-3 bg-muted rounded-md font-mono text-sm">
          <div v-for="code in backup_codes" :key="code" class="text-center py-1">{{ code }}</div>
        </div>
        <div class="flex items-center justify-between mt-3">
          <UiButton size="sm" variant="outline" @click="$emit('copy_codes')">{{ $t('account.totp.copy_codes') }}</UiButton>
          <UiButton size="sm" @click="$emit('close')">{{ $t('account.totp.done') }}</UiButton>
        </div>
      </div>
    </div>
  </UiDialog>
</template>

<script lang="ts" setup>
import {nextTick, ref, watch} from 'vue';
import UiDialog from '@/components/ui/Dialog.vue';
import UiInput from '@/components/ui/Input.vue';
import UiButton from '@/components/ui/Button.vue';
import QRCode from 'qrcode';

const props = defineProps<{
    open: boolean;
    step: 'qr' | 'backup';
    otpauth_url: string;
    backup_codes: string[];
}>();

const emit = defineEmits<{
    close: [];
    confirm: [code: string];
    copy_secret: [];
    copy_codes: [];
}>();

const qr_canvas = ref<HTMLCanvasElement | null>(null);
const verify_code = ref('');

watch(() => props.open, async (val) => {
    if (val) {
        verify_code.value = '';
    }
});

watch(() => props.otpauth_url, async (url) => {
    if (url && props.open) {
        await nextTick();
        if (qr_canvas.value) {
            await QRCode.toCanvas(qr_canvas.value, url, {width: 200});
        }
    }
});

function on_verify_input() {
    if (verify_code.value.length === 6 && /^\d{6}$/.test(verify_code.value)) {
        emit('confirm', verify_code.value);
    }
}
</script>
