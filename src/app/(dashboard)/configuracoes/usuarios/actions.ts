'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/auth/roles'
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
