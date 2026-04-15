import crypto from 'crypto';

/** SHA-256 hash for non-password tokens (reset codes). Not for passwords — use bcrypt there. */
export function sha256(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
}
