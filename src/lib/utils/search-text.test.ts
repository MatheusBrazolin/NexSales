import { describe, it, expect } from 'vitest'
import {
  normalizeSearchText,
  buildSearchTokens,
  scoreMatch,
  matchesQuery,
} from './search-text'

describe('normalizeSearchText', () => {
  it('remove acento, que é o caso que mais atrapalha o caixa', () => {
    expect(normalizeSearchText('Açúcar')).toBe('acucar')
    expect(normalizeSearchText('Sabão em Pó')).toBe('sabao em po')
    expect(normalizeSearchText('Leite Condensado Moça')).toBe('leite condensado moca')
  })

  it('colapsa espaço e tira sobra das pontas', () => {
    expect(normalizeSearchText('  Coca   Cola  ')).toBe('coca cola')
  })

  it('não quebra com texto vazio', () => {
    expect(normalizeSearchText('')).toBe('')
  })

  it('preserva número e hífen, que fazem parte do nome do produto', () => {
    expect(normalizeSearchText('Coca-Cola 2L')).toBe('coca-cola 2l')
  })
})

describe('buildSearchTokens', () => {
  it('gera uma palavra por token do nome', () => {
    const tokens = buildSearchTokens('Açúcar Refinado União', '789')
    expect(tokens).toContain('acucar')
    expect(tokens).toContain('refinado')
    expect(tokens).toContain('uniao')
  })

  it('inclui o código inteiro', () => {
    expect(buildSearchTokens('X', '7891000100103')).toContain('7891000100103')
  })

  it('inclui sufixos do código, para quem digita só o final', () => {
    const tokens = buildSearchTokens('X', '7891000100103')
    expect(tokens).toContain('0103')
    expect(tokens).toContain('00103')
  })

  it('não gera sufixo curto demais, que casaria com meio catálogo', () => {
    const code = '7891000100103'
    const tokens = buildSearchTokens('Produto', code)
    // Só os tokens derivados do código: palavras curtas do nome são
    // legítimas ("2L", "kg") e não entram nesta regra.
    const suffixes = tokens.filter((t) => code.endsWith(t) && t !== 'produto')
    expect(suffixes.every((t) => t.length >= 4)).toBe(true)
    expect(suffixes).not.toContain('103')
  })

  it('não repete token', () => {
    const tokens = buildSearchTokens('Café Café', 'CAFE')
    expect(tokens.filter((t) => t === 'cafe')).toHaveLength(1)
  })

  it('aguenta código curto sem gerar lixo', () => {
    expect(buildSearchTokens('Item', '01')).toEqual(['item', '01'])
  })
})

describe('scoreMatch', () => {
  const name = 'Coca-Cola 2L'
  const code = '7894900011517'

  it('põe o código exato em primeiro — é o bipe do leitor', () => {
    expect(scoreMatch(name, code, '7894900011517')).toBe(0)
  })

  it('depois o prefixo de código', () => {
    expect(scoreMatch(name, code, '78949')).toBe(1)
  })

  it('depois o nome que começa com o termo', () => {
    expect(scoreMatch(name, code, 'coca')).toBe(2)
  })

  it('depois palavra no meio do nome', () => {
    expect(scoreMatch('Garrafa de Coca', code, 'coca')).toBe(3)
  })

  it('ignora acento ao pontuar', () => {
    expect(scoreMatch('Açúcar União', '1', 'acucar')).toBe(2)
  })
})

describe('matchesQuery', () => {
  it('casa por pedaço do nome, sem acento', () => {
    expect(matchesQuery('Açúcar União 1kg', '789', 'uniao')).toBe(true)
  })

  it('casa por pedaço do código', () => {
    expect(matchesQuery('X', '7891000100103', '0001')).toBe(true)
  })

  it('não casa com termo vazio', () => {
    expect(matchesQuery('Açúcar', '789', '   ')).toBe(false)
  })

  it('não casa o que não tem nada a ver', () => {
    expect(matchesQuery('Açúcar', '789', 'detergente')).toBe(false)
  })
})
