'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Where to send a user right after authenticating, based on their role.
 * Admins go to the dashboard with full KPIs; employees go straight to the PDV.
 */
async function postLoginPath(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return '/login'

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  return roleRow?.role === 'admin' ? '/dashboard' : '/vendas/nova'
}

export async function signIn(email: string, password: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'Email ou senha inválidos.' }
  }

  revalidatePath('/', 'layout')
  redirect(await postLoginPath())
}

export async function signUp(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
) {
  const supabase = await createClient()

  // first_name / last_name go into raw_user_meta_data so the
  // `handle_new_user_profile` trigger picks them up and writes them
  // into public.profiles in the same transaction as the signup.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      },
    },
  })

  if (error) {
    const msg = error.message.toLowerCase()

    if (msg.includes('already registered') || msg.includes('already been registered')) {
      return { error: 'Este email já está cadastrado.' }
    }
    if (msg.includes('password') && (msg.includes('short') || msg.includes('weak'))) {
      return { error: 'Senha muito fraca. Use ao menos 6 caracteres.' }
    }
    if (msg.includes('rate limit')) {
      return { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }
    }
    if (msg.includes('signup') && msg.includes('disabled')) {
      return { error: 'Cadastros estão desabilitados no momento.' }
    }
    if (msg.includes('database error')) {
      // Costuma ser trigger no banco falhando ou tabela ausente.
      return {
        error:
          'Erro no banco ao criar conta. Verifique se a migration de roles foi aplicada (user_roles).',
      }
    }

    // Surface the real Supabase message so we can debug instead of guessing
    return { error: `Falha no cadastro: ${error.message}` }
  }

  // When email confirmation is ON in Supabase, signUp does NOT create a session.
  // We have to send the user to /login instead of /vendas/nova.
  if (!data.session) {
    return {
      error:
        'Conta criada! Verifique seu email para confirmar antes de fazer login. (Se não receber, peça ao admin para confirmar manualmente no painel.)',
    }
  }

  revalidatePath('/', 'layout')
  // Novos signups sao sempre 'employee' (trigger no banco), entao vao pro PDV.
  redirect('/vendas/nova')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
