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

function compareWords(a, b) {
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

// Playlists that differ only by a trailing intensity word belong to one family,
// and there they read as a ladder from calmest to most energetic rather than
// alphabetically. Longer suffixes are checked first so "Much Higher" wins over
// the "Higher" inside it, and "ChillFort" over "Chill". Matched case-insensitively
// because the source names spell it both "Chillfort" and "ChillFort".
const INTENSITY_SUFFIXES = [
  ['Much Higher', 4],
  ['ChillFort', 0],
  ['Higher', 3],
  ['Chill', 1],
];
const NO_SUFFIX_RANK = 2;

function splitIntensity(name) {
  const trimmed = name.trim();
  for (const [suffix, rank] of INTENSITY_SUFFIXES) {
    const cut = trimmed.length - suffix.length;
    // Has to be a whole trailing word, not the tail end of a longer one.
    if (cut > 0 && /\s/.test(trimmed[cut - 1]) && trimmed.slice(cut).toLowerCase() === suffix.toLowerCase()) {
      return { base: trimmed.slice(0, cut).trim(), rank };
    }
  }
  return { base: trimmed, rank: NO_SUFFIX_RANK };
}

export function compareNames(a, b) {
  const left = splitIntensity(a);
  const right = splitIntensity(b);

  // Ordering the families themselves comes first, which also keeps anything
  // carrying some other suffix ("… Old School") after the whole ladder.
  const byBase = compareWords(left.base, right.base);
  if (byBase !== 0) return byBase;

  // The ladder only applies to names whose base is *exactly* the same, case
  // included — two spellings differing only in case are separate families.
  if (left.base === right.base && left.rank !== right.rank) {
    return left.rank - right.rank;
  }

  return compareWords(a, b);
}
