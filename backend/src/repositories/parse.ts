import type {history_row, user_row, user_summary} from './types.js';

export const USER_COLS = 'id, username, email, password_hash, totp_secret, totp_pending_secret, twofa_enabled, backup_codes, is_admin, settings, e2e_salt, oidc_sub, oidc_issuer, created_at, last_login_at, password_changed_at';

/** Normalize a timestamp value to an ISO-8601 string, regardless of backend type.
 *  Postgres returns `Date` objects; SQLite returns ISO-ish strings. Consumers type these
 *  columns as `string | null`, so we unify here. */
function to_iso_string(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return null;
}

export function parse_user_row(row: Record<string, unknown>): user_row {
    return {
        ...row,
        twofa_enabled: Boolean(row.twofa_enabled),
        is_admin: Boolean(row.is_admin),
        backup_codes: typeof row.backup_codes === 'string' ? JSON.parse(row.backup_codes) : (row.backup_codes ?? []),
        settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings ?? {}),
        created_at: to_iso_string(row.created_at),
        last_login_at: to_iso_string(row.last_login_at),
        password_changed_at: to_iso_string(row.password_changed_at),
    } as user_row;
}

export function parse_user_summary_row(row: Record<string, unknown>): user_summary {
    return {
        id: row.id as number,
        username: (row.username as string) ?? null,
        email: (row.email as string) ?? null,
        twofa_enabled: Boolean(row.twofa_enabled),
        is_admin: Boolean(row.is_admin),
        oidc_sub: (row.oidc_sub as string) ?? null,
        created_at: to_iso_string(row.created_at),
        last_login_at: to_iso_string(row.last_login_at),
    };
}

export function parse_history_row(row: Record<string, unknown>): history_row {
    return {
        ...row,
        created_at: to_iso_string(row.created_at),
    } as history_row;
}
