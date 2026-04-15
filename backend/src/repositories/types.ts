// Database-agnostic repository interfaces.
// Implementations live in backend-specific subdirectories (e.g. postgres/).

export type history_type = 'password' | 'passphrase' | 'pin' | 'uuid' | 'pronounceable' | 'totp' | 'special';

// --- History ---

export interface history_row {
    id: number;
    type: history_type;
    masked: string;
    value?: string | null;
    length: number;
    charset: string;
    entropy_bits?: number | null;
    zxcvbn_score?: number | null;
    created_at?: string | null;
    user_id?: number | null;
}

export interface create_history_input {
    user_id?: number | null;
    type: history_type;
    masked: string;
    value?: string | null;
    length: number;
    charset: string;
    entropy_bits?: number | null;
    zxcvbn_score?: number | null;
}

export interface import_history_item {
    type: history_type;
    masked: string;
    value?: string | null;
    length?: number;
    charset?: string;
    entropy_bits?: number | null;
    zxcvbn_score?: number | null;
    created_at?: string;
}

export interface history_repository {
    list(params: {uid?: number | null; type?: history_type | 'all'; limit: number; offset: number}): Promise<history_row[]>;
    create(entry: create_history_input): Promise<history_row>;
    import_batch(uid: number, items: import_history_item[]): Promise<number>;
    delete_one(id: number, uid?: number | null): Promise<void>;
    delete_all(uid?: number | null): Promise<void>;
    batch_update_values(uid: number, updates: {id: number; value: string}[]): Promise<number>;
}

// --- Users ---

export interface user_row {
    id: number;
    username?: string | null;
    email?: string | null;
    password_hash: string;
    totp_secret?: string | null;
    totp_pending_secret?: string | null;
    twofa_enabled: boolean;
    backup_codes: string[];
    is_admin: boolean;
    settings: Record<string, unknown>;
    e2e_salt?: string | null;
    oidc_sub?: string | null;
    oidc_issuer?: string | null;
    created_at?: string | null;
    last_login_at?: string | null;
    password_changed_at?: string | null;
}

export interface user_summary {
    id: number;
    username?: string | null;
    email?: string | null;
    created_at?: string | null;
    last_login_at?: string | null;
    twofa_enabled: boolean;
    is_admin: boolean;
    oidc_sub?: string | null;
}

export interface create_user_input {
    username?: string | null;
    email?: string | null;
    password_hash: string;
    oidc_sub?: string | null;
    oidc_issuer?: string | null;
}

export interface user_repository {
    find_by_id(id: number): Promise<user_row | null>;
    find_by_identifier(identifier: string): Promise<user_row | null>;
    find_by_oidc(issuer: string, sub: string): Promise<user_row | null>;
    create(data: create_user_input): Promise<user_row>;
    link_oidc(id: number, issuer: string, sub: string): Promise<void>;
    count(): Promise<number>;
    count_admins(): Promise<number>;
    update_profile(id: number, username: string | null, email: string | null): Promise<user_row | null>;
    update_password(id: number, password_hash: string): Promise<void>;
    /** Invalidate all active sessions for a user by bumping password_changed_at. Does not change password. */
    invalidate_sessions(id: number): Promise<void>;
    update_settings(id: number, settings: Record<string, unknown>): Promise<void>;
    get_settings(id: number): Promise<Record<string, unknown>>;
    update_totp_pending(id: number, secret: string | null): Promise<void>;
    enable_totp(id: number, secret: string, backup_codes_json: string): Promise<void>;
    disable_totp(id: number): Promise<void>;
    update_backup_codes(id: number, backup_codes_json: string): Promise<void>;
    update_last_login(id: number): Promise<void>;
    set_admin(id: number, value: boolean): Promise<void>;
    delete_with_data(id: number): Promise<void>;
    list_all(): Promise<user_summary[]>;
    get_password_changed_at(id: number): Promise<Date | null>;
    get_e2e_salt(id: number): Promise<string | null>;
    set_e2e_salt(id: number, salt: string): Promise<void>;
}

// --- Password Resets ---

export interface password_reset_repository {
    create_token(user_id: number, code: string, expires_at: Date): Promise<void>;
    find_valid(code: string): Promise<{user_id: number} | null>;
    delete_for_user(user_id: number): Promise<void>;
}

// --- Repository Bundle ---

export interface repositories {
    history: history_repository;
    users: user_repository;
    resets: password_reset_repository;
}
