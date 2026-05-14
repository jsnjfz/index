import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

// ─── Config (mutated by UI panel) ───────────────────────────

export const cfg = {
  dragonSegments: 60,
  dragonSpeed: 0.18,
  dragonScale: 1.0,
  showWings: true,
  showSpines: true,
  pushForce: 6,
  springStrength: 0.015,
  damping: 0.93,
  burnGravity: 0.8,
  fireRadius: 120,
  fireForce: 25,
  screenShake: true,
  showEmbers: true,
  showParticles: true,
  showRunes: true,
  showCursor: true,
  textOpacity: 1.0,
}

const PRESETS: Record<string, Partial<typeof cfg>> = {
  Default: {},
  Gentle: { dragonSpeed: 0.10, pushForce: 5, fireForce: 10, fireRadius: 60, screenShake: false, burnGravity: 0.2, springStrength: 0.03 },
  Chaos: { pushForce: 25, fireForce: 50, fireRadius: 200, burnGravity: 2.5, springStrength: 0.005, damping: 0.96, screenShake: true },
  Zen: { showParticles: false, showEmbers: false, screenShake: false, showRunes: false, pushForce: 4, fireForce: 8, springStrength: 0.04, burnGravity: 0 },
  Tiny: { dragonSegments: 20, dragonScale: 0.6, fireRadius: 50, pushForce: 6 },
  Leviathan: { dragonSegments: 80, dragonScale: 2.0, dragonSpeed: 0.08, pushForce: 20, fireRadius: 180 },
}
const DEFAULT_CFG = { ...cfg }

function applyPreset(name: string) {
  Object.assign(cfg, DEFAULT_CFG, PRESETS[name] || {})
  rebuildDragon()
  syncUI()
}

// ─── Canvas ─────────────────────────────────────────────────

const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const dpr = Math.min(window.devicePixelRatio || 1, 2)
const NAV_H = 44
let W = innerWidth, H = innerHeight - NAV_H

let initialized = false
function resize() {
  W = innerWidth; H = innerHeight - NAV_H
  canvas.width = W * dpr; canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (initialized) { layoutAllText(); buildTunnel() }
}
resize()
addEventListener('resize', resize)

// ─── Mouse ──────────────────────────────────────────────────

const mouse = { x: W / 2, y: H / 2 }
addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY - NAV_H })
addEventListener('touchmove', (e) => { e.preventDefault(); mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY - NAV_H }, { passive: false })

// ─── Screen shake ───────────────────────────────────────────

let shakeIntensity = 0, shakeX = 0, shakeY = 0
function triggerShake(intensity: number) {
  if (!cfg.screenShake) return
  shakeIntensity = Math.max(shakeIntensity, Math.min(intensity, 8))
}
function updateShake() {
  if (shakeIntensity > 0.1) {
    shakeX = (Math.random() - 0.5) * shakeIntensity
    shakeY = (Math.random() - 0.5) * shakeIntensity
    shakeIntensity *= 0.85
  } else { shakeX = 0; shakeY = 0; shakeIntensity = 0 }
}

// ─── Letters (SoA) ──────────────────────────────────────────

const MAX_LETTERS = 2000
let letterCount = 0

const lHomeX = new Float32Array(MAX_LETTERS)
const lHomeY = new Float32Array(MAX_LETTERS)
const lX = new Float32Array(MAX_LETTERS)
const lY = new Float32Array(MAX_LETTERS)
const lVx = new Float32Array(MAX_LETTERS)
const lVy = new Float32Array(MAX_LETTERS)
const lAngle = new Float32Array(MAX_LETTERS)
const lAngVel = new Float32Array(MAX_LETTERS)
const lCharW = new Float32Array(MAX_LETTERS)
const lBaseAlpha = new Float32Array(MAX_LETTERS)
const lFontSize = new Float32Array(MAX_LETTERS)
const lBurnTimer = new Float32Array(MAX_LETTERS)
const lScaleMul = new Float32Array(MAX_LETTERS)
const lGravity = new Float32Array(MAX_LETTERS)

const lChar: string[] = []
const lFont: string[] = []
const lColor: string[] = []

// ─── Embers + Particles ────────────────────────────────────

const MAX_EMBERS = 60
let emberCount = 0
const emX = new Float32Array(MAX_EMBERS)
const emY = new Float32Array(MAX_EMBERS)
const emVx = new Float32Array(MAX_EMBERS)
const emVy = new Float32Array(MAX_EMBERS)
const emLife = new Float32Array(MAX_EMBERS)
const emSize = new Float32Array(MAX_EMBERS)
const emChar: string[] = new Array(MAX_EMBERS)
const emColor: string[] = new Array(MAX_EMBERS)
const emberChars = ['·', '•', '∘', '˚']
const emberColors = ['#ff6600', '#ffaa00', '#ff4400']

