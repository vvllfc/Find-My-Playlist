// Plain JS (not .ts) so this module can be imported unchanged by both the
// Vite/React app and the plain Node build script (scripts/fetch-and-merge-playlists.mjs),
// which has no TypeScript loader.

// Source playlist names mix casing pretty freely (Chillfort/ChillFort/CHILLFORT,
// Rockvibe/RockVibe, Fr/FR...) and two different apostrophe characters
// (Wallaby's vs Wallaby’s). None of that is meaningful, so normalize before
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

// "No Voice" is an explicit negation and always wins, even when the name also
// carries a bare "Voice" earlier on ("...Rave Voice Melo Hard No Voice") —
// those are playlists whose voice marker was retracted, not confirmed.
function hasVoice(remainder, voiceToken) {
  const normalized = normalize(remainder);
  if (/no\s+voice/.test(normalized)) return false;
  return normalized.includes(normalize(voiceToken));
}

function applyRule(rule, remainder) {
  const tags = [];
  if (rule.genre) tags.push(rule.genre);

  const subcategory = rule.subgenreTokens ? findToken(remainder, rule.subgenreTokens) : null;
  if (subcategory) tags.push(subcategory);

  if (rule.tempoTokens) {
    const matched = findTokenMapped(remainder, rule.tempoTokens);
    if (matched) tags.push(matched);
  }

  if (rule.eraTokens) {
    const matched = findToken(remainder, rule.eraTokens);
    if (matched) tags.push(matched);
  }

  if (rule.voiceToken && hasVoice(remainder, rule.voiceToken)) tags.push('vocals');

  return { category: rule.genre ?? null, subcategory, tags };
}

// "Feel The X" is its own family of naming, not a single fixed vocabulary —
// distinct from the declarative single-prefix rules below. Everything named
// "Feel The ..." belongs to one "Feel" folder, with the genre word inside the
// name becoming the sub-folder. The shape is
// [nationality/language]? + genre-word + [intensity]? + [era]?.
// Nationality is deliberately never a folder of its own — it's flavour info
// (roughly lyrics language), not a genre.
const FEEL_THE_PREFIX = 'Feel The';
const FEEL_CATEGORY = 'Feel';

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
// sub-folder — everything else keeps its own literal genre name.
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
  latino: 'Latino',
  dubstep: 'Dubstep',
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

function classifyFeelThe(remainder) {
  const tags = [FEEL_CATEGORY];
  let rest = remainder;

  const nationality = stripPrefixWord(rest, NATIONALITIES);
  if (nationality) rest = nationality.rest;

  // Prefer a genre word at the start of what's left, but fall back to one
  // anywhere in the name ("Netherlands Vibe" — unknown nationality, real
  // genre word after it) rather than giving up on the sub-folder entirely.
  const genreWords = Object.keys(GENRE_WORDS).sort((a, b) => b.length - a.length);
  const genreMatch = stripPrefixWord(rest, genreWords) ?? (() => {
    const found = findToken(rest, genreWords);
    return found ? { matched: found, rest } : null;
  })();

  const subcategory = genreMatch ? GENRE_WORDS[normalize(genreMatch.matched)] : null;
  if (subcategory) tags.push(subcategory);
  if (nationality) tags.push(nationality.matched);

  const intensity = findTokenMapped(remainder, INTENSITY_TOKENS);
  if (intensity) tags.push(intensity);

  const era = findToken(remainder, ERA_TOKENS);
  if (era) tags.push(era);

  return { category: FEEL_CATEGORY, subcategory, tags };
}

// Returns { category, subcategory, tags }. `category` is the top-level folder
// on the public catalog and `subcategory` the folder inside it; both are null
// when nothing matched, which lands the playlist in "Non classées".
export function classifyPlaylistName(name, taxonomy) {
  if (matchesPrefix(name, FEEL_THE_PREFIX)) {
    return classifyFeelThe(name.slice(FEEL_THE_PREFIX.length).trim());
  }

  for (const rule of taxonomy) {
    if (!matchesPrefix(name, rule.match.value)) continue;
    return applyRule(rule, name.slice(rule.match.value.length).trim());
  }

  return { category: null, subcategory: null, tags: [] };
}

export function deriveTagsFromName(name, taxonomy) {
  return classifyPlaylistName(name, taxonomy).tags;
}
