export type Rng = () => number

/**
 * mulberry32: a small, fast, well-distributed PRNG.
 *
 * The optimizer takes its randomness as a parameter rather than reaching for
 * `Math.random`, which is what lets §2.1's random-restart search be asserted in a test
 * without the test becoming flaky. A seeded run is reproducible; a production run passes
 * a seed derived from wherever the caller likes.
 */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
