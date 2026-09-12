// The number and string formatting every report prints through — one
// rule set, so two reports of the same value never differ. The rules are
// Rust's `{:.N}`, `{:+.N}` and `{:?}` (hence the names), kept so a report
// still compares against the recorded ones: `{:.N}` rounds the exact
// binary value with ties to even where `toFixed` rounds a tie up (an f32
// score can sit exactly on one — an odd multiple of 1/16 at three
// decimals), and a negative zero or a negative below the precision keeps
// its sign; `{:+.N}` prints the sign always; `{:?}` of a string escapes.

/** `{:.N}` of `x`: `digits` decimals, exact ties to even, `-0.000` for a negative zero. */
export function rustFixed(x: number, digits: number): string {
  if (!Number.isFinite(x)) return String(x);
  const neg = x < 0 || Object.is(x, -0);
  const abs = Math.abs(x);
  // The exact expansion: a double's fraction, at any magnitude a report
  // prints, fits in a hundred decimals.
  const [int = '0', frac = ''] = abs.toFixed(100).split('.');
  const kept = digits === 0 ? int : `${int}.${frac.slice(0, digits)}`;
  const tail = frac.slice(digits);
  const tie = tail.startsWith('5') && /^0*$/.test(tail.slice(1));
  // `toFixed` rounds to nearest, a tie up — right except for a tie on an even digit, which stays.
  const rounded = tie && Number(kept.at(-1)) % 2 === 0 ? kept : abs.toFixed(digits);
  return `${neg ? '-' : ''}${rounded}`;
}

/** `{:+.N}`: the sign always. */
export function signed(x: number, digits: number): string {
  const s = rustFixed(x, digits);
  return s.startsWith('-') ? s : `+${s}`;
}

/**
 * `{:?}` of a string: double-quoted, `"` and `\` backslash-escaped, the C
 * escapes for the common controls, `\u{…}` for the rest. Printable
 * non-ASCII (and `'`) is kept as is.
 */
export function rustDebugString(s: string): string {
  const escapes: Record<string, string> = {
    '"': '\\"',
    '\\': '\\\\',
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t',
    '\0': '\\0'
  };
  const body = [...s]
    .map((c) => {
      const e = escapes[c];
      if (e !== undefined) return e;
      const cp = c.codePointAt(0) ?? 0;
      return cp < 0x20 || cp === 0x7f ? `\\u{${cp.toString(16)}}` : c;
    })
    .join('');
  return `"${body}"`;
}
