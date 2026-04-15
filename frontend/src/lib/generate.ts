// Core password/secret generators using Web Crypto API for CSPRNG.
// Each generator produces a string value from a mode-specific charset or word list.
import {clamp, get_effective_bounds} from './limits';
import type {generator_type} from './types';

export type password_options = {
    length: number;
    length_min?: number;
    length_max?: number;
    include_upper: boolean;
    include_lower: boolean;
    include_digits: boolean;
    include_symbols: boolean;
    include_extra_symbols: boolean;
    custom_include: string;
    exclude: string;
    charset_summary?: string;
    entropyBitsFallback?: number;
    check_pwned?: boolean;
};

export type passphrase_options = {
    word_count: number;
    separator: string;
    case_style: 'lower' | 'upper' | 'title';
    custom_word_list?: string;
};

export type pin_options = { length: number };
export type pronounceable_options = { length: number };
export type totp_options = { length: number };

export type uuid_options = {
    version?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    format?: 'ulid' | 'nanoid';
    nanoid_length?: number
};
export type special_type = 'jwt' | 'hmac' | 'aes' | 'fernet' | 'api_token' | 'rsa' | 'ecdsa' | 'ed25519' | 'sha_hash';
export type special_format = 'hex' | 'base64' | 'base32' | 'alphanumeric';

export type special_options = {
    special_type: special_type;
    bits: number;
    format: special_format;
    byte_length: number;
    curve: 'P-256' | 'P-384';
    sha_algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512';
    sha_input: string;
};

export type mode_options =
    password_options
    | passphrase_options
    | pin_options
    | pronounceable_options
    | uuid_options
    | totp_options
    | special_options;

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS = "!@#$%^&*()-_=+[]{};:'\",.<>/?|\\";
const EXTRA_SYMBOLS = '`~€£¥•–—±§¶©®™✓✔✕✖♠♥♦♣♤♡◇♧¿¡•◦◻◼◾◽';

// Very small bundled word list for demo purposes
const WORDS = [
    'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet',
    'kilo', 'lima', 'mike', 'november', 'oscar', 'papa', 'quebec', 'romeo', 'sierra', 'tango',
    'uniform', 'victor', 'whiskey', 'xray', 'yankee', 'zulu', 'wolf', 'river', 'cloud', 'stone',
    'ember', 'forest', 'silver', 'crimson', 'azure', 'amber', 'shadow', 'spark', 'thunder', 'fable'
];

/** Fill a Uint32Array with cryptographically random values. */
function get_crypto_values(count: number): Uint32Array {
    const arr = new Uint32Array(count);
    crypto.getRandomValues(arr);
    return arr;
}

/** Assemble and deduplicate the charset from toggled groups, custom include, and exclude. */
export function build_charset(opts: password_options): string {
    let chars: string[] = [];
    if (opts.include_upper) chars.push(...UPPER);
    if (opts.include_lower) chars.push(...LOWER);
    if (opts.include_digits) chars.push(...DIGITS);
    if (opts.include_symbols) chars.push(...SYMBOLS);
    if (opts.include_extra_symbols) chars.push(...EXTRA_SYMBOLS);
    if (opts.custom_include) chars.push(...opts.custom_include);
    if (opts.exclude) {
        const excluded = new Set([...opts.exclude]);
        chars = chars.filter(c => !excluded.has(c));
    }
    return Array.from(new Set(chars)).join('');
}

/** Uniformly pick a random index in [0, max) using rejection sampling to avoid modulo bias. */
function uniform_random_index(max: number): number {
    const limit = 2 ** 32 - (2 ** 32 % max);
    for (;;) {
        const [value] = get_crypto_values(1);
        if (value < limit) return value % max;
    }
}

/** Pick n random characters from the charset using CSPRNG. Unicode-safe via spread. */
function pick_random(chars: string, n: number): string {
    const arr = [...chars];
    if (arr.length === 0) return '';
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
        out.push(arr[uniform_random_index(arr.length)]);
    }
    return out.join('');
}

