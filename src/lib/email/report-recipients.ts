import { createServiceClient, isInternalEmail } from '@/lib/supabase/service'

/**
 * Parses a comma/semicolon-separated env value into a clean, deduped,
 * lowercased list of email addresses. Pure + exported for testing.
 */
export function parseRecipientList(value: string | undefined): string[] {
  if (!value) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of value.split(/[,;]/)) {
    const email = part.trim().toLowerCase()
    if (email && email.includes('@') && !seen.has(email)) {
      seen.add(email)
      out.push(email)
    }
  }
  return out
}

/**
 * Keeps only addresses that can actually receive mail: non-empty, real
 * (not the internal `@vendas-app.interno` usernames), deduped. Pure.
 */
export function pickDeliverableEmails(emails: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of emails) {
    const email = raw?.trim().toLowerCase()
    if (email && email.includes('@') && !isInternalEmail(email) && !seen.has(email)) {
      seen.add(email)
      out.push(email)
    }
  }
  return out
}

/**
 * Resolves who should receive the daily report:
 *   1. every admin whose account has a REAL email (internal usernames skipped)
 *   2. plus any address listed in REPORT_EMAIL (comma-separated)
 *
 * The REPORT_EMAIL override exists because admins created in-app log in by
 * username and have no real inbox — set it to the owner's real address to
 * guarantee delivery.
 */
export async function getReportRecipients(): Promise<string[]> {
  const service = createServiceClient()

  const { data: adminRoles, error: rolesError } = await service
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin')

  if (rolesError) throw new Error(rolesError.message)
  const adminIds = new Set((adminRoles ?? []).map((r) => r.user_id))

  // listUsers paginates (default 50); 1000 covers any realistic small shop.
  const { data: usersData, error: usersError } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (usersError) throw new Error(usersError.message)

  const adminEmails = (usersData?.users ?? [])
    .filter((u) => adminIds.has(u.id))
    .map((u) => u.email)

  const envEmails = parseRecipientList(process.env.REPORT_EMAIL)

  return pickDeliverableEmails([...adminEmails, ...envEmails])
}
