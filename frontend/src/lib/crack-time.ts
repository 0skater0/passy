// Convert guesses (log10) to estimated seconds to crack for one or more profiles

export type attack_profile = {
    id: string;
    label: string;
    rateMin: number; // guesses per second
    rateMax: number; // guesses per second
};

export type crack_estimate = attack_profile & {
    secondsMin: number; // avg-case seconds (search_space/2/rateMax)
    secondsMax: number; // avg-case seconds (search_space/2/rateMin)
};

// Rates based on hashcat benchmarks for a single RTX 4090 (Feb 2025).
// Sources: Chick3nman hashcat v6.2.6 gist, diGiCTF benchmark repo.
export const ATTACK_PROFILES: attack_profile[] = [
    {id: 'online_strict', label: 'Online (strict)', rateMin: 50, rateMax: 50},
    {id: 'online_weak', label: 'Online (weak API)', rateMin: 1_000, rateMax: 10_000},
    {id: 'offline_gpu_single', label: 'Offline (fast, 1×GPU)', rateMin: 1e11, rateMax: 1e12},
    {id: 'offline_gpu_multi', label: 'Offline (fast, multi-GPU)', rateMin: 1e13, rateMax: 1e14},
    {id: 'sha2', label: 'SHA-256/SHA-512', rateMin: 1e9, rateMax: 1e10},
    // bcrypt cost 10: ~5.7k H/s, cost 14: ~360 H/s (RTX 4090)
    {id: 'bcrypt', label: 'bcrypt (cost 10–14)', rateMin: 1e3, rateMax: 1e4},
    {id: 'scrypt', label: 'scrypt (N=2^14,r=8,p=1)', rateMin: 1e3, rateMax: 1e4},
    {id: 'argon2id', label: 'Argon2id (t=3,m=64–256MiB)', rateMin: 1e2, rateMax: 1e3},
    // PBKDF2 at 100k iterations: ~89k H/s on RTX 4090 (raw SHA-256 / iterations)
    {id: 'pbkdf2', label: 'PBKDF2 (100k, SHA-256)', rateMin: 1e4, rateMax: 1e5},
    // El Capitan (LLNL) conservative hash rate ~1e17 /s
    {id: 'supercomputer', label: 'Supercomputer (El Capitan)', rateMin: 1e17, rateMax: 1e17},
];

/**
 * Estimate seconds to crack for the provided guesses (as log10) across attack profiles.
 * Average-case time ~= (search space / 2) / rate.
 */
export function estimate_crack_profiles(guessesLog10: number, entropyBitsFallback?: number): crack_estimate[] {
    const zxcvbn_guesses = (isFinite(guessesLog10) && guessesLog10 > 0) ? Math.pow(10, guessesLog10) : 0;
    const entropy_guesses = (entropyBitsFallback && entropyBitsFallback > 0) ? Math.pow(2, entropyBitsFallback) : 0;
    // Use the higher estimate: zxcvbn underestimates randomly generated passwords
    const guesses = Math.max(zxcvbn_guesses, entropy_guesses);
    if (guesses <= 0) return ATTACK_PROFILES.map(p => ({...p, secondsMin: 0, secondsMax: 0}));

    const searchAvg = guesses / 2;
    return ATTACK_PROFILES.map(p => {
        const secondsMin = searchAvg / p.rateMax; // fastest attacker => lower bound
        const secondsMax = searchAvg / p.rateMin; // slowest attacker => upper bound
        return {...p, secondsMin, secondsMax};
    });
}

/** Estimate seconds to crack for a single custom hashrate (guesses/s). */
export function estimate_crack_custom(guessesLog10: number, rate: number, entropyBitsFallback?: number): crack_estimate {
    const zxcvbn_guesses = (isFinite(guessesLog10) && guessesLog10 > 0) ? Math.pow(10, guessesLog10) : 0;
    const entropy_guesses = (entropyBitsFallback && entropyBitsFallback > 0) ? Math.pow(2, entropyBitsFallback) : 0;
    const guesses = Math.max(zxcvbn_guesses, entropy_guesses);
    const searchAvg = guesses / 2;
    const seconds = rate > 0 ? searchAvg / rate : 0;
    return {id: 'custom', label: 'Custom', rateMin: rate, rateMax: rate, secondsMin: seconds, secondsMax: seconds};
}

/** Convert a number to its full decimal string representation without scientific notation. */
export function to_non_exponential(n: number): string {
    if (!isFinite(n)) return 'Infinity';
    const rounded = Math.round(n);
    const s = String(rounded);
    if (!/e/i.test(s)) return s;
    // Expand strings like 1e+21 or 3.45e+10 into full digits
    const data = rounded.toExponential().split('e');
    const mant = data[0].replace('.', '');
    const exp = parseInt(data[1], 10);
    if (exp >= 0) {
        return mant + '0'.repeat(Math.max(0, exp - (data[0].includes('.') ? (data[0].length - data[0].indexOf('.') - 1) : 0)));
    }
    // negative exponents become decimals; here we round to 0 digits
    return '0';
}

