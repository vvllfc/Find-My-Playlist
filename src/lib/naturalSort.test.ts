import { describe, expect, it } from 'vitest'
import { compareNames } from './naturalSort.js'

const sorted = (names: string[]) => [...names].sort(compareNames)

describe('compareNames', () => {
  it('orders version numbers by value, not character by character', () => {
    // The reported bug: "Boiler 12.0" sorted above "Boiler 4.0".
    expect(sorted(['Boiler 12.0', 'Boiler 8.0', 'Boiler 4.0'])).toEqual([
      'Boiler 4.0',
      'Boiler 8.0',
      'Boiler 12.0',
    ])
    expect(sorted(['Futur Set 28', 'Futur Set 17', 'Futur Set 25'])).toEqual([
      'Futur Set 17',
      'Futur Set 25',
      'Futur Set 28',
    ])
  })

  it('puts names starting with a letter before names starting with a digit', () => {
    expect(sorted(['Boiler 4.0', 'Boiler After', 'Boiler house'])).toEqual([
      'Boiler After',
      'Boiler house',
      'Boiler 4.0',
    ])
    expect(sorted(['Futur Set 17', 'Futur Set Indus After'])).toEqual([
      'Futur Set Indus After',
      'Futur Set 17',
    ])
    // Same rule at the very start of a name (A-Z before 0-9).
    expect(sorted(['01_04', 'Album', '21_23'])).toEqual(['Album', '01_04', '21_23'])
  })

  it('applies the letters-before-digits rule at whichever word differs', () => {
    expect(sorted(['Boiler rap 8.0', 'Boiler rap first part', 'Boiler rap'])).toEqual([
      'Boiler rap',
      'Boiler rap first part',
      'Boiler rap 8.0',
    ])
  })

  it('sorts a name before the same name with extra words', () => {
    expect(sorted(['Boiler 8.0 bis', 'Boiler 8.0', 'Boiler 8.0 Before'])).toEqual([
      'Boiler 8.0',
      'Boiler 8.0 Before',
      'Boiler 8.0 bis',
    ])
  })

  it('ignores case and sorts accents naturally', () => {
    expect(sorted(['techno Mélo', 'Techno Acide'])).toEqual(['Techno Acide', 'techno Mélo'])
  })
})