function spawnEmber(x: number, y: number) {
  if (!cfg.showEmbers || emberCount >= MAX_EMBERS) return
  const i = emberCount++
  const a = Math.random() * Math.PI * 2
  emX[i] = x; emY[i] = y
  emVx[i] = Math.cos(a) * (1 + Math.random() * 3)
  emVy[i] = Math.sin(a) * (1 + Math.random() * 3) - 2
  emLife[i] = 0.3 + Math.random() * 0.6
  emSize[i] = 4 + Math.random() * 7
  emChar[i] = emberChars[Math.random() * 4 | 0]
  emColor[i] = emberColors[Math.random() * 3 | 0]
}

const MAX_PARTICLES = 150
let particleCount = 0
const pX = new Float32Array(MAX_PARTICLES)
const pY = new Float32Array(MAX_PARTICLES)
const pVx = new Float32Array(MAX_PARTICLES)
const pVy = new Float32Array(MAX_PARTICLES)
const pLife = new Float32Array(MAX_PARTICLES)
const pMaxLife = new Float32Array(MAX_PARTICLES)
const pSize = new Float32Array(MAX_PARTICLES)
const pChar: string[] = new Array(MAX_PARTICLES)
const fireChars = '*✦✧⁕❋✺◌•∘˚⋆·'.split('')

// ─── Text entries (个人介绍内容) ────────────────────────────

type TextEntry = {
  text: string; font: string; fontSize: number; color: string; alpha: number
  yOffset: number; maxWidth: number; lineHeight: number
  style: 'heading' | 'body' | 'quote' | 'cjk' | 'code' | 'huge'
  column: 'left' | 'right' | 'center'
}

const FONT = {
  serif: '"Noto Serif SC", "Georgia", serif',
  sans: '"Noto Sans SC", "Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  display: '"Inter", "Noto Sans SC", system-ui, sans-serif',
}

const textEntries: TextEntry[] = [
  // 背景大字
  { text: 'MAOMAO', font: FONT.mono, fontSize: 130, color: '#1a2535', alpha: 0.5, yOffset: -20, maxWidth: 1200, lineHeight: 140, style: 'huge', column: 'center' },

  // 左侧 — 身份
  { text: '逆袭的毛毛', font: FONT.sans, fontSize: 54, color: '#ffffff', alpha: 1.0, yOffset: 100, maxWidth: 900, lineHeight: 66, style: 'heading', column: 'left' },
  { text: 'IT架构师 · Vibe Coder · AI探索者', font: FONT.display, fontSize: 20, color: '#b0bec5', alpha: 0.9, yOffset: 175, maxWidth: 700, lineHeight: 30, style: 'body', column: 'left' },
  // 简介 — 只讲故事，不堆数据
  { text: '深耕技术10多年，从传统IT架构一路走到AI时代。现在的日常是用Vibe Coding写代码、搭Dify工作流、做浏览器插件，把AI塞进能塞的每个角落。喜欢折腾，相信AI改变命运。', font: FONT.serif, fontSize: 16, color: '#cfd8dc', alpha: 0.8, yOffset: 225, maxWidth: 520, lineHeight: 26, style: 'body', column: 'left' },
  // 技能栈 — 只列工具和领域
  { text: 'AI：Claude · GPT · Gemini · Dify\n企业：ERP · SRM · MES · Agent落地\n创作：AI生图 · 公众号 · Chrome插件', font: FONT.mono, fontSize: 14, color: '#81c784', alpha: 0.8, yOffset: 390, maxWidth: 540, lineHeight: 22, style: 'code', column: 'left' },

  // 左侧 — 态度签名
  { text: '「折腾AI、折腾软硬件、折腾AI。用AI书写自己的故事。」', font: FONT.serif, fontSize: 17, color: '#ffb74d', alpha: 0.85, yOffset: 500, maxWidth: 540, lineHeight: 27, style: 'cjk', column: 'left' },

  // 右侧 — 数据集中展示
  { text: '✦ 100万+ 行 Vibe Coding\n✦ AI编程接单变现5位数\n✦ Chrome插件 300+ 用户\n✦ 小红书AI画画 1500+ 粉', font: FONT.mono, fontSize: 14, color: '#ffab40', alpha: 0.8, yOffset: 120, maxWidth: 370, lineHeight: 22, style: 'code', column: 'right' },
  // 时间线
  { text: '「2024 GPT代写起步 → 2025 AI编程接单 → 2026 单笔五位数。从零到一，每一步都是逆袭。」', font: FONT.serif, fontSize: 16, color: '#e6b980', alpha: 0.8, yOffset: 250, maxWidth: 400, lineHeight: 26, style: 'quote', column: 'right' },

  // 右侧 — 联系方式
  { text: '微信：逆袭的毛毛\n小红书：AI工具栈大叔 · 1500+ 粉\n邮箱：jsnjfz@gmail.com', font: FONT.mono, fontSize: 13, color: '#90a4ae', alpha: 0.7, yOffset: 380, maxWidth: 370, lineHeight: 21, style: 'code', column: 'right' },

  // 底部
  { text: '龙穿越画布，每一鳞是一个字符，每一次呼吸是一颗粒子。文字散落又重聚，正如代码的生命。', font: FONT.serif, fontSize: 17, color: '#b0a090', alpha: 0.7, yOffset: 640, maxWidth: 800, lineHeight: 28, style: 'quote', column: 'center' },
]

