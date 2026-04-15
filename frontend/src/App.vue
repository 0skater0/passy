<template>
  <div class="min-h-screen bg-background text-foreground">
    <header class="border-b">
      <div class="container px-4 py-3 flex items-center">
        <!-- Logo + Title (clickable home link) -->
        <router-link to="/" class="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <img :src="logo_url" alt="" class="h-7 w-7 rounded"/>
          <span class="text-xl font-semibold tracking-tight">{{ $t('app.title') }}</span>
        </router-link>

        <!-- Right side: 3 icon buttons -->
        <div class="ml-auto flex items-center gap-1.5">
          <!-- Settings -->
          <router-link to="/settings" class="p-2 rounded-md hover:bg-muted transition-colors"
                       :aria-label="$t('app.settings')">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 xmlns="http://www.w3.org/2000/svg">
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </router-link>

          <!-- Account (hidden when backend/storage is off) -->
          <router-link v-if="auth.flags.value.storage_enabled" to="/account" class="p-2 rounded-md hover:bg-muted transition-colors"
                       :aria-label="$t('app.account')">
            <svg v-if="auth.is_logged_in.value" class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"
                 xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="8" r="4"/>
              <path d="M20 21a8 8 0 10-16 0"/>
            </svg>
            <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                 xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="8" r="4"/>
              <path d="M20 21a8 8 0 10-16 0"/>
            </svg>
          </router-link>

          <!-- Theme toggle -->
          <button :aria-label="is_dark ? $t('app.theme_light') : $t('app.theme_dark')"
                  class="p-2 rounded-md hover:bg-muted transition-colors"
                  @click="on_theme_toggle(!is_dark)">
            <svg v-if="is_dark" class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"
                 xmlns="http://www.w3.org/2000/svg">
              <path d="M21.64 13A9 9 0 1111 2.36 7 7 0 0021.64 13z"/>
            </svg>
            <svg v-else class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 18a6 6 0 100-12 6 6 0 000 12z"/>
              <path
                  d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.54 6.46l-1.41-1.41M7.88 7.88L6.46 6.46m0 11.08l1.41-1.41m9.19-9.19l1.41-1.41"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
    <main class="container px-4 py-6">
      <router-view/>
      <UiToaster/>
    </main>
    <footer class="container px-4 py-6 text-xs opacity-70">
      <div class="text-center space-y-1">
        <div>
          {{ $t('app.footer_created_by') }} <a class="underline" href="https://github.com/0skater0" target="_blank" rel="noopener">0skater0</a>
          <span class="mx-1">|</span>
          <a class="underline" href="https://github.com/0skater0/passy" target="_blank" rel="noopener">{{ $t('app.footer_source') }}</a>
        </div>
        <div v-if="app_version">{{ $t('app.version') }}: {{ app_version }}</div>
      </div>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import {onMounted, ref} from 'vue';
import UiToaster from '@/components/ui/Toast.vue';
import {useAuth} from '@/composables/useAuth';

const is_dark = ref(true);
const app_version = ref('');
const auth = useAuth();

const base_path = (import.meta.env.VITE_BASE_PATH as string) || '/';
const logo_url = `${base_path.replace(/\/$/, '')}/logo.png`;

function on_theme_toggle(val: boolean) {
  is_dark.value = val;
  const root = document.documentElement;
  if (is_dark.value) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  localStorage.setItem('passy_theme', is_dark.value ? 'dark' : 'light');
}

onMounted(async () => {
  const saved = localStorage.getItem('passy_theme');
  is_dark.value = saved ? saved === 'dark' : true;
  if (is_dark.value) document.documentElement.classList.add('dark');
  // Init auth state + fetch version (refresh() already calls api.health() internally)
  try {
    const h = await auth.refresh();
    app_version.value = h?.version || '';
    // Sync settings if already logged in (session cookie present)
    if (auth.is_logged_in.value) auth.sync_after_login();
  } catch {
    app_version.value = '';
  }
});
</script>
