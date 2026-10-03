import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Save } from '../types'

const saveAtom = atom({ plugin: 'incremental', key: 'save' } as const, null)
const beatAtom = atom({ plugin: 'incremental', key: 'beat' } as const, 0)

const W = 46
const H = 14
const CX = 26
const MX = 5
const MY = 9
const RAINBOW = ['#ff6b81', '#ffb142', '#fff200', '#2ed573', '#1e90ff', '#a55eea']

type Ore = { name: string; color: string; value: number; weight: number }
const ORES: Ore[] = [
  { name: 'iron', color: '#c97b5a', value: 1, weight: 60 },
  { name: 'copper', color: '#f0a04b', value: 5, weight: 22 },
  { name: 'silver', color: '#dfe6ee', value: 15, weight: 10 },
  { name: 'gold', color: '#ffd23f', value: 50, weight: 5.5 },
  { name: 'emerald', color: '#3ddc84', value: 200, weight: 2 },
  { name: 'diamond', color: '#7fe7ff', value: 1000, weight: 0.45 },
  { name: 'prismatic', color: 'rainbow', value: 15000, weight: 0.05 },
]

const GAPS = [10, 8, 6, 4, 2, 1]
// one swing: shoulder, shoulder, mid, hit, hit, mid; the impact lands on frame 3
const SWING = ['S', 'S', 'M', 'H', 'H', 'M']
const HW = [4, 6, 7, 8, 8, 7]
const SPECKS: Array<[number, number]> = [[-3, 1], [2, 2], [-1, 3], [4, 3], [-4, 4], [1, 4], [3, 5]]
const ROCK_TONES = ['#8a8f98', '#7d828b', '#70757e', '#656a72', '#5b6068', '#51555c']

type Cell = { ch: string; color?: string; bold?: boolean; dim?: boolean }
type Particle = { x: number; y: number; vx: number; vy: number; g: number; ch: string; color: string; life: number; max: number; id: number }
type Float = { x: number; y: number; text: string; color: string; bold: boolean; life: number }
type Ring = { color: string; t: number; max: number }
type Mode = 'idle' | 'mine' | 'wait'

const fresh = (): Save => ({ tokens: 0, total: 0, ores: ORES.map(() => 0), pick: 0, speed: 0, luck: 0, auto: 0, swings: 0 })
const fmt = (n: number) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const hash = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 100
const costOf = (kind: 'pick' | 'speed' | 'luck', lv: number) =>
  Math.ceil(kind === 'pick' ? 15 * 1.55 ** lv : kind === 'speed' ? 30 * 1.9 ** lv : 50 * 1.8 ** lv)
const MAXES = { pick: 99, speed: GAPS.length - 1, luck: 10 }

let S: Save = fresh()
let turnActive = false
let inFlight = 0
let toolName = ''
let waitSince = 0
let now = 0
let tickN = 0
let swingIdx = -1
let gap = 4
let shake = 0
let pending = 0
let shown = 0
let rate = 0
let rateTotal = 0
let visible = false
let particles: Particle[] = []
let floats: Float[] = []
let rings: Ring[] = []
let pid = 0
let timer: { cancel: () => void } | null = null

const mode = (): Mode => (!turnActive ? 'idle' : inFlight > 0 ? 'wait' : 'mine')

const colorOf = (c: string, id: number) =>
  c === 'rainbow' ? RAINBOW[(tickN + id) % RAINBOW.length] : c

const roll = (): number => {
  const w = ORES.map((o, i) => o.weight * (i === 0 ? 1 : 1 + S.luck * 0.35 * i))
  let r = Math.random() * w.reduce((a, b) => a + b, 0)
  for (let i = 0; i < w.length; i++) {
    r -= w[i]
    if (r <= 0) return i
  }
  return 0
}
pending = roll()

const spawn = (p: Omit<Particle, 'id' | 'max'>) => {
  particles.push({ ...p, id: pid++, max: p.life })
}

