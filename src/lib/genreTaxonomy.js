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

// Drops `token` off the front of `text` when it's actually there — used to
// build the name shown inside a genre/sub-folder, where the folder's own
// words (genre, sub-genre, language, school…) would otherwise repeat on every
// single row. Only strips a *leading* match: a token found mid-name (the
// "genre word buried in the name" fallback some callers use) isn't safe to
// cut out without risking a mangled result, so it's left alone.
function stripLeadingToken(text, token) {
  if (!token) return text;
  if (!normalize(text).startsWith(normalize(token))) return text;
  return text.slice(token.length).trim();
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

  // `subgenre` is a fixed sub-folder for the whole rule (two naming families
  // sharing one genre, e.g. Boiler / Futur Set); `subgenreTokens` picks one
  // out of the name. A sub-folder repeating the genre name adds no tag.
  const subcategory = rule.subgenre ?? (rule.subgenreTokens ? findToken(remainder, rule.subgenreTokens) : null);
  if (subcategory && subcategory !== rule.genre) tags.push(subcategory);

  if (rule.tempoTokens) {
    const matched = findTokenMapped(remainder, rule.tempoTokens);
    if (matched) tags.push(matched);
  }

  if (rule.eraTokens) {
    const matched = findToken(remainder, rule.eraTokens);
    if (matched) tags.push(matched);
  }

  if (rule.voiceToken && hasVoice(remainder, rule.voiceToken)) tags.push('vocals');

  const displayRemainder = stripLeadingToken(remainder, subcategory);

  return { category: rule.genre ?? null, subcategory, subsubcategory: null, tags, displayRemainder };
}

// "Rap Game" is its own three-level family: language first (FR / ES, with EN
// as the default when no marker is found), then which "school" the playlist
// belongs to — only for the languages that actually name one. A vocabulary of
// extra tags is only settled for New School EN so far; the rest stay on the
// structural tags (genre, language, school) until that's worked out too.
const RAP_GAME_PREFIX = 'Rap Game';
const RAP_GAME_DEFAULT_LANGUAGE = 'EN';
const RAP_GAME_SCHOOLS = ['Old School', 'New School', 'New Gen'];
const RAP_GAME_NEW_SCHOOL_EN_TAGS = ['Zepo', 'Instru', 'Feel It', 'Grime', 'Hood', 'Party', 'Deep', 'Wake Up'];
const RAP_GAME_TEMPO_TOKENS = { 'much higher': 'energetic+', higher: 'energetic' };
const RAP_GAME_ERA_TOKENS = ['Now'];

function classifyRapGame(remainder) {
  const language = stripPrefixWord(remainder, ['Fr']) ?? stripPrefixWord(remainder, ['ES']);
  const rest = language ? language.rest : remainder;
  const languageTag = language ? (normalize(language.matched) === 'fr' ? 'FR' : 'ES') : RAP_GAME_DEFAULT_LANGUAGE;

  const school = findToken(rest, RAP_GAME_SCHOOLS);
  const displayRemainder = stripLeadingToken(rest, school);

  const tags = ['Rap Game', languageTag];
  if (school) tags.push(school);

  if (languageTag === 'EN' && school === 'New School') {
    for (const word of RAP_GAME_NEW_SCHOOL_EN_TAGS) {
      if (normalize(rest).includes(normalize(word))) tags.push(word);
    }
  }

  const tempo = findTokenMapped(remainder, RAP_GAME_TEMPO_TOKENS);
  if (tempo) tags.push(tempo);

  const era = findToken(remainder, RAP_GAME_ERA_TOKENS);
  if (era) tags.push(era);

  return { category: 'Rap Game', subcategory: languageTag, subsubcategory: school, tags, displayRemainder };
}

// "Feel The X" is its own family of naming, not a single fixed vocabulary —
// distinct from the declarative single-prefix rules below. Everything named
// "Feel The ..." belongs to one "Feel" folder, and the word inside the name
// decides the sub-folder. The shape is
// [language]? + genre-word + [intensity]? + [era]?.
const FEEL_THE_PREFIX = 'Feel The';
const VIBES_CATEGORY = 'Vibes';

// Genres that stand on their own rather than sitting inside Vibes, even though
// their playlists are named "Feel The …". Being named that way is a naming
// habit, not a reason to bury them a level down.
const PROMOTED_GENRES = ['Country', 'Disco', 'Hard Rock', 'Metal', 'Punk'];

const LANGUAGES = [
  'French',
  'Spanish',
  'Italian',
  'German',
  'Russian',
  'Portuguese',
  'Swedish',
  'Arabic',
  'African',
  'Netherlands',
];

// The "Vibe" family splits by language rather than by genre: a FrenchVibe and
// a French RockVibe belong together, and what separates them from a RussianVibe
// is the language, not the music. Anything Vibe with no language named is
// English by default.
const VIBE_WORDS = ['electrovibe', 'pianovibe', 'rockvibe', 'vibe'];
const DEFAULT_VIBE_LANGUAGE = 'English';

