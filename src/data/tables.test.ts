import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * A table that is written and never read.
 *
 * `block_answers` was exactly this for the whole of its existence: one `.upsert(` in
 * `api/telegram.ts` and no reader anywhere, so a student answering on their phone taught the
 * app nothing and nothing failed.
 *
 * Heuristic, and deliberately narrow: it classifies by the method chained after `from(`
 * within a short window, so a read split across several statements would be missed. It is
 * worth having anyway -- it catches the shape the mistake actually took, which is a table
 * whose only mention in the codebase is a write.
 *
 * `from(...)` is resolved either as a string literal or as a same-file `const NAME =
 * '<table>'` -- `supabaseRepository.ts` names its tables that way (`BLOCK_LOG_TABLE`,
 * `TABLE`) rather than repeating the literal at every call site, and a guard that only
 * understood literals would misreport that real, working reader as a second orphan.
 */
const WRITES = /\.(upsert|insert|update|delete)\(/
const READS = /\.(select|maybeSingle|single)\(/
const FROM_CALL = /from\((?:'([a-z_]+)'|(\w+))\)/g
const TABLE_CONST = /^\s*const (\w+)\s*=\s*'([a-z_]+)'/gm

describe('every table that is written is also read', () => {
  it('finds no write-only tables', () => {
    const sources = globSync('{src,api}/**/*.ts').filter((path) => !path.includes('.test.'))

    const reads = new Set<string>()
    const writes = new Set<string>()

    for (const path of sources) {
      const text = readFileSync(path, 'utf8')

      const constants = new Map<string, string>()
      for (const match of text.matchAll(TABLE_CONST)) {
        constants.set(match[1]!, match[2]!)
      }

      for (const match of text.matchAll(FROM_CALL)) {
        const table = match[1] ?? constants.get(match[2]!)
        if (!table) continue

        const window = text.slice(match.index, match.index + 300)

        if (READS.test(window)) reads.add(table)
        if (WRITES.test(window)) writes.add(table)
      }
    }

    expect([...writes].filter((table) => !reads.has(table))).toEqual([])
  })
})