const impact = ($: any) => {
  const tier = pending
  const ore = ORES[tier]
  const value = ore.value * (1 + S.pick)
  S.tokens += value
  S.total += value
  S.ores[tier] += 1
  S.swings += 1
  shake = 4

  for (let i = 0; i < 5 + tier * 3; i++) {
    spawn({
      x: 18, y: 10,
      vx: (Math.random() * 2 - 0.7) * 1.1, vy: -(0.5 + Math.random() * 1.0), g: 0.09,
      ch: ['▪', '◆', '•', '▫'][i % 4], color: ore.color, life: 18 + Math.floor(Math.random() * 8),
    })
  }
  for (let i = 0; i < 6; i++) {
    spawn({
      x: 18, y: 10,
      vx: (Math.random() * 2.4 - 1.2) * 1.3, vy: (Math.random() - 0.7) * 1.1, g: 0.03,
      ch: i % 2 ? '*' : '✶', color: '#ffe9a8', life: 5 + Math.floor(Math.random() * 3),
    })
  }
  if (tier >= 2) {
    const n = 16 + tier * 4
    for (let k = 0; k < n; k++) {
      const a = (Math.PI * 2 * k) / n
      spawn({
        x: CX, y: 8, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 0.75, g: 0,
        ch: ['✦', '✧', '·'][k % 3], color: ore.color, life: 14,
      })
    }
    rings.push({ color: ore.color, t: 10 + tier * 2, max: 10 + tier * 2 })
  }
  if (tier >= 3) {
    const n = tier >= 5 ? 28 : 12
    for (let k = 0; k < n; k++) {
      spawn({
        x: Math.random() * W, y: 3, vx: 0, vy: 0.22 + Math.random() * 0.25, g: 0,
        ch: k % 2 ? '✦' : '✧', color: ore.color, life: 24 + Math.floor(Math.random() * 6),
      })
    }
  }
  const text = tier === 0 ? `+${fmt(value)}` : `✦ ${ore.name} +${fmt(value)} ✦`
  floats.push({
    x: Math.max(0, Math.min(W - text.length, CX - Math.floor(text.length / 2))),
    y: 5.5, text, color: ore.color, bold: tier > 0, life: 18,
  })
  if (tier >= 3) $.ui.toast(`✦ ${ore.name} vein! +${fmt(value)} tokens`)
  pending = roll()
}

const step = async ($: any) => {
  tickN++
  now = await $.clock.now()
  const m = mode()

  if (m === 'mine') {
    if (swingIdx < 0) {
      if (gap > 0) gap--
      else swingIdx = 0
    } else {
      swingIdx++
      if (swingIdx === 3) impact($)
      if (swingIdx >= SWING.length) {
        swingIdx = -1
        gap = GAPS[S.speed]
      }
    }
  } else {
    swingIdx = -1
  }

  if (shake > 0) shake--
  for (const p of particles) {
    p.x += p.vx
    p.y += p.vy
    p.vy += p.g
    p.life--
  }
  particles = particles.filter(p => p.life > 0 && p.y < H - 2)
  for (const f of floats) {
    f.y -= 0.12
    f.life--
  }
  floats = floats.filter(f => f.life > 0)
  for (const r of rings) r.t--
  rings = rings.filter(r => r.t > 0)

  shown += (S.tokens - shown) * 0.25
  if (Math.abs(S.tokens - shown) < 1) shown = S.tokens

  if (tickN % 14 === 0) {
    rate = rate * 0.6 + (S.total - rateTotal) * 0.4
    rateTotal = S.total
    await update($, saveAtom, () => ({ ...S, ores: [...S.ores] }))
  }
  if (visible) await update($, beatAtom, n => n + 1)
}

const start = ($: any) => {
  if (timer) return
  timer = $.clock.every(70, () => {
    void step($)
  })
}

const DIGITS: Record<string, string[]> = {
  '0': ['┏━┓', '┃ ┃', '┗━┛'],
  '1': [' ╻ ', ' ┃ ', ' ╹ '],
  '2': ['╺━┓', '┏━┛', '┗━╸'],
  '3': ['╺━┓', ' ━┫', '╺━┛'],
  '4': ['╻ ╻', '┗━┫', '  ╹'],
  '5': ['┏━╸', '┗━┓', '╺━┛'],
  '6': ['┏━╸', '┣━┓', '┗━┛'],
  '7': ['╺━┓', '  ┃', '  ╹'],
  '8': ['┏━┓', '┣━┫', '┗━┛'],
  '9': ['┏━┓', '┗━┫', '╺━┛'],
  ',': [' ', ' ', '▝'],
}

// the token count in big block digits, with a highlight that sweeps across it
const counterRows = (): Cell[][] => {
  const text = fmt(shown)
  const rows: Cell[][] = [[], [], []]
  const sweep = (tickN / 2) % (text.length * 4 + 12) - 6
  const rising = Math.abs(S.tokens - shown) >= 1
  for (const ch of text) {
    const glyph = DIGITS[ch]
    for (let r = 0; r < 3; r++) {
      for (const c of glyph[r]) {
        const lit = Math.abs(rows[r].length - sweep) < 2
        rows[r].push({ ch: c, color: lit || rising ? '#fff1b8' : '#ffd23f', bold: true })
      }
      rows[r].push({ ch: ' ' })
    }
  }
  const label = ' tokens'
  for (const c of label) rows[2].push({ ch: c, color: '#9aa4b2', dim: true })
  const pad = Math.max(0, Math.floor((W - rows[0].length) / 2))
  return rows.map(r => [...Array.from({ length: pad }, () => ({ ch: ' ' })), ...r])
}

