import { updateSession } from '@/lib/supabase/proxy'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and public assets.
    // All other routes (pages, API) go through session refresh + route protection.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)',
  ],
}