function layoutAllText() {
  letterCount = 0
  lChar.length = 0; lFont.length = 0; lColor.length = 0

  const mx = Math.max(50, W * 0.06), my = Math.max(60, H * 0.06)
  const cw = W - mx * 2
  const twoCol = cw > 700
  const col2X = twoCol ? mx + cw * 0.56 : mx

  for (const entry of textEntries) {
    const fontStr = `${entry.fontSize}px ${entry.font}`
    let baseX: number, maxW: number
    if (entry.column === 'right') { baseX = twoCol ? col2X : mx; maxW = Math.min(entry.maxWidth, twoCol ? cw * 0.4 : cw) }
    else if (entry.column === 'center') { maxW = Math.min(entry.maxWidth, cw); baseX = mx + (cw - maxW) / 2 }
    else { baseX = mx; maxW = Math.min(entry.maxWidth, twoCol ? cw * 0.5 : cw) }
    const baseY = my + entry.yOffset

    try {
      const prepared = prepareWithSegments(entry.text, fontStr, entry.style === 'code' ? { whiteSpace: 'pre-wrap' } : undefined)
      const { lines } = layoutWithLines(prepared, maxW, entry.lineHeight)
      for (let li = 0; li < lines.length; li++) {
        let xc = baseX
        const y = baseY + li * entry.lineHeight
        ctx.font = fontStr
        for (const char of lines[li].text) {
          if (char === '\n' || letterCount >= MAX_LETTERS) continue
          const cw2 = ctx.measureText(char).width
          const i = letterCount++
          lHomeX[i] = xc + cw2 / 2; lHomeY[i] = y + entry.lineHeight / 2
          lX[i] = lHomeX[i]; lY[i] = lHomeY[i]
          lVx[i] = 0; lVy[i] = 0; lAngle[i] = 0; lAngVel[i] = 0
          lCharW[i] = cw2; lBaseAlpha[i] = entry.alpha
          lFontSize[i] = entry.fontSize; lBurnTimer[i] = 0
          lScaleMul[i] = 1; lGravity[i] = 0
          lChar[i] = char; lFont[i] = fontStr; lColor[i] = entry.color
          xc += cw2
        }
      }
    } catch { /* skip entries that fail */ }
  }
}

// ─── Dragon chain ───────────────────────────────────────────

const SEG_SPACING = 10
let chainN = 0
let chX = new Float32Array(80), chY = new Float32Array(80)
let chPx = new Float32Array(80), chPy = new Float32Array(80)

function rebuildDragon() {
  chainN = cfg.dragonSegments
  if (chX.length < chainN) {
    chX = new Float32Array(chainN); chY = new Float32Array(chainN)
    chPx = new Float32Array(chainN); chPy = new Float32Array(chainN)
  }
  for (let i = 0; i < chainN; i++) {
    chX[i] = W / 2; chY[i] = H / 2 + i * SEG_SPACING
    chPx[i] = chX[i]; chPy[i] = chY[i]
  }
}
rebuildDragon()

const dragonChars = '◆◆◇▼█▓▓▒╬╬╬╬╬╬╬╬╬╬╫╫╫╪╪╪╧╧╤╤╥╥║║││┃┃╎╎╏╏::····..'.split('')

function segScale(i: number): number {
  if (i < 3) return (2.5 - i * 0.15) * cfg.dragonScale
  const t = (i - 3) / (chainN - 3)
  return (2.0 * (1 - t * t) + 0.2) * cfg.dragonScale
}