const draw = (): Cell[][] => {
  const g: Cell[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => ({ ch: ' ' })))
  const put = (x: number, y: number, c: Cell) => {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) g[iy][ix] = c
  }
  const m = mode()
  const ore = ORES[pending]

  // cave dust
  for (let i = 0; i < 14; i++) {
    const x = (i * 37 + 5) % W
    const y = (i * 11) % 8
    if ((tickN + i * 7) % 40 < 20) put(x, y, { ch: '·', color: '#5a5f6b', dim: true })
  }

  // shock rings
  for (const r of rings) {
    const radius = (r.max - r.t) * 1.1 + 2
    for (let k = 0; k < 40; k++) {
      const a = (Math.PI * 2 * k) / 40
      put(CX + Math.cos(a) * radius * 2, 8 + Math.sin(a) * radius, {
        ch: '·', color: colorOf(r.color, k), bold: true, dim: r.t < 4,
      })
    }
  }

  // ground
  for (let x = 0; x < W; x++) {
    put(x, 12, { ch: hash(x, 12) < 20 ? '▒' : '▓', color: '#4a4038' })
    put(x, 13, { ch: hash(x, 13) < 30 ? '▒' : '█', color: '#2e2823' })
  }

  // rock, shaking on impact
  const sx = shake > 0 ? (shake % 2 ? 1 : -1) : 0
  for (let r = 0; r < HW.length; r++) {
    const y = 6 + r
    for (let x = CX - HW[r]; x < CX + HW[r]; x++) {
      const n = hash(x, y)
      let ch = n < 12 ? '▓' : n < 24 ? '▒' : '█'
      if (r === 0) ch = '▄'
      else if (x === CX - HW[r]) ch = '▐'
      else if (x === CX + HW[r] - 1) ch = '▌'
      put(x + sx, y, { ch, color: ROCK_TONES[r] })
    }
  }
  // the vein showing the next drop
  const rareGlow = pending >= 3
  SPECKS.forEach(([dx, dy], i) => {
    const twinkle = (tickN + i * 3) % (rareGlow ? 6 : 14) < 3
    const ch = twinkle && pending >= 2 ? '✦' : '◆'
    put(CX + dx + sx, 6 + dy, { ch, color: colorOf(ore.color, i), bold: twinkle || rareGlow })
  })

  // the miner
  const body = '#d97757'
  const pose = m === 'mine' && swingIdx >= 0 ? SWING[swingIdx] : 'S'
  const art = ['  ▐▛███▜▌', ' ▝▜█████▛▘', m === 'wait' && tickN % 10 < 5 ? '   ▘▘  ▝▘' : '   ▘▘ ▝▝']
  art.forEach((row, ry) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== ' ') put(MX - 1 + i, MY + ry, { ch: row[i], color: body })
    }
  })
  const wood = '#a8794e'
  const steel = '#b8c4d4'
  const edge = '#e6edf5'
  if (pose === 'S') {
    put(MX + 9, MY + 1, { ch: '╱', color: wood })
    put(MX + 10, MY, { ch: '╱', color: wood })
    put(MX + 11, MY - 1, { ch: '╱', color: wood })
    put(MX + 10, MY - 2, { ch: '╭', color: edge })
    put(MX + 11, MY - 2, { ch: '━', color: steel })
    put(MX + 12, MY - 2, { ch: '╮', color: edge })
  } else {
    // handle level, head turned to face the rock: ╭ ┫ ╰ with its points forward
    const hx = pose === 'M' ? 11 : 12
    for (let k = 9; k < hx; k++) put(MX + k, MY + 1, { ch: '━', color: wood })
    put(MX + hx, MY, { ch: '╭', color: edge })
    put(MX + hx, MY + 1, { ch: '┫', color: steel })
    put(MX + hx, MY + 2, { ch: '╰', color: edge })
    if (pose === 'H') put(MX + hx + 1, MY + 1, { ch: '✦', color: '#ffffff', bold: true })
  }
  if (m === 'wait') {
    // raised wrist with a glinting watch, and a thought bubble zooming in on its face
    const cyan = '#7fe7ff'
    const elapsed = Math.max(0, now - waitSince)
    const beat = Math.floor(elapsed / 250)
    const pulse = beat % 8 === 0 && elapsed % 250 < 140
    put(MX - 1, MY, { ch: '▗', color: body })
    put(MX - 2, MY - 1, { ch: '◉', color: cyan, bold: true })
    if (tickN % 14 < 3) put(MX - 3, MY - 2, { ch: '✦', color: '#ffffff', bold: true })
    put(MX - 1, MY - 1, { ch: '·', color: cyan, dim: true })
    put(MX, MY - 2, { ch: '∘', color: cyan, dim: true })

    const border = pulse ? '#ffffff' : cyan
    const cx0 = 6
    const cy0 = 4
    const face = ['╭─────╮', '│     │', '│     │', '│     │', '╰─────╯']
    face.forEach((row, r) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== ' ') put(cx0 + i, cy0 + r, { ch: row[i], color: border, bold: pulse })
      }
    })
    // twelve, three, six and nine
    put(cx0 + 3, cy0 + 1, { ch: '·', color: cyan, dim: true })
    put(cx0 + 5, cy0 + 2, { ch: '·', color: cyan, dim: true })
    put(cx0 + 3, cy0 + 3, { ch: '·', color: cyan, dim: true })
    put(cx0 + 1, cy0 + 2, { ch: '·', color: cyan, dim: true })
    // the hand sweeps eight steps, once every two seconds, leaving a fading trail
    const hands: Array<[number, number, string]> = [
      [0, -1, '│'], [1, -1, '╱'], [1, 0, '─'], [1, 1, '╲'],
      [0, 1, '│'], [-1, 1, '╱'], [-1, 0, '─'], [-1, -1, '╲'],
    ]
    for (const back of [2, 1, 0]) {
      const [dx, dy, ch] = hands[(beat - back + 16) % 8]
      put(cx0 + 3 + dx, cy0 + 2 + dy, { ch, color: back === 0 ? '#ffffff' : cyan, bold: back === 0, dim: back > 0 })
    }
    put(cx0 + 3, cy0 + 2, { ch: '●', color: '#ffffff', bold: true })

    const label = `${Math.floor(elapsed / 1000)}s`
    for (let i = 0; i < label.length; i++) put(cx0 + 8 + i, cy0 + 2, { ch: label[i], color: cyan, bold: true })
  }

  // particles and floating text
  for (const p of particles) {
    put(p.x, p.y, { ch: p.ch, color: colorOf(p.color, p.id), bold: p.life > 4, dim: p.life <= 4 })
  }
  for (const f of floats) {
    for (let i = 0; i < f.text.length; i++) {
      put(f.x + i, f.y, { ch: f.text[i], color: colorOf(f.color, i), bold: f.bold, dim: f.life < 6 })
    }
  }

  return g
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'incremental',
      description: 'The Claude mascot mines ore while Claude works; ore is tokens',
    })
    const saved = await read($, saveAtom)
    if (saved) {
      S = { ...fresh(), ...saved }
      shown = S.tokens
      rateTotal = S.total
    }
    start($)

    return next(e)
  })

  on('command.run', { command: 'incremental' }, async $ => {
    start($)
    visible = !visible
    await update($, beatAtom, n => n + 1)

    return { text: visible ? '⛏ Miner is on. He digs while Claude works.' : 'Miner hidden. /incremental brings him back.' }
  })

  on('prompt.submit', ($, e, next) => {
    turnActive = true
    inFlight = 0

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    inFlight += 1
    toolName = String(e.tool)
    if (inFlight === 1) waitSince = await $.clock.now()
    try {
      return await next(e)
    } finally {
      inFlight = Math.max(0, inFlight - 1)
    }
  })

  on('turn.complete', ($, e, next) => {
    turnActive = false
    inFlight = 0

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await read($, beatAtom)
    if (!visible || e.props.hasSurvey) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const g = [...counterRows(), ...draw().slice(4, 13)]

    const rows = g.map((row, y) => {
      const runs: Array<{ key: string; text: string; cell: Cell }> = []
      for (const cell of row) {
        const last = runs[runs.length - 1]
        if (last && last.cell.color === cell.color && last.cell.bold === cell.bold && last.cell.dim === cell.dim) {
          last.text += cell.ch
        } else {
          runs.push({ key: `${y}-${runs.length}`, text: cell.ch, cell })
        }
      }
      return (
        <Box key={`row${y}`}>
          {runs.map(r => (
            <Text key={r.key} color={r.cell.color} bold={r.cell.bold} dimColor={r.cell.dim}>
              {r.text}
            </Text>
          ))}
        </Box>
      )
    })

    return <Box flexDirection="column">{rows}</Box>
  })
}
