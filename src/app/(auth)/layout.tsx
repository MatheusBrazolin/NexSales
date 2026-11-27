/**
 * Moldura das telas de entrada.
 *
 * O QUE ESTAVA AQUI
 * -----------------
 * Uma landing page: manchete "A próxima geração em gestão de vendas", três
 * bullets de funcionalidades, um desenho de um dashboard falso, selo de
 * "dados sempre protegidos", três bolhas de brilho roxas desfocadas e texto
 * com gradiente recortado.
 *
 * Material de venda — mostrado para quem já comprou. Quem abre esta tela é
 * o dono ou o caixa, de manhã, pela trecentésima vez, querendo digitar a
 * senha e começar a trabalhar. Não há nada para convencê-los.
 *
 * O QUE FICOU
 * -----------
 * A marca, o formulário e nada mais. A tela tem um trabalho só, e agora ela
 * faz só ele.
 */

import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // Sempre claro: a tela de entrada não deve mudar de cara conforme o
    // tema do sistema operacional de quem abre.
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 [color-scheme:light]">
      <header className="px-6 pt-8 sm:px-10 sm:pt-10">
        <Link
          href="/login"
          className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-base font-bold text-white"
          >
            N
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">
            NexSales
          </span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
        <div className="nx-enter-rise w-full max-w-[380px]">{children}</div>
      </main>

      <footer className="px-6 pb-8 sm:px-10 sm:pb-10">
        <p className="text-xs text-slate-400">
          &copy; {new Date().getFullYear()} NexSales
        </p>
      </footer>
    </div>
  )
}