function updateChain() {
  for (let i = 0; i < chainN; i++) { chPx[i] = chX[i]; chPy[i] = chY[i] }
  chX[0] += (mouse.x - chX[0]) * cfg.dragonSpeed
  chY[0] += (mouse.y - chY[0]) * cfg.dragonSpeed
  for (let i = 1; i < chainN; i++) {
    const dx = chX[i] - chX[i - 1], dy = chY[i] - chY[i - 1]
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > SEG_SPACING) { const r = SEG_SPACING / d; chX[i] = chX[i - 1] + dx * r; chY[i] = chY[i - 1] + dy * r }
  }
}

// ─── Physics ────────────────────────────────────────────────

function interactLetters(dt: number) {
  const checkSegs = Math.min(Math.round(chainN * 0.4), chainN)
  const damp = cfg.damping, spring = cfg.springStrength, push = cfg.pushForce, bGrav = cfg.burnGravity

  for (let li = 0; li < letterCount; li++) {
    let vx = lVx[li], vy = lVy[li], av = lAngVel[li]
    const x = lX[li], y = lY[li], cw2 = lCharW[li]

    for (let si = 0; si < checkSegs; si++) {
      const sc = segScale(si)
      const rad = 14 * sc * 0.45
      const dx = x - chX[si], dy = y - chY[si]
      const dSq = dx * dx + dy * dy
      const minD = rad + cw2 * 0.4 + 4
      if (dSq < minD * minD && dSq > 0.01) {
        const d = Math.sqrt(dSq)
        const f = push * ((minD - d) / minD) * sc
        const nx = dx / d, ny = dy / d
        vx += nx * f + (chX[si] - chPx[si]) * 0.4
        vy += ny * f + (chY[si] - chPy[si]) * 0.4
        av += (nx * 0.3 - ny * 0.2) * f * 0.12
      }
    }

    for (let si = 5; si < chainN; si += 5) {
      const dx = x - chX[si], dy = y - chY[si]
      const dSq = dx * dx + dy * dy
      if (dSq < 1600 && dSq > 100) {
        const w = (1 - Math.sqrt(dSq) / 40) * 0.12
        vx += (chX[si] - chPx[si]) * w
        vy += (chY[si] - chPy[si]) * w
      }
    }

    if (lBurnTimer[li] > 0) {
      lBurnTimer[li] -= dt
      lScaleMul[li] = 1 + lBurnTimer[li] * 0.4
      lGravity[li] = bGrav
      if (Math.random() < dt * 2) spawnEmber(x, y)
      if (lBurnTimer[li] <= 0) { lBurnTimer[li] = 0; lScaleMul[li] = 1; lGravity[li] = 0 }
    }

    const hdx = lHomeX[li] - x, hdy = lHomeY[li] - y
    const hd = Math.sqrt(hdx * hdx + hdy * hdy)
    if (hd > 0.5) {
      const sf = spring * (1 + hd * 0.001)
      vx += hdx * sf; vy += hdy * sf
      av -= lAngle[li] * 0.05
    } else { lAngle[li] *= 0.9 }

    vy += lGravity[li]
    lVx[li] = vx * damp; lVy[li] = vy * damp
    lAngVel[li] = av * 0.91
    lX[li] = x + lVx[li]; lY[li] = y + lVy[li]
    lAngle[li] += lAngVel[li]
  }
}

function fireBlastAt(bx: number, by: number, dx: number, dy: number) {
  let hits = 0
  const rSq = cfg.fireRadius * cfg.fireRadius, ff = cfg.fireForce, fr = cfg.fireRadius
  for (let li = 0; li < letterCount; li++) {
    const ldx = lX[li] - bx, ldy = lY[li] - by
    const dSq = ldx * ldx + ldy * ldy
    if (dSq < rSq && dSq > 0.01) {
      const d = Math.sqrt(dSq), f = ff * ((1 - d / fr) ** 2)
      lVx[li] += (ldx / d * 0.4 + dx * 0.6) * f
      lVy[li] += (ldy / d * 0.4 + dy * 0.6) * f - f * 0.2
      lAngVel[li] += (Math.random() - 0.5) * f * 0.3
      lBurnTimer[li] = Math.max(lBurnTimer[li], 0.5 + Math.random() * 1.2)
      hits++
    }
  }
  if (hits > 3) { triggerShake(Math.min(hits * 0.4, 6)); for (let i = 0; i < Math.min(hits, 4); i++) spawnEmber(bx, by) }
}

// ─── Draw letters ───────────────────────────────────────────

