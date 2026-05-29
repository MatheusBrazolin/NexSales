import { redirect } from 'next/navigation'

/**
 * O cadastro público foi desativado.
 * Apenas administradores podem criar contas, via Configurações → Usuários.
 */
export default function CadastroPage() {
  redirect('/login')
}
