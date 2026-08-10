// Plain JS (not .ts) so this module can be imported unchanged by both the
// Vite/React app and the plain Node build script (scripts/fetch-and-merge-playlists.mjs),
// which has no TypeScript loader.

// Source playlist names mix casing pretty freely (Chillfort/ChillFort/CHILLFORT,
// Rockvibe/RockVibe, Fr/FR...) and two different apostrophe characters
// (Wallaby's vs Wallaby's). None of that is meaningful, so normalize before
// ever comparing — matching stays defensive against inconsistent naming
// instead of requiring everything to be renamed first.
function normalize(str) {
  return str.toLowerCase().replace(/[‘’]/g, "'");
}

function matchesPrefix(name, prefix) {
  return normalize(name).startsWith(normalize(prefix));
}

// Case-insensitive "does remainder contain token", trying longer/more
// specific tokens first so e.g. "ChillFort" wins over the "Chill" it
// contains, and "AfterVNR160+" wins over "AfterVNR".
function findToken(remainder, tokens) {
  const sorted = [...tokens].sort((a, b) => b.length - a.length);
  const normalizedRemainder = normalize(remainder);
  for (const token of sorted) {
    if (normalizedRemainder.includes(normalize(token))) return token;
  }
  return null;
}

function findTokenMapped(remainder, tokenMap) {
  const matched = findToken(remainder, Object.keys(tokenMap));
  return matched ? tokenMap[matched] : null;
}

function applyRule(rule, remainder) {
  const tags = [];

  if (rule.genre) tags.push(rule.genre);
  if (rule.genreFromRemainder && remainder) tags.push(remainder);

  if (rule.tempoTokens) {
    const matched = findTokenMapped(remainder, rule.tempoTokens);
    if (matched) tags.push(matched);
  }

  if (rule.subgenreTokens) {
    const matched = findToken(remainder, rule.subgenreTokens);
    if (matched) tags.push(matched);
  }

  if (rule.eraTokens) {
    const matched = findToken(remainder, rule.eraTokens);
    if (matched) tags.push(matched);
  }

  if (rule.voiceToken) {
    // "No Voice" is an explicit negation, not a match — strip it before
    // testing, since some names contain both ("...Voice Melo Hard No Voice").
    const withoutNegation = normalize(remainder).replace(/no\s+voice/g, '');
    if (withoutNegation.includes(normalize(rule.voiceToken))) {
      tags.push('vocals');
    }
  }

  return tags;
}

// "Feel The X" is its own family of naming, not a single fixed vocabulary —
// distinct from the declarative single-prefix rules below. The shape is
// [nationality/language]? + genre-word + [intensity]? + [era]?, in any
// spacing/order the family word and modifiers happen to appear. Nationality
// is deliberately kept secondary (never the folder/category), per how the
// playlists are actually organized — it's flavor info (~lyrics language),
// not a genre.
const FEEL_THE_PREFIX = 'Feel The';

const NATIONALITIES = [
  'French',
  'Spanish',
  'Italian',
  'German',
  'Russian',
  'Portuguese',
  'Swedish',
  'Arabic',
  'African',
];

// Longer/more specific words first so e.g. "Rockvibe" wins over the bare
// "Vibe" it contains. "Vibe"/"Rockvibe" both fold into the same "Rock"
// category — everything else keeps its own literal genre name.
const GENRE_WORDS = {
  rockvibe: 'Rock',
  hardrock: 'HardRock',
  vibe: 'Rock',
  metal: 'Metal',
  disco: 'Disco',
  punk: 'Punk',
  electro: 'Electro',
  piano: 'Piano',
  country: 'Country',
};

const INTENSITY_TOKENS = {
  'much higher': 'energetic+',
  chillfort: 'chill+',
  higher: 'energetic',
  chill: 'chill',
  // Confirmed synonyms for the same scale, from inconsistent naming that
  // predates a cleanup pass on the Spotify side.
  slowtempo: 'chill',
  'slow tempo': 'chill',
  slow: 'chill',
};

const ERA_TOKENS = ['Very Old S', 'Old S', 'Like Before', 'Now'];

function stripPrefixWord(remainder, words) {
  const normalizedRemainder = normalize(remainder);
  for (const word of words) {
    const normalizedWord = normalize(word);
    if (normalizedRemainder.startsWith(normalizedWord)) {
      return { matched: word, rest: remainder.slice(word.length).trim() };
    }
  }
  return null;
}

function deriveFeelTheXTags(remainder) {
  let rest = remainder;

  const nationality = stripPrefixWord(rest, NATIONALITIES);
  if (nationality) rest = nationality.rest;

  const genreWords = Object.keys(GENRE_WORDS).sort((a, b) => b.length - a.length);
  const genreMatch = stripPrefixWord(rest, genreWords);
  // Nationality/intensity/era are flavor info, never the category — if no
  // genre word was recognized, there's no genre to hang them off of, so
  // leave the whole name unrecognized (falls into "Non classées") instead
  // of promoting one of those secondary words to tags[0].
  if (!genreMatch) return [];
  rest = genreMatch.rest;

  const tags = [GENRE_WORDS[normalize(genreMatch.matched)]];
  if (nationality) tags.push(nationality.matched);

  const intensity = findTokenMapped(rest, INTENSITY_TOKENS);
  if (intensity) tags.push(intensity);

  const era = findToken(rest, ERA_TOKENS);
  if (era) tags.push(era);

  return tags;
}

export function deriveTagsFromName(name, taxonomy) {
  if (matchesPrefix(name, FEEL_THE_PREFIX)) {
    const remainder = name.slice(FEEL_THE_PREFIX.length).trim();
    return deriveFeelTheXTags(remainder);
  }

  for (const rule of taxonomy) {
    if (!matchesPrefix(name, rule.match.value)) continue;
    const remainder = name.slice(rule.match.value.length).trim();
    return applyRule(rule, remainder);
  }

  return [];
}