function drawLetters() {
  const opMul = cfg.textOpacity
  let prevFont = ''

  for (let i = 0; i < letterCount; i++) {
    const burning = lBurnTimer[i] > 0
    let alpha = lBaseAlpha[i] * opMul
    let color = lColor[i]

    if (burning) {
      const h = Math.min(1, lBurnTimer[i])
      color = `rgb(255,${80 + h * 175 | 0},${h * 60 | 0})`
      alpha = Math.min(1, alpha + 0.5)
    }

    const font = lFont[i]
    if (font !== prevFont) { ctx.font = font; prevFont = font }

    ctx.save()
    ctx.translate(lX[i], lY[i])
    if (lAngle[i] !== 0) ctx.rotate(lAngle[i])
    const sm = lScaleMul[i]
    if (sm !== 1) ctx.scale(sm, sm)
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(lChar[i], 0, 0)
    if (burning && lBurnTimer[i] > 0.3) {
      ctx.globalAlpha = lBurnTimer[i] * 0.2
      ctx.fillStyle = '#ffaa00'
      ctx.fillText(lChar[i], 0, 0)
    }
    ctx.restore()
  }
}

// ─── Fire emission + particles ──────────────────────────────

let isBreathingFire = false, fireAccum = 0, totalFireTime = 0

addEventListener('mousedown', (e) => { if (!(e.target as HTMLElement).closest('#panel, #panel-toggle')) isBreathingFire = true })
addEventListener('mouseup', () => { isBreathingFire = false })
addEventListener('touchstart', (e) => { if (!(e.target as HTMLElement).closest('#panel, #panel-toggle')) isBreathingFire = true })
addEventListener('touchend', () => { isBreathingFire = false })

function emitFire(dt: number) {
  if (!isBreathingFire) { totalFireTime = 0; return }
  fireAccum += dt; totalFireTime += dt
  const hx = chX[0], hy = chY[0]
  const ni = Math.min(3, chainN - 1)
  const fdx = hx - chX[ni], fdy = hy - chY[ni]
  const len = Math.sqrt(fdx * fdx + fdy * fdy) || 1
  const dx = fdx / len, dy = fdy / len, angle = Math.atan2(fdy, fdx)

  if (cfg.showParticles) {
    while (fireAccum > 0.025) {
      fireAccum -= 0.025
      if (particleCount >= MAX_PARTICLES) break
      for (let j = 0; j < 2; j++) {
        if (particleCount >= MAX_PARTICLES) break
        const i = particleCount++
        const sp = (Math.random() - 0.5), spd = 5 + Math.random() * 7
        pX[i] = hx + dx * 15; pY[i] = hy + dy * 15
        pVx[i] = Math.cos(angle + sp) * spd; pVy[i] = Math.sin(angle + sp) * spd - Math.random()
        pLife[i] = 1; pMaxLife[i] = 0.3 + Math.random() * 0.4
        pSize[i] = 6 + Math.random() * 12
        pChar[i] = fireChars[Math.random() * fireChars.length | 0]
      }
    }
  } else { fireAccum = 0 }

  const bx = hx + dx * 50, by = hy + dy * 50
  fireBlastAt(bx, by, dx, dy)
  triggerShake(Math.min(1 + totalFireTime * 0.2, 3))
}

function updateParticlesAndEmbers(dt: number) {
  for (let i = particleCount - 1; i >= 0; i--) {
    pX[i] += pVx[i]; pY[i] += pVy[i]; pVy[i] -= 0.25; pVx[i] *= 0.97
    pLife[i] -= dt / pMaxLife[i]
    if (pLife[i] <= 0) {
      particleCount--
      pX[i] = pX[particleCount]; pY[i] = pY[particleCount]
      pVx[i] = pVx[particleCount]; pVy[i] = pVy[particleCount]
      pLife[i] = pLife[particleCount]; pMaxLife[i] = pMaxLife[particleCount]
      pSize[i] = pSize[particleCount]; pChar[i] = pChar[particleCount]
    }
  }
  for (let i = emberCount - 1; i >= 0; i--) {
    emX[i] += emVx[i]; emY[i] += emVy[i]; emVy[i] += 0.15; emVx[i] *= 0.97
    emLife[i] -= dt
    if (emLife[i] <= 0) {
      emberCount--
      emX[i] = emX[emberCount]; emY[i] = emY[emberCount]
      emVx[i] = emVx[emberCount]; emVy[i] = emVy[emberCount]
      emLife[i] = emLife[emberCount]; emSize[i] = emSize[emberCount]
      emChar[i] = emChar[emberCount]; emColor[i] = emColor[emberCount]
    }
  }
}

