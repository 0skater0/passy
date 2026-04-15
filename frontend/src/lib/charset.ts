/** Build a human-readable summary of the active charset (e.g. "A-Z, 0-9 excl. O0"). */
export function build_charset_summary(options: Record<string, unknown>): string {
    const parts: string[] = [];
    if (options.include_upper) parts.push('A-Z');
    if (options.include_lower) parts.push('a-z');
    if (options.include_digits) parts.push('0-9');
    if (options.include_symbols) parts.push('!@#…');
    if (options.include_extra_symbols) parts.push('extra');
    if (options.custom_include && typeof options.custom_include === 'string') {
        const chars = [...new Set([...options.custom_include])].join('');
        parts.push(`+${chars}`);
    }
    let summary = parts.join(', ');
    if (options.exclude && typeof options.exclude === 'string') {
        const chars = [...new Set([...options.exclude])].join('');
        summary += ` excl. ${chars}`;
    }
    return summary;
}
