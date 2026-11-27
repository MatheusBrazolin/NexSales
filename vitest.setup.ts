// Extra `expect` matchers for DOM assertions (toBeInTheDocument, etc.).
import '@testing-library/jest-dom/vitest'

// Provide an in-memory IndexedDB so Dexie-backed code (offline cache + sales
// queue) runs in tests without a real browser.
import 'fake-indexeddb/auto'

// Unmount anything rendered by a test before the next one starts.
//
// Without this, a hook that attaches window listeners stays mounted after its
// test ends and keeps reacting to events dispatched by later tests — which is
// exactly how useLightPrint appeared to fail: a leftover instance from the
// previous test removed the `dark` class first, so the instance under test
// recorded "it was already light" and had nothing to restore.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())