function drawParticles(time: number) {
  if (cfg.showEmbers) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let i = 0; i < emberCount; i++) {
      ctx.globalAlpha = Math.min(1, emLife[i] * 2)
      ctx.font = `${emSize[i]}px "JetBrains Mono","Fira Code",monospace`
      ctx.fillStyle = emColor[i]
      ctx.fillText(emChar[i], emX[i], emY[i])
    }
  }
  if (cfg.showParticles) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let i = 0; i < particleCount; i++) {
      const t = 1 - pLife[i]
      let r: number, g: number, b: number
      if (t < 0.15) { r = 255; g = 255; b = 255 * (1 - t * 6.67) | 0 }
      else if (t < 0.4) { r = 255; g = 255 * (1 - (t - 0.15) * 3.2) | 0; b = 0 }
      else { const f = (t - 0.4) * 1.67; r = 255 * (1 - f * 0.6) | 0; g = 80 * (1 - f) | 0; b = 0 }
      const sz = pSize[i] * (0.4 + pLife[i] * 0.6)
      ctx.globalAlpha = pLife[i] * 0.85
      ctx.font = `${sz}px "JetBrains Mono","Fira Code",monospace`
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillText(pChar[i], pX[i], pY[i])
    }
  }
  ctx.globalAlpha = 1
}

// ─── 3D Text Tunnel ─────────────────────────────────────────

const tunnelTexts = [
  '逆袭的毛毛 — Vibe Coder · AI Explorer',
  'IT架构师 · 深耕技术10年+',
  'Dify · Claude · GPT · Cursor · Vibe Coding',
  '从零到一 · AI变现五位数 · 持续逆袭',
  'ERP · SRM · MES · AI Agent 落地',
  '折腾AI · 折腾软硬件 · 折腾一切',
]
const tunnelFont = '13px "Inter","Noto Sans SC",system-ui,sans-serif'
const TUNNEL_RINGS = 12
const TUNNEL_DEPTH = 1200

const tunnelZ = new Float32Array(TUNNEL_RINGS)
const tunnelSide = new Uint8Array(TUNNEL_RINGS)
const tunnelTextIdx = new Uint8Array(TUNNEL_RINGS)

function buildTunnel() {
  for (let i = 0; i < TUNNEL_RINGS; i++) {
    tunnelZ[i] = (i / TUNNEL_RINGS) * TUNNEL_DEPTH
    tunnelSide[i] = i % 4
    tunnelTextIdx[i] = i % tunnelTexts.length
  }
}
buildTunnel()

function drawTunnel() {
  const cx = W * 0.5, cy = H * 0.5
  ctx.font = tunnelFont; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ff8844'

  for (let i = 0; i < TUNNEL_RINGS; i++) {
    tunnelZ[i] -= 0.67
    if (tunnelZ[i] < 10) {
      tunnelZ[i] += TUNNEL_DEPTH
      tunnelSide[i] = (tunnelSide[i] + 1) % 4
      tunnelTextIdx[i] = Math.random() * tunnelTexts.length | 0
    }
    const scale = 400 / (400 + tunnelZ[i])
    const alpha = Math.max(0, Math.min(0.06, 0.08 * scale - 0.01))
    if (alpha < 0.003) continue
    const spread = 350 * scale
    let x: number, y: number
    const s = tunnelSide[i]
    if (s === 0) { x = cx; y = cy - spread }
    else if (s === 1) { x = cx + spread; y = cy }
    else if (s === 2) { x = cx; y = cy + spread }
    else { x = cx - spread; y = cy }
    ctx.globalAlpha = alpha
    ctx.fillText(tunnelTexts[tunnelTextIdx[i]], x, y)
  }
  ctx.globalAlpha = 1
}

// ─── Runes ──────────────────────────────────────────────────

const RUNE_N = 8
const runeChars = '龍火竜鱗焔ᚱᚦᛏ'.split('')
const runeX = new Float32Array(RUNE_N), runeY = new Float32Array(RUNE_N)
const runeSpd = new Float32Array(RUNE_N), runePhase = new Float32Array(RUNE_N)
const runeSz = new Float32Array(RUNE_N), runeOp = new Float32Array(RUNE_N)
const runeC: string[] = []
for (let i = 0; i < RUNE_N; i++) {
  runeX[i] = Math.random() * W; runeY[i] = Math.random() * H
  runeSpd[i] = 0.1 + Math.random() * 0.4; runePhase[i] = Math.random() * Math.PI * 2
  runeSz[i] = 14 + Math.random() * 14; runeOp[i] = 0.02 + Math.random() * 0.04
  runeC[i] = runeChars[Math.random() * runeChars.length | 0]
}

