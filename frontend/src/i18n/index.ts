// Vue I18n setup with English and German locales.
// Language preference is persisted in localStorage under `passy_locale`.
import {createI18n, type Composer} from 'vue-i18n';
import en from './locales/en.json';
import de from './locales/de.json';

export type SupportedLocale = 'en' | 'de';

const LOCALE_KEY = 'passy_locale';

/** Detect the initial locale from localStorage, otherwise default to English.
 *
 * We deliberately do NOT auto-detect from navigator.language any more: most
 * Passy users expect English by default and switch to German via the
 * settings if they want it. The previous browser-language sniffing surprised
 * German-locale users who landed on the public demo and got the German UI
 * unexpectedly. */
function detect_locale(): SupportedLocale {
    try {
        const stored = localStorage.getItem(LOCALE_KEY);
        if (stored === 'en' || stored === 'de') return stored;
    } catch { /* ignore */ }
    return 'en';
}

export const i18n = createI18n({
    legacy: false,
    locale: detect_locale(),
    fallbackLocale: 'en',
    messages: {en, de}
});

/** Switch the active locale and persist the choice. */
export function set_locale(locale: SupportedLocale): void {
    (i18n.global as unknown as Composer).locale.value = locale;
    try {
        localStorage.setItem(LOCALE_KEY, locale);
    } catch { /* ignore */ }
}

/** Return the currently active locale. */
export function get_locale(): SupportedLocale {
    return (i18n.global as unknown as Composer).locale.value as SupportedLocale;
}