function title_case(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function generate_password(opts: password_options): string {
    const charset = build_charset(opts);
    let effective_length = opts.length;
    if (typeof opts.length_min === 'number' && typeof opts.length_max === 'number') {
        const min = Math.max(1, Math.floor(opts.length_min));
        const max = Math.max(min, Math.floor(opts.length_max));
        const range = max - min + 1;
        effective_length = min + uniform_random_index(range);
    }
    const final_length = clamp(effective_length, get_effective_bounds('password'));
    return pick_random(charset, final_length);
}

/** Parse a custom word list string (one word per line or comma-separated) into an array. */
function parse_word_list(raw: string): string[] {
    return raw
        .split(/[\n,]/)
        .map(w => w.trim())
        .filter(w => w.length > 0);
}

function generate_passphrase(opts: passphrase_options): string {
    const count = clamp(opts.word_count, get_effective_bounds('passphrase_words'));
    const pool = (opts.custom_word_list && opts.custom_word_list.trim())
        ? parse_word_list(opts.custom_word_list)
        : WORDS;
    if (pool.length === 0) return '';
    const words: string[] = [];
    for (let i = 0; i < count; i++) {
        let w = pool[uniform_random_index(pool.length)];
        if (opts.case_style === 'upper') w = w.toUpperCase();
        if (opts.case_style === 'title') w = title_case(w);
        words.push(w);
    }
    return words.join(opts.separator || '-');
}

function generate_pin(opts: pin_options): string {
    return pick_random(DIGITS, clamp(opts.length, get_effective_bounds('pin')));
}

function generate_uuid_v4(): string {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant 10
    const hex = [...b].map(x => x.toString(16).padStart(2, '0'));
    return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
}

function generate_ulid(): string {
    const crockford = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const time = Date.now();
    const timeChars: string[] = [];
    let t = time;
    for (let i = 0; i < 10; i++) {
        timeChars.unshift(crockford[t % 32]);
        t = Math.floor(t / 32);
    }
    const randChars: string[] = [];
    for (let i = 0; i < 16; i++) randChars.push(crockford[uniform_random_index(32)]);
    return timeChars.join('') + randChars.join('');
}

function generate_nanoid(len = 21): string {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';
    return pick_random(alphabet, len);
}

function generate_pronounceable(opts: pronounceable_options): string {
    const consonants = 'bcdfghjklmnpqrstvwxyz';
    const vowels = 'aeiou';
    const len = clamp(opts.length, get_effective_bounds('pronounceable'));
    let out = '';
    for (let i = 0; i < len; i++) {
        const pool = i % 2 === 0 ? consonants : vowels;
        out += pool[uniform_random_index(pool.length)];
    }
    return out;
}

/** Generate a Base32-encoded TOTP secret (RFC 4648, no padding). */
function generate_totp_secret(opts: totp_options): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const len = clamp(opts.length, {min: 16, max: 64});
    return pick_random(alphabet, len);
}

// --- Special generators ---

/** Convert Uint8Array to hex string. */
function bytes_to_hex(bytes: Uint8Array): string {
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Convert Uint8Array to standard Base64 string. */
function bytes_to_base64(bytes: Uint8Array): string {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

/** Convert Uint8Array to Base32 string (RFC 4648). */
function bytes_to_base32(bytes: Uint8Array): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0, value = 0, result = '';
    for (const b of bytes) {
        value = (value << 8) | b;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            result += alphabet[(value >>> bits) & 0x1f];
        }
    }
    if (bits > 0) result += alphabet[(value << (5 - bits)) & 0x1f];
    return result;
}

