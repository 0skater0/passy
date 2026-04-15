// Shared types for Passy frontend — operating modes, history, and health.

export type generator_type = 'password' | 'passphrase' | 'pin' | 'uuid' | 'pronounceable' | 'totp' | 'special';

export interface history_item {
    id?: number;
    type: generator_type;
    masked: string;
    value?: string;
    length?: number;
    charset?: string;
    entropy_bits?: number;
    zxcvbn_score?: number;
    created_at?: string;
}

export interface health_response {
    status: string;
    storage: boolean;
    version: string;
    accounts_enabled: boolean;
    signup_enabled: boolean;
    oidc_enabled: boolean;
}

export interface history_save_item extends history_item {
    length: number;
}

export interface history_store {
    list(params: {limit: number; offset: number; type: string}): Promise<{items: history_item[]}>;
    save(item: history_save_item): Promise<{ok: boolean; item?: history_item}>;
    remove(id: number): Promise<{ok: boolean}>;
    clear(): Promise<{ok: boolean}>;
}

export interface auth_user {
    id: number;
    username: string | null;
    email: string | null;
    twofa_enabled: boolean;
    is_admin: boolean;
    e2e_salt: string | null;
    auth_method: 'local' | 'oidc';
    created_at: string | null;
}

/** User summary returned by /api/admin/users. Backend strips `oidc_sub` to avoid
 *  leaking IDP-side identifiers and exposes a boolean `has_oidc` flag instead. */
export interface admin_user_summary {
    id: number;
    username?: string | null;
    email?: string | null;
    created_at?: string | null;
    last_login_at?: string | null;
    twofa_enabled: boolean;
    is_admin: boolean;
    has_oidc: boolean;
}
