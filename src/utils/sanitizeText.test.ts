import { describe, it, expect } from 'vitest'
import { clampText, sanitizeText, stripUnsafeText, textLength } from './sanitizeText'
import * as bandUtils from '../bandUtils'

describe('stripUnsafeText', () => {
  it('collapses whitespace runs, including tabs and newlines, into single spaces and trims', () => {
    expect(stripUnsafeText('  a \t\n b\r\n\r\nc  ')).toBe('a b c')
  })

  it.each([
    ['zero-width space', '\u200b'],
    ['zero-width non-joiner', '\u200c'],
    ['zero-width joiner', '\u200d'],
    ['left-to-right mark', '\u200e'],
    ['right-to-left mark', '\u200f'],
    ['left-to-right override', '\u202d'],
    ['right-to-left override', '\u202e'],
    ['pop directional formatting', '\u202c'],
    ['arabic letter mark', '\u061c'],
    ['word joiner', '\u2060'],
    ['invisible times', '\u2062'],
    ['bidi isolate', '\u2066'],
    ['pop directional isolate', '\u2069'],
    ['soft hyphen', '\u00ad'],
    ['hangul filler', '\u3164'],
    ['NUL control character', '\u0000'],
    ['DEL', '\u007f'],
    ['C1 control', '\u0085'],
  ])('removes the %s', (_name, ch) => {
    expect(stripUnsafeText(`a${ch}b`)).toBe('ab')
  })

  it('treats a byte order mark as whitespace, so it separates words and vanishes at the edges', () => {
    expect(stripUnsafeText('a\ufeffb')).toBe('a b')
    expect(stripUnsafeText('\ufeffab\ufeff')).toBe('ab')
  })

  it('removes a character that would otherwise leave doubled spaces behind', () => {
    expect(stripUnsafeText('a \u200b b')).toBe('a b')
  })

  it('keeps ordinary non-ASCII text, emoji and accents', () => {
    expect(stripUnsafeText('Café ♩=120 🎸')).toBe('Café ♩=120 🎸')
  })

  it('returns an empty string for input that is only invisible characters', () => {
    expect(stripUnsafeText('\u200b\u202e  \ufeff')).toBe('')
  })

  it('is idempotent', () => {
    const once = stripUnsafeText(' a \u200b \n b \u202e')
    expect(stripUnsafeText(once)).toBe(once)
  })
})

describe('textLength', () => {
  it('counts an emoji as one character, not two UTF-16 units', () => {
    expect('🎸'.length).toBe(2)
    expect(textLength('🎸')).toBe(1)
    expect(textLength('a🎸b')).toBe(3)
  })

  it('is 0 for the empty string', () => {
    expect(textLength('')).toBe(0)
  })
})

describe('clampText', () => {
  it('returns the text unchanged when it fits', () => {
    expect(clampText('abc', 3)).toBe('abc')
    expect(clampText('abc', 10)).toBe('abc')
  })

  it('cuts to the maximum number of characters', () => {
    expect(clampText('abcdef', 4)).toBe('abcd')
  })

  it('never splits a surrogate pair', () => {
    const text = '🎸🎸🎸'
    expect(clampText(text, 2)).toBe('🎸🎸')
    expect(clampText(text, 1)).toBe('🎸')
    expect(clampText(`a${text}`, 2)).toBe('a🎸')
  })

  it('returns an empty string for a maximum of 0', () => {
    expect(clampText('abc', 0)).toBe('')
  })
})

describe('sanitizeText', () => {
  it('strips unsafe characters and then clamps', () => {
    expect(sanitizeText('\u200bab\u202ecd', 3)).toBe('abc')
  })

  it('does not leave a trailing space when the clamp ends between two words', () => {
    expect(clampText('ab cd', 3)).toBe('ab ')
    expect(sanitizeText('ab cd', 3)).toBe('ab')
  })

  it('clamps by characters people see, not UTF-16 units', () => {
    expect(sanitizeText('🎸🎸🎸🎸', 3)).toBe('🎸🎸🎸')
  })

  it('does not count removed invisible characters against the limit', () => {
    expect(sanitizeText('\u200ba\u200bb\u200bc\u200b', 3)).toBe('abc')
  })

  it('returns an empty string for blank input', () => {
    expect(sanitizeText('  \n\t ', 10)).toBe('')
  })
})

describe('bandUtils re-exports', () => {
  it('exposes the very same functions from sanitizeText', () => {
    expect(bandUtils.stripUnsafeText).toBe(stripUnsafeText)
    expect(bandUtils.sanitizeText).toBe(sanitizeText)
    expect(bandUtils.textLength).toBe(textLength)
  })

  it('keeps the band-specific sanitisers working on top of them', () => {
    expect(bandUtils.sanitizeName('  The \u200bBand  ')).toBe('The Band')
    expect(bandUtils.sanitizeName('x'.repeat(80))).toHaveLength(50)
    expect(bandUtils.sanitizeDisplayName('y'.repeat(80))).toHaveLength(30)
  })
})
