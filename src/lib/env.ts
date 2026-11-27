import 'server-only'
import { z } from 'zod'

/**
 * Validated server environment.
 *
 * The app reads 18 environment variables and used to assert most of them with
 * `process.env.X!`. The failure mode of that is the worst kind: a missing
 * OFFLINE_SESSION_SECRET does not crash at boot, it crashes the first time a
 * cashier tries to log in offline, with a stack trace nobody on the shop
 * floor can act on.
 *
 * This module fails loudly at startup instead, naming exactly which variable
 * is missing and what it is for.
 *
 * Deliberately split in two:
 *
 *  - `env` holds what the app cannot run without, and is validated eagerly.
 *  - `optionalEnv()` holds what degrades gracefully (no SMTP → no e-mail
 *    report; no Cosmos token → barcode lookup falls back to Open Food Facts).
 *    Those must NOT be required, or a shop that does not use e-mail reports
 *    could not start the app at all.
 */

const requiredSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url('NEXT_PUBLIC_SUPABASE_URL precisa ser uma URL completa (https://xxxx.supabase.co).'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY está vazia — copie a chave anon do painel do Supabase.'),
})

const optionalSchema = z.object({
  /** Signs the offline session cookie. Insecure fallback in dev only. */
  OFFLINE_SESSION_SECRET: z.string().min(32).optional(),
  /** Server-side only. Must never reach the browser bundle. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  /** Protects /api/cron/daily-cash-close. */
  CRON_SECRET: z.string().min(1).optional(),
  COSMOS_API_TOKEN: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  REPORT_EMAIL: z.string().optional(),
  NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL: z.string().url().optional(),
})

export type RequiredEnv = z.infer<typeof requiredSchema>

/**
 * `process.env` structurally, without NodeJS.ProcessEnv's required NODE_ENV —
 * so callers (and tests) can pass a small object with just what matters.
 */
export type EnvSource = Record<string, string | undefined>
export type OptionalEnv = z.infer<typeof optionalSchema>

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
    .join('\n')
}

/**
 * Parses the required variables, throwing a message meant for whoever is
 * deploying rather than for a stack trace reader.
 */
export function parseRequiredEnv(source: EnvSource = process.env): RequiredEnv {
  const result = requiredSchema.safeParse(source)

  if (!result.success) {
    throw new Error(
      'Configuração inválida — o NexSales não pode iniciar:\n' +
        formatIssues(result.error) +
        '\n\nConsulte .env.example para o conjunto completo de variáveis.',
    )
  }

  return result.data
}

/** Parses the optional variables, ignoring the ones that are absent. */
export function parseOptionalEnv(source: EnvSource = process.env): OptionalEnv {
  const result = optionalSchema.safeParse(source)
  if (!result.success) {
    throw new Error(
      'Configuração opcional inválida:\n' + formatIssues(result.error),
    )
  }
  return result.data
}

/**
 * True when the SMTP side is configured well enough to actually send the
 * daily report. Callers use it to skip the job with a clear log line instead
 * of failing halfway through.
 */
export function hasSmtpConfig(source: EnvSource = process.env): boolean {
  return Boolean(source.SMTP_HOST && source.SMTP_USER && source.SMTP_PASS)
}

/**
 * The offline-login cookie secret. In production its absence is fatal: without
 * it the cookie would be signed with a known value, and anyone could forge an
 * offline session.
 */
export function requireOfflineSecret(source: EnvSource = process.env): string {
  const secret = source.OFFLINE_SESSION_SECRET

  if (!secret || secret.length < 32) {
    if (source.NODE_ENV === 'production') {
      throw new Error(
        'OFFLINE_SESSION_SECRET ausente ou curta demais (mínimo 32 caracteres). ' +
          'Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      )
    }
    return 'dev-insecure-offline-secret-do-not-use-in-production'
  }

  return secret
}
