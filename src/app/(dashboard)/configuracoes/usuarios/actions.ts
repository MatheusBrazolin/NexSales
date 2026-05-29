'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient, usernameToEmail } from '@/lib/supabase/service'
import { getCurrentUser, isAdmin } from '@/lib/auth/roles'
import { createEmployeeSchema } from '@/lib/validations/auth.schema'
import type { UserRole } from '@/types/database'

export interface SetRoleResult {
  success: boolean
  error?: string
}

/**
 * Promote a user to admin or demote them back to employee.
 *
 * Authorization is enforced both here (fast fail) and again inside the
 * `admin_set_role` Postgres function (defense in depth — RPC won't run
 * without `is_admin()` returning true).
 */
export async function setUserRole(
  userId: string,
  role: UserRole,
): Promise<SetRoleResult> {
  if (!(await isAdmin())) {
    return { success: false, error: 'Apenas administradores podem alterar papéis.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_role', {
    p_user_id: userId,
    p_role: role,
  })

  if (error) {
    if (error.message.includes('cannot_demote_self')) {
      return {
        success: false,
        error: 'Você não pode remover o próprio acesso de administrador.',
      }
    }
    return { success: false, error: error.message }
  }

  revalidatePath('/configuracoes/usuarios')
  return { success: true }
}

export async function createEmployee(formData: {
  firstName: string
  lastName: string
  username: string
  password: string
}): Promise<{ success?: boolean; error?: string }> {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem criar funcionários.' }
  }

  const parsed = createEmployeeSchema.safeParse(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { firstName, lastName, username, password } = parsed.data
  const email = usernameToEmail(username)

  const service = createServiceClient()

  const { error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  })

  if (error) {
    if (
      error.message.toLowerCase().includes('already registered') ||
      error.message.toLowerCase().includes('already been registered') ||
      error.message.toLowerCase().includes('unique')
    ) {
      return { error: 'Esse nome de usuário já está em uso.' }
    }
    return { error: error.message }
  }

  revalidatePath('/configuracoes/usuarios')
  return { success: true }
}

export async function resetEmployeePassword(
  userId: string,
  newPassword: string,
): Promise<{ success?: boolean; error?: string }> {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem redefinir senhas.' }
  }

  if (newPassword.length < 6) {
    return { error: 'Senha deve ter pelo menos 6 caracteres.' }
  }

  const service = createServiceClient()
  const { error } = await service.auth.admin.updateUserById(userId, {
    password: newPassword,
  })

  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteEmployee(
  userId: string,
): Promise<{ success?: boolean; error?: string }> {
  if (!(await isAdmin())) {
    return { error: 'Apenas administradores podem excluir usuários.' }
  }

  const current = await getCurrentUser()
  if (current?.id === userId) {
    return { error: 'Você não pode excluir a própria conta.' }
  }

  const service = createServiceClient()
  const { error } = await service.auth.admin.deleteUser(userId)

  if (error) return { error: error.message }

  revalidatePath('/configuracoes/usuarios')
  return { success: true }
}