function drawRunes(time: number) {
  if (!cfg.showRunes) return
  ctx.fillStyle = '#ff6600'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  for (let i = 0; i < RUNE_N; i++) {
    runeY[i] -= runeSpd[i]
    if (runeY[i] < -30) { runeY[i] = H + 30; runeX[i] = Math.random() * W }
    ctx.globalAlpha = runeOp[i] * (0.5 + Math.sin(time * 0.4 + runePhase[i]) * 0.5)
    ctx.font = `${runeSz[i]}px "JetBrains Mono","Fira Code",monospace`
    ctx.fillText(runeC[i], runeX[i] + Math.sin(time * 0.7 + runePhase[i]) * 12, runeY[i])
  }
  ctx.globalAlpha = 1
}

// ─── Draw dragon ────────────────────────────────────────────

function drawDragon(time: number) {
  for (let i = chainN - 1; i >= 0; i--) {
    const sc = segScale(i), ci = Math.min(i, dragonChars.length - 1), size = 14 * sc
    const t = i / chainN, p = Math.sin(time * 3 + i * 0.3) * 0.12
    let color: string
    if (i < 3) color = `rgb(255,${180 + p * 60 | 0},${40 + p * 30 | 0})`
    else {
      const w = Math.sin(time * 2 - i * 0.15) * 0.15
      color = `rgba(${(255 * (1 - t * 0.5) + p * 20) | 0},${(140 * (1 - t * 0.8) + w * 60) | 0},${(30 * (1 - t) + w * 20) | 0},${1 - t * 0.45})`
    }
    let angle = i === 0
      ? Math.atan2(mouse.y - chY[0], mouse.x - chX[0])
      : Math.atan2(chY[i - 1] - chY[i], chX[i - 1] - chX[i])

    if (i < 4) {
      ctx.globalAlpha = 0.06 * (isBreathingFire ? 2 : 1)
      ctx.fillStyle = '#ff6600'; ctx.beginPath()
      ctx.arc(chX[i], chY[i], size * 1.1, 0, Math.PI * 2); ctx.fill()
    }

    if (cfg.showSpines && i >= 4 && i <= 30 && i % 3 === 0) {
      const sa = angle + Math.PI / 2
      ctx.globalAlpha = 0.35
      ctx.font = `${size * (0.6 + Math.sin(time * 3 + i) * 0.15)}px "JetBrains Mono","Fira Code",monospace`
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('▴', chX[i] + Math.cos(sa) * size * 0.35, chY[i] + Math.sin(sa) * size * 0.35)
    }

    if (cfg.showWings && i >= 7 && i <= 16 && i % 2 === 0) {
      const wp = Math.sin(time * 3.5 + i * 0.4) * 0.5
      const ws = size * (1.8 - Math.abs(i - 11.5) * 0.12), wd = size * 1.4
      const w1 = angle + Math.PI / 2 + wp, w2 = angle - Math.PI / 2 - wp
      ctx.globalAlpha = 0.4; ctx.font = `${ws}px "JetBrains Mono","Fira Code",monospace`
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('≺', chX[i] + Math.cos(w1) * wd, chY[i] + Math.sin(w1) * wd)
      ctx.fillText('≻', chX[i] + Math.cos(w2) * wd, chY[i] + Math.sin(w2) * wd)
    }

    ctx.save(); ctx.translate(chX[i], chY[i]); ctx.rotate(angle)
    ctx.globalAlpha = 1; ctx.font = `bold ${size}px "JetBrains Mono","Fira Code",monospace`; ctx.fillStyle = color
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(dragonChars[ci], 0, Math.sin(time * 5 + i * 0.35) * 1.5)
    if (isBreathingFire && i < 3) { ctx.globalAlpha = 0.3; ctx.fillStyle = '#ffcc00'; ctx.fillText(dragonChars[ci], 0, Math.sin(time * 5 + i * 0.35) * 1.5) }
    ctx.restore()
  }

  // Eyes
  const ha = Math.atan2(mouse.y - chY[0], mouse.x - chX[0])
  const ex = chX[0] + Math.cos(ha + 0.5) * 10, ey = chY[0] + Math.sin(ha + 0.5) * 10
  ctx.globalAlpha = isBreathingFire ? 0.2 : 0.1; ctx.fillStyle = '#ff8800'
  ctx.beginPath(); ctx.arc(ex, ey, isBreathingFire ? 18 : 12, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1; ctx.fillStyle = isBreathingFire ? '#fff' : '#ffcc00'
  ctx.font = '16px "JetBrains Mono","Fira Code",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(time % 5 > 4.7 ? '—' : isBreathingFire ? '◉' : '⊙', ex, ey)
}

// ─── Cursor ─────────────────────────────────────────────────

function drawCursor(time: number) {
  if (!cfg.showCursor) return
  const mx = mouse.x, my = mouse.y
  ctx.save()
  ctx.translate(mx, my); ctx.rotate(time * 0.4)
  ctx.globalAlpha = 0.25; ctx.strokeStyle = '#ff8844'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 0.5); ctx.stroke()
  ctx.beginPath(); ctx.arc(0, 0, 16, Math.PI, Math.PI * 1.5); ctx.stroke()
  ctx.restore()
  ctx.globalAlpha = isBreathingFire ? 0.8 : 0.5; ctx.fillStyle = isBreathingFire ? '#ffaa33' : '#ff8844'
  ctx.beginPath(); ctx.arc(mx, my, isBreathingFire ? 3 : 2, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 0.15; ctx.strokeStyle = '#ff8844'; ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(mx - 24, my); ctx.lineTo(mx - 8, my); ctx.moveTo(mx + 8, my); ctx.lineTo(mx + 24, my)
  ctx.moveTo(mx, my - 24); ctx.lineTo(mx, my - 8); ctx.moveTo(mx, my + 8); ctx.lineTo(mx, my + 24)
  ctx.stroke(); ctx.globalAlpha = 1
}

// ─── UI Panel binding ───────────────────────────────────────

const panel = document.getElementById('panel')!
const toggle = document.getElementById('panel-toggle')!
const closeBtn = document.getElementById('panel-close')!
const presetsEl = document.getElementById('presets')!
const statsEl = document.getElementById('stats')!

let panelOpen = false
function setPanelOpen(open: boolean) {
  panelOpen = open; panel.classList.toggle('open', open)
  toggle.style.display = open ? 'none' : 'flex'
}
toggle.addEventListener('click', (e) => { e.stopPropagation(); setPanelOpen(true) })
closeBtn.addEventListener('click', (e) => { e.stopPropagation(); setPanelOpen(false) })
addEventListener('keydown', (e) => {
  if ((e.key === 'p' || e.key === 'P') && !(e.target as HTMLElement).closest('input,textarea')) setPanelOpen(!panelOpen)
  if (e.key === 'Escape' && panelOpen) setPanelOpen(false)
})
panel.addEventListener('mousedown', (e) => e.stopPropagation())
panel.addEventListener('touchstart', (e) => e.stopPropagation())

for (const name of Object.keys(PRESETS)) {
  const btn = document.createElement('button')
  btn.className = 'preset-btn'; btn.textContent = name
  btn.addEventListener('click', () => {
    applyPreset(name)
    presetsEl.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
  })
  presetsEl.appendChild(btn)
}

function syncUI() {
  panel.querySelectorAll<HTMLInputElement>('input[data-key]').forEach(input => {
    const key = input.dataset.key as keyof typeof cfg
    if (input.type === 'checkbox') input.checked = cfg[key] as boolean
    else input.value = String(cfg[key])
    const v = panel.querySelector(`[data-val="${key}"]`)
    if (v) v.textContent = String(cfg[key])
  })
}

panel.querySelectorAll<HTMLInputElement>('input[data-key]').forEach(input => {
  const key = input.dataset.key as keyof typeof cfg
  const handler = () => {
    (cfg as any)[key] = input.type === 'checkbox' ? input.checked : parseFloat(input.value)
    const v = panel.querySelector(`[data-val="${key}"]`)
    if (v) v.textContent = input.type === 'checkbox' ? String(input.checked) : parseFloat(input.value).toFixed(input.step?.includes('.') ? 3 : 0)
    if (key === 'dragonSegments') rebuildDragon()
    presetsEl.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'))
  }
  input.addEventListener('input', handler); input.addEventListener('change', handler)
})
syncUI()

// ─── Main loop ──────────────────────────────────────────────

let lastTime = performance.now(), time = 0, frameCount = 0, fpsTime = 0, fps = 0

initialized = true; layoutAllText()
document.fonts.ready.then(layoutAllText)

function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now; time += dt
  frameCount++; fpsTime += dt
  if (fpsTime >= 0.5) { fps = Math.round(frameCount / fpsTime); frameCount = 0; fpsTime = 0 }
  statsEl.textContent = `${fps} fps · ${letterCount} letters · ${particleCount + emberCount} particles`

  updateShake()
  ctx.save(); ctx.translate(shakeX, shakeY)
  ctx.fillStyle = '#0c1018'; ctx.fillRect(-10, -10, W + 20, H + 20)
  drawTunnel()
  drawRunes(time)
  updateChain(); interactLetters(dt); emitFire(dt); updateParticlesAndEmbers(dt)
  drawLetters(); drawDragon(time); drawParticles(time); drawCursor(time)
  ctx.restore()

  const hint = document.getElementById('hint')
  if (hint && time > 6) hint.style.opacity = '0'

  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
