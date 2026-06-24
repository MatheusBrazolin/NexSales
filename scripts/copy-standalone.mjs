import { cp } from 'node:fs/promises'

await cp('.next/static', '.next/standalone/.next/static', { recursive: true })
await cp('public', '.next/standalone/public', { recursive: true })

// better-sqlite3 is compiled for system Node.js (the process that runs server.js).
// next build copies it from node_modules/ but we do it again explicitly here to
// ensure the version rebuilt by `npm rebuild better-sqlite3` is used, not the one
// that electron-builder's @electron/rebuild may have replaced (Electron ABI ≠ system ABI).
await cp(
  'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  '.next/standalone/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  { force: true },
)

console.log('standalone assets copied')
