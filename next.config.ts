import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  // O projeto não usa `next/image` em lugar nenhum. Sem isto, o Next arrasta
  // o `sharp` e os binários de plataforma do `@img` para dentro do build
  // standalone — 16 MB que vão parar no instalador do desktop sem servir
  // para nada. O instalador já tem 165 MB, baixado por lojas com internet
  // ruim; cada megabyte evitável conta.
  images: { unoptimized: true },
  outputFileTracingExcludes: {
    '*': ['node_modules/@img/**', 'node_modules/sharp/**'],
  },
  // Bake the public Supabase vars into every bundle (server, middleware, edge).
  // Without this, process.env.NEXT_PUBLIC_* is undefined in the standalone server
  // env because the Electron process doesn't inherit .env.local at runtime.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
  async headers() {
    return [
      {
        // The Service Worker script needs the correct content-type AND
        // must not be cached by the browser, otherwise new SW versions
        // won't propagate to clients between deploys.
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ]
  },
}

export default nextConfig
