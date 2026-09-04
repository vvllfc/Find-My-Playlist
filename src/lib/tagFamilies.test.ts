import { describe, expect, it } from 'vitest'
import { familiesFor, TAG_FAMILIES, UNSORTED_FAMILY, VOCALS_TAG } from './tagFamilies'

describe('familiesFor', () => {
  it('leaves the declared families exactly as written', () => {
    // Their order is the order the rails appear in, and the order inside each
    // is chronological or by intensity rather than alphabetical — "Before,
    // Middle, After" is the order a night actually happens in.
    const families = familiesFor(['chill'])
    for (const [index, family] of TAG_FAMILIES.entries()) {
      expect(families[index]).toEqual(family)
    }
  })

  it('collects what no family claims into a rail of its own', () => {
    const families = familiesFor(['chill', 'Zepo', 'Hood'])
    const unsorted = families.find((f) => f.name === UNSORTED_FAMILY)
    expect(unsorted?.tags).toEqual(['Hood', 'Zepo'])
  })

  it('adds no such rail when every tag is placed', () => {
    expect(familiesFor(['chill', 'French', 'After']).map((f) => f.name)).not.toContain(UNSORTED_FAMILY)
  })

  // It is asked as its own two-way question — "avec voix" / "sans voix" —
  // rather than as a tag, so it must never surface as one.
  it('never files the vocals marker anywhere', () => {
    expect(familiesFor([VOCALS_TAG]).map((f) => f.name)).not.toContain(UNSORTED_FAMILY)
    expect(TAG_FAMILIES.flatMap((f) => f.tags)).not.toContain(VOCALS_TAG)
  })

  it('does not repeat a tag across two families', () => {
    const all = TAG_FAMILIES.flatMap((family) => family.tags)
    expect(all).toHaveLength(new Set(all).size)
  })
})
