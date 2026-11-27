import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { mapStatus, verifyMercadoPagoSignature } from './mercado-pago'

describe('mapStatus', () => {
  it('só "approved" vira pago', () => {
    expect(mapStatus('approved')).toBe('paid')
  })

  it('status desconhecido fica pendente, nunca pago', () => {
    // Diante de algo que não reconhecemos, não dar a venda por paga é o
    // erro barato. Dar é o caro.
    expect(mapStatus('in_process')).toBe('pending')
    expect(mapStatus('authorized')).toBe('pending')
    expect(mapStatus('qualquer_coisa_nova')).toBe('pending')
    expect(mapStatus('')).toBe('pending')
  })

  it('recusado e cancelado não são pendentes', () => {
    expect(mapStatus('rejected')).toBe('cancelled')
    expect(mapStatus('cancelled')).toBe('cancelled')
    expect(mapStatus('expired')).toBe('expired')
  })
})

describe('verifyMercadoPagoSignature', () => {
  const secret = 'segredo-de-teste'
  const dataId = '123456789'
  const requestId = 'req-abc'
  const ts = '1700000000'

  function sign(manifest: string) {
    return createHmac('sha256', secret).update(manifest).digest('hex')
  }

  it('aceita a assinatura correta', () => {
    const v1 = sign(`id:${dataId};request-id:${requestId};ts:${ts};`)
    expect(
      verifyMercadoPagoSignature(secret, dataId, requestId, `ts=${ts},v1=${v1}`),
    ).toBe(true)
  })

  it('recusa quando o id da cobrança foi trocado', () => {
    // É o ataque que importa: avisar sobre a cobrança de outra pessoa.
    const v1 = sign(`id:${dataId};request-id:${requestId};ts:${ts};`)
    expect(
      verifyMercadoPagoSignature(secret, '999', requestId, `ts=${ts},v1=${v1}`),
    ).toBe(false)
  })

  it('recusa assinatura feita com outro segredo', () => {
    const v1 = createHmac('sha256', 'outro-segredo')
      .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
      .digest('hex')
    expect(
      verifyMercadoPagoSignature(secret, dataId, requestId, `ts=${ts},v1=${v1}`),
    ).toBe(false)
  })

  it('recusa quando falta o cabeçalho', () => {
    expect(verifyMercadoPagoSignature(secret, dataId, requestId, null)).toBe(false)
  })

  it('recusa cabeçalho sem ts ou sem v1', () => {
    expect(verifyMercadoPagoSignature(secret, dataId, requestId, 'v1=abc')).toBe(false)
    expect(verifyMercadoPagoSignature(secret, dataId, requestId, `ts=${ts}`)).toBe(false)
  })

  it('recusa assinatura de tamanho diferente sem estourar', () => {
    expect(
      verifyMercadoPagoSignature(secret, dataId, requestId, `ts=${ts},v1=curto`),
    ).toBe(false)
  })
})
