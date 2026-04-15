import {createRouter, createWebHashHistory} from 'vue-router';
import Home from './pages/Home.vue';
import NotFound from './pages/NotFound.vue';
import Settings from './pages/Settings.vue';
import Account from './pages/Account.vue';
import Admin from './pages/Admin.vue';
import PasswordReset from './pages/PasswordReset.vue';
import LoginVerify from './pages/LoginVerify.vue';
import {useAuth} from './composables/useAuth';

const base = (import.meta.env.VITE_BASE_PATH as string) || '/';

function require_auth(): boolean | {path: string} {
    const {is_logged_in, flags} = useAuth();
    if (!flags.value.accounts_enabled) return true;
    return is_logged_in.value ? true : {path: '/'};
}

function require_admin(): boolean | {path: string} {
    const {is_admin, flags} = useAuth();
    if (!flags.value.accounts_enabled) return true;
    return is_admin.value ? true : {path: '/'};
}

export const router = createRouter({
    history: createWebHashHistory(base),
    routes: [
        {path: '/', component: Home},
        {path: '/settings', component: Settings},
        {path: '/account', component: Account, beforeEnter: require_auth},
        {path: '/account/reset/:token', component: PasswordReset, props: true},
        // Separate route for the TOTP verification step so password managers (1Password)
        // can run their TOTP auto-fill fill-session after the URL changes.
        {path: '/login/verify', component: LoginVerify},
        {path: '/admin', component: Admin, beforeEnter: require_admin},
        {path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFound},
    ],
});
