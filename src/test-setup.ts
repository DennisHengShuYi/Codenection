// jsdom ships no IndexedDB at all, so the local repository has nothing to talk to
// without this. An in-memory implementation inside the test process, which is also what
// keeps these tests from touching anything that survives the run.
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Testing Library's one-second default is tuned for waiting on a render. Two of these
 * screens wait on a dynamic `import()` instead -- the planner and photo import both load
 * the parser on demand, to keep Zod out of the initial bundle -- and the first test to
 * reach that import also pays for Vite transforming the chunk.
 *
 * Alone that fits inside a second; in a full parallel run on a busy machine it does not,
 * and the result was a test that passed by itself and failed in the suite. Raised rather
 * than the assertions being weakened: the thing being waited for is genuinely slower than
 * a render, and a wait that is too short tests the machine rather than the code.
 */
configure({ asyncUtilTimeout: 5000 })

// Testing Library only registers its own cleanup when Vitest globals are enabled, and
// they are not here. Without this, every render stacks up in the same document and the
// second test in a file fails with "found multiple elements" -- a failure that looks
// like a bug in the component and is not.
afterEach(cleanup)
