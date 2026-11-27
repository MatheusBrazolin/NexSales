import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getPixProvider, resetPixProviderCache } from './provider'

/**
 * A propriedade que torna seguro publicar uma integração de pagamento que
 * ainda não foi testada contra uma conta real: sem configuração, ela não
 * existe. Se isto quebrar, o PDV passa a depender de um provedor que
 * ninguém configurou.
 */
describe('getPixProvider', () => {
  const original = { ...process.env }

  beforeEach(() => {
    resetPixProviderCache()
    delete process.env.PIX_PROVIDER
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN
  })

  afterEach(() => {
    process.env = { ...original }
    resetPixProviderCache()
  })

  it('devolve null quando não há provedor configurado', async () => {
    expect(await getPixProvider()).toBeNull()
  })

  it('devolve null quando a variável está vazia ou só com espaços', async () => {
    process.env.PIX_PROVIDER = '   '
    expect(await getPixProvider()).toBeNull()
  })

  it('provedor desconhecido fica desligado, não derruba o caixa', async () => {
    // Erro de configuração não pode impedir a loja de vender.
    process.env.PIX_PROVIDER = 'provedor-que-nao-existe'
    expect(await getPixProvider()).toBeNull()
  })

  it('mercadopago sem token fica desligado', async () => {
    process.env.PIX_PROVIDER = 'mercadopago'
    expect(await getPixProvider()).toBeNull()
  })

  it('mercadopago com token é ativado', async () => {
    process.env.PIX_PROVIDER = 'mercadopago'
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'token-de-teste'
    const provider = await getPixProvider()
    expect(provider?.name).toBe('mercadopago')
  })
})
