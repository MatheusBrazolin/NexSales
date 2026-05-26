/**
 * Build a display name from profile fields, falling back to the email's
 * local part (everything before "@") when no profile name is set.
 *
 * Used everywhere the UI shows "who" — header avatar, sales seller column,
 * admin user list, etc. Keeps a single source of truth so old users without
 * profiles still render reasonably.
 */
export function displayName(input: {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}): string {
  const first = input.firstName?.trim() ?? ''
  const last = input.lastName?.trim() ?? ''
  const full = `${first} ${last}`.trim()
  if (full) return full

  const email = input.email ?? ''
  const local = email.split('@')[0] ?? ''
  if (local) {
    // Turn "matheus.brazolin" into "Matheus Brazolin"
    return local
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

  return 'Usuário'
}

/**
 * Two-letter initials for avatar bubbles.
 */
export function initials(input: {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}): string {
  const first = input.firstName?.trim() ?? ''
  const last = input.lastName?.trim() ?? ''

  if (first && last) {
    return (first.charAt(0) + last.charAt(0)).toUpperCase()
  }
  if (first) {
    return first.slice(0, 2).toUpperCase()
  }

  const email = input.email ?? ''
  const local = email.split('@')[0] ?? ''
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
  }
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()

  return '??'
}
