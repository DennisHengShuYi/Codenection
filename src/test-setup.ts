import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library only registers its own cleanup when Vitest globals are enabled, and
// they are not here. Without this, every render stacks up in the same document and the
// second test in a file fails with "found multiple elements" -- a failure that looks
// like a bug in the component and is not.
afterEach(cleanup)