// Everything outside the Vibe family keeps its own literal genre as the
// sub-folder, with the language demoted to a tag ("French Punk" is Punk).
const GENRE_WORDS = {
  hardrock: 'Hard Rock',
  metal: 'Metal',
  disco: 'Disco',
  punk: 'Punk',
  electro: 'Electro',
  piano: 'Piano',
  country: 'Country',
  latino: 'Latino',
  dubstep: 'Dubstep',
};

// Longest first, so "Rockvibe" wins over the bare "Vibe" inside it and
// "ElectroVibe" is read as Electro rather than as a Vibe.
const FEEL_WORDS = [...VIBE_WORDS, ...Object.keys(GENRE_WORDS)].sort((a, b) => b.length - a.length);

function isVibeWord(word) {
  return VIBE_WORDS.includes(normalize(word));
}

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
  let rest = remainder;

  const language = stripPrefixWord(rest, LANGUAGES);
  if (language) rest = language.rest;

  // Prefer a genre word at the start of what's left, but fall back to one
  // anywhere in the name rather than giving up on the sub-folder entirely.
  const leadingMatch = stripPrefixWord(rest, FEEL_WORDS);
  const match = leadingMatch ?? (() => {
    const found = findToken(rest, FEEL_WORDS);
    return found ? { matched: found } : null;
  })();
  // Only a leading match tells us exactly what to cut for display — a match
  // found mid-name (the fallback above) has no safe position to strip from.
  if (leadingMatch) rest = leadingMatch.rest;

  const isVibe = Boolean(match) && isVibeWord(match.matched);
  let category = VIBES_CATEGORY;
  let subcategory = null;

  if (isVibe) {
    subcategory = `${language ? language.matched : DEFAULT_VIBE_LANGUAGE} Vibe`;
  } else if (match) {
    const genre = GENRE_WORDS[normalize(match.matched)] ?? null;
    // A promoted genre replaces the folder rather than nesting inside it.
    if (genre && PROMOTED_GENRES.includes(genre)) category = genre;
    else subcategory = genre;
  }

  const tags = [category];
  if (isVibe) {
    // The sub-folder is already "<Language> Vibe", so tagging the language on
    // its own says the same thing in fewer words — tagging both would put two
    // chips carrying one piece of information on every row.
    tags.push(language ? language.matched : DEFAULT_VIBE_LANGUAGE);
    // Only the ones actually named RockVibe are rock; a bare "Feel The Vibe"
    // makes no such claim.
    if (normalize(match.matched) === 'rockvibe') tags.push('Rock');
  } else {
    if (subcategory) tags.push(subcategory);
    if (language) tags.push(language.matched);
  }

  const intensity = findTokenMapped(remainder, INTENSITY_TOKENS);
  if (intensity) tags.push(intensity);

  const era = findToken(remainder, ERA_TOKENS);
  if (era) tags.push(era);

  return { category, subcategory, subsubcategory: null, tags, displayRemainder: rest };
}

// `displayRemainder` is whatever's left of the name once the genre/sub-folder
// words a classifier recognized are cut off the front — e.g. "Rap Game New
// School Feel It" inside Rap Game / EN / New School becomes "Feel It". When
// that leaves nothing at all (a playlist literally named "Rap Game New
// School"), the full original name is shown instead of a blank row.
function finalizeDisplayName(name, result) {
  const { displayRemainder, ...rest } = result;
  return { ...rest, displayName: (displayRemainder ?? '').trim() || name };
}

// Returns { category, subcategory, subsubcategory, tags, displayName }.
// `category` is the top-level folder on the public catalog, `subcategory` the
// folder inside it and `subsubcategory` a folder inside that (Rap Game only,
// for now); all three are null when nothing matched, which lands the
// playlist in "Non classées".
export function classifyPlaylistName(name, taxonomy) {
  if (matchesPrefix(name, FEEL_THE_PREFIX)) {
    return finalizeDisplayName(name, classifyFeelThe(name.slice(FEEL_THE_PREFIX.length).trim()));
  }

  if (matchesPrefix(name, RAP_GAME_PREFIX)) {
    return finalizeDisplayName(name, classifyRapGame(name.slice(RAP_GAME_PREFIX.length).trim()));
  }

  for (const rule of taxonomy) {
    if (!matchesPrefix(name, rule.match.value)) continue;
    return finalizeDisplayName(name, applyRule(rule, name.slice(rule.match.value.length).trim()));
  }

  return { category: null, subcategory: null, subsubcategory: null, tags: [], displayName: name };
}

export function deriveTagsFromName(name, taxonomy) {
  return classifyPlaylistName(name, taxonomy).tags;
}
