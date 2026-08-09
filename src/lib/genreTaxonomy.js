// Plain JS (not .ts) so this module can be imported unchanged by both the
// Vite/React app and the plain Node build script (scripts/fetch-and-merge-playlists.mjs),
// which has no TypeScript loader.

function matchesPrefix(name, rule) {
  return name.startsWith(rule.match.value);
}

function findToken(remainder, tokens) {
  for (const token of tokens) {
    if (remainder.includes(token)) return token;
  }
  return null;
}

export function deriveTagsFromName(name, taxonomy) {
  for (const rule of taxonomy) {
    if (!matchesPrefix(name, rule)) continue;

    const remainder = name.slice(rule.match.value.length).trim();
    const tags = [];

    if (rule.genre) tags.push(rule.genre);
    if (rule.genreFromRemainder && remainder) tags.push(remainder);

    if (rule.tempoTokens) {
      const tokens = Object.keys(rule.tempoTokens).sort((a, b) => b.length - a.length);
      const matched = findToken(remainder, tokens);
      if (matched) tags.push(rule.tempoTokens[matched]);
    }

    if (rule.subgenreTokens) {
      const tokens = [...rule.subgenreTokens].sort((a, b) => b.length - a.length);
      const matched = findToken(remainder, tokens);
      if (matched) tags.push(matched);
    }

    if (rule.eraTokens) {
      const matched = findToken(remainder, rule.eraTokens);
      if (matched) tags.push(matched);
    }

    if (rule.voiceToken && remainder.includes(rule.voiceToken)) {
      tags.push('vocals');
    }

    return tags;
  }

  return [];
}
