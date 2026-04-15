// Password strength estimation via zxcvbn-ts.
// Wraps the library to provide a unified strength_result result with entropy bits.
import {zxcvbn, zxcvbnOptions} from '@zxcvbn-ts/core';
import * as lang_common from '@zxcvbn-ts/language-common';

// Start with common dictionary, lazy-load English words in background
zxcvbnOptions.setOptions({
    dictionary: lang_common.dictionary,
    graphs: lang_common.adjacencyGraphs
});

import('@zxcvbn-ts/language-en').then(lang_en => {
    zxcvbnOptions.setOptions({
        dictionary: {
            ...lang_common.dictionary,
            ...lang_en.dictionary,
        },
        graphs: lang_common.adjacencyGraphs,
        translations: lang_en.translations,
    });
}).catch(() => {});

export type strength_result = {
    score: number;
    guessesLog10: number;
    entropyBits: number;
};

/** Evaluate password strength using zxcvbn and derive entropy bits from guesses. */
export function get_strength(value: string): strength_result {
    if (!value) return {score: 0, guessesLog10: 0, entropyBits: 0};
    const res = zxcvbn(value);
    const guesses = res.guessesLog10 ?? Math.log10(res.guesses);
    const entropyBits = guesses * Math.log(10) / Math.log(2);
    return {score: res.score, guessesLog10: guesses, entropyBits};
}
