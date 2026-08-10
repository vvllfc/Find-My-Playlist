// Combining diacritical marks (U+0300-U+036F), built from char codes rather
// than a literal regex range to avoid any editor/encoding mangling.
const COMBINING_MARKS = new RegExp(`[\\u0300-\\u036f]`, 'g')

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}