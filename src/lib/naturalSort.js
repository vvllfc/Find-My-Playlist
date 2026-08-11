// Plain JS (like genreTaxonomy.js) so both the Vite app and the plain Node
// build script can import it unchanged.

// Playlist names mix words with version-ish numbers ("Boiler 8.0",
// "Boiler 12.0", "Futur Set 17"). Plain alphabetical order gets both halves
// wrong: it puts "12.0" before "8.0" (comparing "1" against "8" character by
// character) and digits before letters. Compare word by word instead —
// a word starting with a letter always sorts before one starting with a
// digit, and two numeric words compare by value.
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

function startsWithDigit(word) {
  return /^\d/.test(word);
}

export function compareNames(a, b) {
  const wordsA = a.trim().split(/\s+/);
  const wordsB = b.trim().split(/\s+/);
  const shared = Math.min(wordsA.length, wordsB.length);

  for (let i = 0; i < shared; i += 1) {
    const wordA = wordsA[i];
    const wordB = wordsB[i];
    if (wordA === wordB) continue;

    const numericA = startsWithDigit(wordA);
    const numericB = startsWithDigit(wordB);
    if (numericA !== numericB) return numericA ? 1 : -1;

    if (numericA && numericB) {
      const diff = parseFloat(wordA) - parseFloat(wordB);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    }

    const compared = collator.compare(wordA, wordB);
    if (compared !== 0) return compared;
  }

  // Same words up to the shorter one: the shorter name comes first
  // ("Boiler 8.0" before "Boiler 8.0 Before").
  return wordsA.length - wordsB.length;
}
