import type { GameCard } from '@/types/game'
import { mobileCheck } from '@/utils/function.ts'

// Helper for ADJ logic inside the worker
const ADJ = [
  { dx: 0, dy: -1, side: 'top' as const, opp: 'bottom' as const },
  { dx: 0, dy: 1, side: 'bottom' as const, opp: 'top' as const },
  { dx: -1, dy: 0, side: 'left' as const, opp: 'right' as const },
  { dx: 1, dy: 0, side: 'right' as const, opp: 'left' as const }
]

const evaluateBoardScore = (tempBoard: (GameCard | null)[][], npcHandLen: number, playerHandLen: number) => {
  let score = 0
  tempBoard.forEach(row => row.forEach(card => {
    if (card) score += (card.owner === 'npc' ? 1 : -1)
  }))
  return score + npcHandLen - playerHandLen
}

const getSimulatedState = (currentBoard: (GameCard | null)[][], card: GameCard, x: number, y: number, owner: 'player' | 'npc', activeRules: string[]) => {
  const newBoard = currentBoard.map(r => r.map(c => c ? { ...c } : null))
  const virtualCard = { ...card, owner }
  newBoard[y]![x] = virtualCard

  const isLow = activeRules.includes('low')
  const hasPlus = activeRules.includes('plus')
  const hasSame = activeRules.includes('same')

  const captures: { x: number, y: number }[] = []
  const sums = new Map<number, { x: number, y: number, c: GameCard }[]>()
  const matches: { x: number, y: number, c: GameCard }[] = []

  ADJ.forEach(adj => {
    const nx = x + adj.dx, ny = y + adj.dy
    if (ny >= 0 && ny < 3 && nx >= 0 && nx < 3 && newBoard[ny]![nx]) {
      const target = newBoard[ny]![nx]!
      const vAtk = virtualCard.values[adj.side]
      const vDef = target.values[adj.opp]

      if (hasPlus) {
        const s = vAtk + vDef
        if (!sums.has(s)) sums.set(s, [])
        sums.get(s)!.push({ x: nx, y: ny, c: target })
      }
      if (hasSame && vAtk === vDef) matches.push({ x: nx, y: ny, c: target })

      if (target.owner !== owner) {
        if (isLow ? vAtk < vDef : vAtk > vDef) captures.push({ x: nx, y: ny })
      }
    }
  })

  if (hasPlus) sums.forEach(list => {
    if (list.length >= 2) list.forEach(i => {
      if (i.c.owner !== owner) captures.push({ x: i.x, y: i.y })
    })
  })
  if (hasSame && matches.length >= 2) matches.forEach(i => {
    if (i.c.owner !== owner) captures.push({ x: i.x, y: i.y })
  })

  captures.forEach(p => {
    if (newBoard[p.y]![p.x]) newBoard[p.y]![p.x]!.owner = owner
  })
  return newBoard
}

const minimax = (board: (GameCard | null)[][], npcHand: GameCard[], playerHand: GameCard[], depth: number, isMax: boolean, alpha: number, beta: number, rules: string[]): number => {
  const isFull = board.every(row => row.every(slot => slot !== null))
  if (depth === 0 || isFull) return evaluateBoardScore(board, npcHand.length, playerHand.length)

  if (isMax) {
    let maxEval = -Infinity
    for (let i = 0; i < npcHand.length; i++) {
      const card = npcHand[i]!
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          if (board[y]![x]) continue
          const nextBoard = getSimulatedState(board, card, x, y, 'npc', rules)
          const ev = minimax(nextBoard, [...npcHand.slice(0, i), ...npcHand.slice(i + 1)], playerHand, depth - 1, false, alpha, beta, rules)
          maxEval = Math.max(maxEval, ev)
          alpha = Math.max(alpha, ev)
          if (beta <= alpha) break
        }
      }
    }
    return maxEval
  } else {
    let minEval = Infinity
    for (let i = 0; i < playerHand.length; i++) {
      const card = playerHand[i]!
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          if (board[y]![x]) continue
          const nextBoard = getSimulatedState(board, card, x, y, 'player', rules)
          const ev = minimax(nextBoard, npcHand, [...playerHand.slice(0, i), ...playerHand.slice(i + 1)], depth - 1, true, alpha, beta, rules)
          minEval = Math.min(minEval, ev)
          beta = Math.min(beta, ev)
          if (beta <= alpha) break
        }
      }
    }
    return minEval
  }
}

self.onmessage = (e) => {
  const { board, npcHand, playerHand, rules } = e.data
  let bestMove = null
  let maxEval = -Infinity

  const emptySlots = board.flat().filter((s: any) => s === null).length
  const isMobile = mobileCheck()
  const maxDepth = isMobile ? 3 : 4 // Lower depth for mobile

  const searchDepth = emptySlots > 6 ? maxDepth : emptySlots

  for (let i = 0; i < npcHand.length; i++) {
    const card = npcHand[i]!
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (board[y][x]) continue
        const nextBoard = getSimulatedState(board, card, x, y, 'npc', rules)
        const ev = minimax(nextBoard, [...npcHand.slice(0, i), ...npcHand.slice(i + 1)], playerHand, searchDepth - 1, false, -Infinity, Infinity, rules)
        if (ev > maxEval) {
          maxEval = ev
          bestMove = { cardInstanceId: card.instanceId, x, y }
        }
      }
    }
  }
  self.postMessage(bestMove)
}