/** Convert Uint8Array to URL-safe Base64 string (no padding). */
function bytes_to_base64url(bytes: Uint8Array): string {
    return bytes_to_base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generate_random_bytes(count: number): Uint8Array {
    const arr = new Uint8Array(count);
    crypto.getRandomValues(arr);
    return arr;
}

function generate_jwt_secret(bits: number): string {
    const bytes = generate_random_bytes(bits / 8);
    return bytes_to_base64(bytes);
}

function generate_hmac_key(bits: number): string {
    const bytes = generate_random_bytes(bits / 8);
    return bytes_to_hex(bytes);
}

function generate_aes_key(bits: number): string {
    const bytes = generate_random_bytes(bits / 8);
    return bytes_to_base64(bytes);
}

function generate_fernet_key(): string {
    const bytes = generate_random_bytes(32);
    // Fernet uses URL-safe Base64 WITH padding (44 chars for 32 bytes)
    return bytes_to_base64(bytes).replace(/\+/g, '-').replace(/\//g, '_');
}

function generate_api_token(length: number, format: special_format): string {
    if (format === 'hex') return bytes_to_hex(generate_random_bytes(length));
    if (format === 'base64') return bytes_to_base64(generate_random_bytes(length));
    if (format === 'base32') return bytes_to_base32(generate_random_bytes(length));
    return pick_random(ALPHANUMERIC, length);
}

/** Convert DER-encoded key bytes to PEM format. */
function der_to_pem(der: ArrayBuffer, label: string): string {
    const bytes = new Uint8Array(der);
    const b64 = bytes_to_base64(bytes);
    const lines: string[] = [];
    for (let i = 0; i < b64.length; i += 64) {
        lines.push(b64.slice(i, i + 64));
    }
    return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

async function generate_rsa_key(bits: number): Promise<string> {
    const key_pair = await crypto.subtle.generateKey(
        {name: 'RSASSA-PKCS1-v1_5', modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'},
        true, ['sign', 'verify']
    );
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', key_pair.privateKey);
    return der_to_pem(pkcs8, 'PRIVATE KEY');
}

async function generate_ecdsa_key(curve: 'P-256' | 'P-384'): Promise<string> {
    const key_pair = await crypto.subtle.generateKey(
        {name: 'ECDSA', namedCurve: curve},
        true, ['sign', 'verify']
    );
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', key_pair.privateKey);
    return der_to_pem(pkcs8, 'PRIVATE KEY');
}

// Ed25519 not yet in all TypeScript lib.dom.d.ts definitions
async function generate_ed25519_key(): Promise<string> {
    const key_pair = await crypto.subtle.generateKey(
        {name: 'Ed25519'},
        true, ['sign', 'verify']
    );
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', (key_pair as CryptoKeyPair).privateKey);
    return der_to_pem(pkcs8, 'PRIVATE KEY');
}

async function generate_sha_hash(input: string, algorithm: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest(algorithm, data);
    return bytes_to_hex(new Uint8Array(hash));
}

/** Generate a special secret/token. May return a Promise for async generators. */
export function generate_special(opts: special_options): string | Promise<string> {
    switch (opts.special_type) {
        case 'jwt': return generate_jwt_secret(opts.bits);
        case 'hmac': return generate_hmac_key(opts.bits);
        case 'aes': return generate_aes_key(opts.bits);
        case 'fernet': return generate_fernet_key();
        case 'api_token': return generate_api_token(opts.byte_length, opts.format);
        case 'rsa': return generate_rsa_key(opts.bits);
        case 'ecdsa': return generate_ecdsa_key(opts.curve);
        case 'ed25519': return generate_ed25519_key();
        case 'sha_hash': return generate_sha_hash(opts.sha_input || '', opts.sha_algorithm);
        default: return '';
    }
}

/** Dispatch generation to the appropriate mode-specific generator. */
export function generate_value(mode: generator_type, options: mode_options): string | Promise<string> {
    switch (mode) {
        case 'password':
            return generate_password(options as password_options);
        case 'passphrase':
            return generate_passphrase(options as passphrase_options);
        case 'pin':
            return generate_pin(options as pin_options);
        case 'uuid': {
            const u = options as uuid_options;
            if (u.format === 'ulid') return generate_ulid();
            if (u.format === 'nanoid') return generate_nanoid(u.nanoid_length || 21);
            return generate_uuid_v4();
        }
        case 'pronounceable':
            return generate_pronounceable(options as pronounceable_options);
        case 'totp':
            return generate_totp_secret(options as totp_options);
        case 'special':
            return generate_special(options as special_options);
        default:
            return '';
    }
}

/** Return sensible default options for the given generator mode. */
export function default_options(mode: generator_type): mode_options {
    if (mode === 'password') {
        return {
            length: 16, include_upper: true, include_lower: true, include_digits: true,
            include_symbols: true, include_extra_symbols: false, custom_include: '', exclude: '',
            entropyBitsFallback: 0, check_pwned: false
        } as password_options;
    }
    if (mode === 'passphrase') {
        return {word_count: 4, separator: '-', case_style: 'lower', custom_word_list: ''} as passphrase_options;
    }
    if (mode === 'pin') {
        return {length: 6} as pin_options;
    }
    if (mode === 'totp') {
        return {length: 32} as totp_options;
    }
    if (mode === 'uuid') {
        return {version: 4} as uuid_options;
    }
    if (mode === 'pronounceable') {
        return {length: 12} as pronounceable_options;
    }
    if (mode === 'special') {
        return {
            special_type: 'jwt', bits: 256, format: 'hex',
            byte_length: 32, curve: 'P-256',
            sha_algorithm: 'SHA-256', sha_input: ''
        } as special_options;
    }
    return {
        length: 16, include_upper: true, include_lower: true, include_digits: true,
        include_symbols: true, include_extra_symbols: false, custom_include: '', exclude: '',
        entropyBitsFallback: 0, check_pwned: false
    } as password_options;
}
