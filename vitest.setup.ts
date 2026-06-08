// Extra `expect` matchers for DOM assertions (toBeInTheDocument, etc.).
import '@testing-library/jest-dom/vitest'

// Provide an in-memory IndexedDB so Dexie-backed code (offline cache + sales
// queue) runs in tests without a real browser.
import 'fake-indexeddb/auto'
