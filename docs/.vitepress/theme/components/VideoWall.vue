<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { withBase } from 'vitepress'
import { useScreenSize } from '../composables/useScreenSize'

// Detect screen size for mobile adjustments
const { isMobileOrTablet } = useScreenSize()

// discover hero video (docs/media/hero.*) if present
const videoFiles = import.meta.glob('../../../media/hero.*', { eager: true, import: 'default' })
const posterFiles = import.meta.glob('../../../media/hero.{jpg,jpeg,png}', { eager: true, import: 'default' })

const videoSrc = computed(() => Object.values(videoFiles)[0] as string | undefined)
const posterSrc = computed(() => Object.values(posterFiles)[0] as string | undefined)

const videoEl = ref<HTMLVideoElement | null>(null)
const videoMaskEl = ref<HTMLElement | null>(null)
const maskUrl = ref('')
const arrowEl = ref<HTMLElement | null>(null)
const videoLoaded = ref(false)
const videoRevealed = ref(false)
const videoInitialRevealScheduled = ref(false)
const loadingElapsed = ref(0)
const loadingPatternRetired = ref(false)
const staticAsciiLineRevealed = ref(false)
const staticAsciiLineElapsed = ref(0)
const videoActionLinksRevealed = ref(false)
const soundEnabled = ref(false)
let videoRevealTimer: number | null = null
let loadingAnimationFrame: number | null = null
let loadingPatternRetireTimer: number | null = null
let staticAsciiLineTimer: number | null = null
let staticAsciiLineFrame: number | null = null
let videoActionLinksTimer: number | null = null

const VIDEO_REVEAL_DELAY_MS = 2000
const VIDEO_FADE_MS = 850
const ASCII_FADE_MS = 520
const VIDEO_LOADING_TOTAL_MS = VIDEO_REVEAL_DELAY_MS + VIDEO_FADE_MS
const STATIC_ASCII_LINE_GROWTH_MS = 980
const LOADING_GLYPHS = ['I', '/', '\\']
const LOADING_TIMELINE_FPS = 30
const LOADING_TIMELINE_FRAME_MS = 1000 / LOADING_TIMELINE_FPS
const proceduralSeed = ref(1)

// arrow hit zone: invisible area around arrow for full video visibility
// smaller zones on mobile for easier targeting
const ARROW_HIT_ZONE_Y_BUFFER = computed(() => isMobileOrTablet.value ? 60 : 100)
const ARROW_HIT_ZONE_X_BUFFER = computed(() => isMobileOrTablet.value ? 60 : 100)
let arrowCenterX = 0
let arrowCenterY = 0

// cursor-driven density controls (0 = thin / top, 1 = full / arrow bottom)
const targetDensity = ref(0.5)
const currentDensity = ref(0.5)
let rafId: number | null = null
// pointer tracking helpers
let lastPointerY: number | null = null
// Minimum pointer move (px) required to be considered a deliberate move.
// Reduced to a smaller value so deliberate small movements are captured quickly.
const pointerMoveThreshold = 2 // tweak to taste; smaller = more responsive but may capture micro-jitter
// movement activity tracking — only animate while recently moved (ms)
let lastMoveTime = 0
const movementKeepAlive = 60 // ms to keep animating after last move; decrease to stop faster
let isPointerActive = false

// Activity blending: used to smoothly transition between deterministic (idle) and random (active) params
let activityFactor = 0 // 0 = fully deterministic, 1 = fully random
// ramp timings — smaller values = slower ramping (smoother transitions)
const ACTIVITY_RAMP_UP = 0.12 // how quickly activityFactor ramps up when pointer becomes active
const ACTIVITY_RAMP_DOWN = 0.03 // how quickly it ramps down when pointer is idle (slower = smoother) 

// Tweakable smoothing / throttling parameters (smaller smoothing → slower, gentler motion)
// Smoothing values control how quickly `currentDensity` converges to `targetDensity`.
// Smaller values = slower convergence = smoother motion. Tweak to taste.
const ACTIVE_SMOOTHING = 0.08 // smoothing while pointer is active (increased for snappier arrow zone response)
const INACTIVE_SMOOTHING = 0.01 // smoothing when idle (very small corrections)
// Throttling: 1 frame while active for smooth per-frame interpolation; keep higher when idle to save work
const ACTIVE_THROTTLE_FRAMES = 1 // how many rAF frames to wait between renders while active (1 = every frame)
const INACTIVE_THROTTLE_FRAMES = 40 // how many rAF frames to wait when idle

// How different the mapped value must be from the current target to trigger an update (prevents micro-adjustments)
const TARGET_UPDATE_THRESHOLD = 0.002 // increase to ignore smaller changes

// Vertical-stripe mask configuration (replaces previous horizontal line logic)
const NUM_STRIPES = 10 // number of vertical stripes
// Stripe width factor ranges: MIN -> very thin line, MAX -> stripes touch and reveal full video
const MIN_STRIPE_FACTOR = 0.02 // fraction of (width / NUM_STRIPES) at minimum (very thin)
const MAX_STRIPE_FACTOR = 1.0 // base fraction at maximum (stripes touch)
const GAP_SAFETY_FACTOR = 1.02 // slight overdraw at max density to ensure no gaps remain

// When pointer is above the video area (e.g., over navbar), force minimal density
const OUTSIDE_TOP_DENSITY = 0.05

// Visual tweakers removed for the old line logic; new behavior is driven by `NUM_STRIPES` and stripe factors

// Caching: prevent visible drift by reusing last mask if density didn't change
let lastMaskDensity = -1
let lastMaskUrl = ''

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function clearVideoRevealTimer() {
  if (videoRevealTimer !== null) {
    clearTimeout(videoRevealTimer)
    videoRevealTimer = null
  }
}

function clearLoadingAnimationFrame() {
  if (loadingAnimationFrame !== null) {
    cancelAnimationFrame(loadingAnimationFrame)
    loadingAnimationFrame = null
  }
}

function clearLoadingPatternRetireTimer() {
  if (loadingPatternRetireTimer !== null) {
    clearTimeout(loadingPatternRetireTimer)
    loadingPatternRetireTimer = null
  }
}

function clearVideoActionLinksTimer() {
  if (videoActionLinksTimer !== null) {
    clearTimeout(videoActionLinksTimer)
    videoActionLinksTimer = null
  }
}

function clearStaticAsciiLineTimer() {
  if (staticAsciiLineTimer !== null) {
    clearTimeout(staticAsciiLineTimer)
    staticAsciiLineTimer = null
  }
}

function clearStaticAsciiLineFrame() {
  if (staticAsciiLineFrame !== null) {
    cancelAnimationFrame(staticAsciiLineFrame)
    staticAsciiLineFrame = null
  }
}

function startStaticAsciiLineGrowth() {
  clearStaticAsciiLineFrame()
  staticAsciiLineElapsed.value = 0

  const startedAt = performance.now()
  const step = (now: number) => {
    const elapsed = now - startedAt
    staticAsciiLineElapsed.value = Math.min(STATIC_ASCII_LINE_GROWTH_MS, elapsed)

    if (elapsed < STATIC_ASCII_LINE_GROWTH_MS) {
      staticAsciiLineFrame = requestAnimationFrame(step)
    } else {
      staticAsciiLineFrame = null
    }
  }

  staticAsciiLineFrame = requestAnimationFrame(step)
}

function scheduleStaticAsciiLineReveal() {
  clearStaticAsciiLineTimer()
  clearStaticAsciiLineFrame()
  staticAsciiLineRevealed.value = false
  staticAsciiLineElapsed.value = 0
  staticAsciiLineTimer = window.setTimeout(() => {
    staticAsciiLineRevealed.value = true
    staticAsciiLineTimer = null
    startStaticAsciiLineGrowth()
  }, VIDEO_REVEAL_DELAY_MS + VIDEO_FADE_MS)
}

function scheduleVideoActionLinksReveal() {
  clearVideoActionLinksTimer()
  videoActionLinksRevealed.value = false
  videoActionLinksTimer = window.setTimeout(() => {
    videoActionLinksRevealed.value = true
    videoActionLinksTimer = null
  }, VIDEO_REVEAL_DELAY_MS + VIDEO_FADE_MS + STATIC_ASCII_LINE_GROWTH_MS + 120)
}

function startLoadingAnimation() {
  clearLoadingAnimationFrame()
  clearLoadingPatternRetireTimer()
  loadingPatternRetired.value = false
  loadingElapsed.value = 0

  const startedAt = performance.now()
  let lastCommit = startedAt
  const step = (now: number) => {
    const elapsed = now - startedAt
    if (now - lastCommit >= LOADING_TIMELINE_FRAME_MS || elapsed >= VIDEO_LOADING_TOTAL_MS) {
      loadingElapsed.value = elapsed
      lastCommit = now
    }

    if (elapsed < VIDEO_LOADING_TOTAL_MS) {
      loadingAnimationFrame = requestAnimationFrame(step)
    } else {
      loadingElapsed.value = VIDEO_LOADING_TOTAL_MS
      loadingAnimationFrame = null
      clearLoadingPatternRetireTimer()
      loadingPatternRetired.value = true
    }
  }

  loadingAnimationFrame = requestAnimationFrame(step)
}

function scheduleVideoReveal() {
  clearVideoRevealTimer()
  videoRevealed.value = false
  videoRevealTimer = window.setTimeout(() => {
    videoRevealed.value = true
    videoRevealTimer = null
  }, VIDEO_REVEAL_DELAY_MS)
}

function handleVideoReady() {
  videoLoaded.value = true

  if (videoInitialRevealScheduled.value) {
    return
  }

  videoInitialRevealScheduled.value = true
  scheduleVideoReveal()
  startLoadingAnimation()
  scheduleStaticAsciiLineReveal()
  scheduleVideoActionLinksReveal()
}

function reseedLoadingPattern() {
  proceduralSeed.value = Math.floor(Math.random() * 2147483647) + 1
}

function hashCellSeed(index: number) {
  const seed = proceduralSeed.value
  const mixedIndex = index + seed * 0.00013
  const raw = Math.sin((mixedIndex + 1) * 12.9898 + seed * 0.017) * 43758.5453
  return raw - Math.floor(raw)
}

type LoadingGlyphTone = 'red' | 'cyan' | 'neutral'

interface LoadingGlyphCell {
  id: string
  xPct: number
  yPct: number
  glyph: string
  tone: LoadingGlyphTone
  ghostCopies: boolean
  activation: number
  driftX: number
  driftY: number
  delay: number
  duration: number
  rotation: 0 | 90 | 180 | 270
}

const loadingCells = computed<LoadingGlyphCell[]>(() => {
  const count = isMobileOrTablet.value ? 220 : 400
  const cells: Array<LoadingGlyphCell & { gridX: number; gridY: number; dirX: number; dirY: number; depth: number }> = []

  type Branch = {
    x: number
    y: number
    dirX: number
    dirY: number
    life: number
    depth: number
  }

  const directions = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ] as const

  const occupied = new Set<string>()
  const keyOf = (x: number, y: number) => `${x},${y}`

  let maxAbsGridX = 1
  let maxAbsGridY = 1

  const pushPoint = (index: number, x: number, y: number, dirX: number, dirY: number, depth: number) => {
    const seed = hashCellSeed(index + depth * 19)
    const axisDominant = Math.abs(dirX) === 1
    const rotation: 0 | 90 | 180 | 270 = axisDominant
      ? (seed < 0.5 ? 90 : 270)
      : (seed < 0.5 ? 0 : 180)
    const glyph = index % 3 === 0 ? 'I' : index % 5 === 0 ? (seed < 0.5 ? '/' : '\\') : 'I'
    const tone = seed < 0.34 ? 'red' : seed < 0.67 ? 'cyan' : 'neutral'

    maxAbsGridX = Math.max(maxAbsGridX, Math.abs(x))
    maxAbsGridY = Math.max(maxAbsGridY, Math.abs(y))

    cells.push({
      id: `${index}`,
      gridX: x,
      gridY: y,
      dirX,
      dirY,
      depth,
      xPct: 50,
      yPct: 50,
      glyph,
      tone,
      ghostCopies: false,
      activation: 0,
      driftX: (seed - 0.5) * 1.2,
      driftY: ((1 - seed) - 0.5) * 1.2,
      delay: 50 + index * 6 + seed * 40,
      duration: 120 + seed * 110,
      rotation,
    })

    occupied.add(keyOf(x, y))
  }

  pushPoint(0, 0, 0, 1, 0, 0)

  const branches: Branch[] = [
    { x: 0, y: 0, dirX: 1, dirY: 0, life: 14, depth: 1 },
    { x: 0, y: 0, dirX: 0, dirY: 1, life: 12, depth: 1 },
    { x: 0, y: 0, dirX: -1, dirY: 0, life: 10, depth: 1 },
  ]

  let index = 1
  let guard = 0
  while (index < count && guard < count * 90) {
    guard++
    if (branches.length === 0) {
      const seed = hashCellSeed(index + 300)
      const dir = directions[Math.floor(seed * directions.length)]
      branches.push({ x: 0, y: 0, dirX: dir.x, dirY: dir.y, life: 9, depth: 1 })
    }

    const current = branches.shift()!
    const seed = hashCellSeed(index + current.depth * 13)
    const dirIndex = directions.findIndex(d => d.x === current.dirX && d.y === current.dirY)

    let nextDir = directions[dirIndex < 0 ? 0 : dirIndex]
    if (seed > 0.58) {
      const turn = seed > 0.82 ? 1 : -1
      nextDir = directions[(dirIndex + turn + directions.length) % directions.length]
    }

    const stepCount = seed > 0.9 ? 3 : seed > 0.64 ? 2 : 1
    let x = current.x
    let y = current.y
    let placed = 0

    for (let step = 0; step < stepCount && index < count; step++) {
      const nx = x + nextDir.x
      const ny = y + nextDir.y
      const nextKey = keyOf(nx, ny)

      if (!occupied.has(nextKey)) {
        x = nx
        y = ny
        pushPoint(index, x, y, nextDir.x, nextDir.y, current.depth)
        index++
        placed++
      } else {
        // try orthogonal detours to keep growth network-like instead of collapsing into a loop
        const left = directions[(directions.findIndex(d => d.x === nextDir.x && d.y === nextDir.y) + 1) % directions.length]
        const right = directions[(directions.findIndex(d => d.x === nextDir.x && d.y === nextDir.y) + 3) % directions.length]
        const reverse = directions[(directions.findIndex(d => d.x === nextDir.x && d.y === nextDir.y) + 2) % directions.length]
        const detourSeed = hashCellSeed(index + step * 31)
        const detourCandidates = detourSeed > 0.5
          ? [left, right, reverse]
          : [right, left, reverse]

        for (const detour of detourCandidates) {
          const dx = x + detour.x
          const dy = y + detour.y
          const detourKey = keyOf(dx, dy)
          if (!occupied.has(detourKey)) {
            x = dx
            y = dy
            nextDir = detour
            pushPoint(index, x, y, nextDir.x, nextDir.y, current.depth)
            index++
            placed++
            break
          }
        }
      }
    }

    if (placed > 0 && index < count) {
      // continue trunk with updated heading
      if (current.life > 1) {
        branches.push({
          x,
          y,
          dirX: nextDir.x,
          dirY: nextDir.y,
          life: current.life - 1,
          depth: current.depth + 1,
        })
      }

      // spawn side branches with varying cadence so pattern feels rhizome-like
      const splitSeed = hashCellSeed(index + current.depth * 7)
      if (splitSeed > 0.36 && branches.length < 30) {
        const leftDir = directions[(directions.findIndex(d => d.x === nextDir.x && d.y === nextDir.y) + 1) % directions.length]
        branches.push({ x, y, dirX: leftDir.x, dirY: leftDir.y, life: 4 + Math.floor(splitSeed * 8), depth: current.depth + 1 })
      }
      if (splitSeed > 0.7 && branches.length < 34) {
        const rightDir = directions[(directions.findIndex(d => d.x === nextDir.x && d.y === nextDir.y) + 3) % directions.length]
        branches.push({ x, y, dirX: rightDir.x, dirY: rightDir.y, life: 3 + Math.floor(splitSeed * 6), depth: current.depth + 1 })
      }

      // occasional local block fill to create dense technological nodes
      const hubSeed = hashCellSeed(index + current.depth * 29)
      if (hubSeed > 0.56) {
        const hubOffsets = [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ]
        for (const off of hubOffsets) {
          if (index >= count) break
          const hx = x + off.x
          const hy = y + off.y
          const hubKey = keyOf(hx, hy)
          if (!occupied.has(hubKey) && hashCellSeed(index + hx * 3 + hy * 5) > 0.3) {
            pushPoint(index, hx, hy, off.x, off.y, current.depth + 1)
            index++
          }
        }
      }
    } else if (index < count && current.life > 1) {
      // Keep difficult branches alive with a forced turn so collisions don't prematurely cap total shapes.
      const turnSeed = hashCellSeed(index + current.depth * 43)
      const fallbackTurn = turnSeed > 0.5 ? 1 : -1
      const fallbackDir = directions[(dirIndex + fallbackTurn + directions.length) % directions.length]
      branches.push({
        x: current.x,
        y: current.y,
        dirX: fallbackDir.x,
        dirY: fallbackDir.y,
        life: current.life - 1,
        depth: current.depth + 1,
      })
    }
  }

  const pickCandidateForSide = (side: 'left' | 'right' | 'top' | 'bottom', seedOffset: number) => {
    if (cells.length === 0) return null
    const ranked = [...cells].sort((a, b) => {
      if (side === 'left') return a.gridX - b.gridX
      if (side === 'right') return b.gridX - a.gridX
      if (side === 'top') return a.gridY - b.gridY
      return b.gridY - a.gridY
    })
    const poolSize = Math.max(1, Math.floor(ranked.length * 0.14))
    const seed = hashCellSeed(seedOffset)
    const pick = Math.floor(seed * poolSize)
    return ranked[Math.min(pick, ranked.length - 1)]
  }

  const buildEdgeTendril = (side: 'left' | 'right' | 'top' | 'bottom', seedOffset: number) => {
    if (index >= count) return

    const candidate = pickCandidateForSide(side, seedOffset)
    if (!candidate) return

    let x = candidate.gridX
    let y = candidate.gridY
    let dirX = side === 'left' ? -1 : side === 'right' ? 1 : 0
    let dirY = side === 'top' ? -1 : side === 'bottom' ? 1 : 0
    let depth = candidate.depth + 1
    const seed = hashCellSeed(seedOffset + 211)
    const length = Math.floor((isMobileOrTablet.value ? 12 : 18) + seed * (isMobileOrTablet.value ? 14 : 24))

    for (let step = 0; step < length && index < count; step++) {
      const jitter = hashCellSeed(seedOffset + step * 17)
      if (jitter > 0.87) {
        const turnLeft = jitter > 0.92
        if (dirX !== 0) {
          dirY = turnLeft ? 1 : -1
          dirX = 0
        } else {
          dirX = turnLeft ? 1 : -1
          dirY = 0
        }
      }

      let nx = x + dirX
      let ny = y + dirY
      let nextKey = keyOf(nx, ny)

      if (occupied.has(nextKey)) {
        const alternatives = dirX !== 0
          ? [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: dirX, y: 0 }]
          : [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: dirY }]

        let placed = false
        for (const alt of alternatives) {
          const ax = x + alt.x
          const ay = y + alt.y
          const altKey = keyOf(ax, ay)
          if (!occupied.has(altKey)) {
            nx = ax
            ny = ay
            dirX = alt.x
            dirY = alt.y
            nextKey = altKey
            placed = true
            break
          }
        }
        if (!placed) break
      }

      x = nx
      y = ny
      pushPoint(index, x, y, dirX, dirY, depth)
      index++
      depth++
    }
  }

  // Procedurally target 1..4 boundary sides per run.
  // Selected sides always get at least one tendril; additional tendrils create multiple touch points.
  const allSides: Array<'left' | 'right' | 'top' | 'bottom'> = ['left', 'right', 'top', 'bottom']
  const shuffledSides = [...allSides].sort((a, b) => {
    const sa = hashCellSeed(1200 + allSides.indexOf(a) * 71)
    const sb = hashCellSeed(1200 + allSides.indexOf(b) * 71)
    return sa - sb
  })
  const sideCount = 1 + Math.floor(hashCellSeed(1301) * 4) // 1..4
  const selectedSides = shuffledSides.slice(0, sideCount)

  const tendrilCount = isMobileOrTablet.value ? 10 : 18
  const sideTendrils = new Map<'left' | 'right' | 'top' | 'bottom', number>()

  for (const side of selectedSides) {
    sideTendrils.set(side, 1)
  }

  let remainingTendrils = Math.max(0, tendrilCount - selectedSides.length)
  while (remainingTendrils > 0 && selectedSides.length > 0) {
    const pickSeed = hashCellSeed(1400 + remainingTendrils * 29)
    const side = selectedSides[Math.floor(pickSeed * selectedSides.length)]
    sideTendrils.set(side, (sideTendrils.get(side) ?? 0) + 1)
    remainingTendrils--
  }

  // For the 2-side case, bias extra touches to emphasize multiple boundary contact points.
  if (selectedSides.length === 2) {
    const favored = selectedSides[Math.floor(hashCellSeed(1507) * 2)]
    sideTendrils.set(favored, (sideTendrils.get(favored) ?? 1) + 1)
  }

  let tendrilSeedCursor = 500
  for (const side of selectedSides) {
    const amount = sideTendrils.get(side) ?? 0
    for (let t = 0; t < amount && index < count; t++) {
      buildEdgeTendril(side, tendrilSeedCursor)
      tendrilSeedCursor += 37
    }
  }

  const edgePadding = isMobileOrTablet.value ? 0.04 : 0.03
  const xSpread = 0.5 - edgePadding
  const ySpread = 0.5 - edgePadding

  const maxDepth = Math.max(...cells.map(cell => cell.depth), 1)

  return cells.map((cell, index) => {
    const normalizedX = 0.5 + (cell.gridX / maxAbsGridX) * xSpread
    const normalizedY = 0.5 + (cell.gridY / maxAbsGridY) * ySpread
    const progress = index / Math.max(1, count - 1)
    const revealProgress = Math.pow(progress, 2.15)
    const seed = hashCellSeed(index + 97)
    const centerDistance = (Math.abs(cell.gridX) / maxAbsGridX + Math.abs(cell.gridY) / maxAbsGridY) * 0.5
    const depthFactor = cell.depth / maxDepth

    return {
      id: cell.id,
      xPct: clamp(normalizedX, 0.03, 0.97) * 100,
      yPct: clamp(normalizedY, 0.03, 0.97) * 100,
      glyph: cell.glyph,
      tone: cell.tone,
      ghostCopies: hashCellSeed(index + 3001) > 0.58,
      activation: index === 0
        ? 0
        : Math.min(0.995, Math.max(0.01, 0.02 + Math.pow(centerDistance, 1.16) * 0 + depthFactor * 0.07 + seed * 0.03)),
      driftX: cell.driftX,
      driftY: cell.driftY,
      delay: cell.delay + revealProgress * 210 + depthFactor * 140 + seed * 90,
      duration: cell.duration,
      rotation: cell.rotation,
    }
  })
})

const loadingGrowthCurve = computed(() => {
  const revealProgress = clamp(loadingElapsed.value / VIDEO_REVEAL_DELAY_MS, 0, 1)
  return revealProgress < 0.68
    ? Math.pow(revealProgress / 0.68, 4.2) * 0.16
    : 0.16 + Math.pow((revealProgress - 0.68) / 0.32, 1.08) * 0.84
})

const loadingPatternStyle = computed(() => ({
  opacity: '1',
  '--loading-progress': clamp(loadingElapsed.value / VIDEO_LOADING_TOTAL_MS, 0, 1).toString(),
  '--loading-growth': loadingGrowthCurve.value.toString(),
}))

interface StaticAsciiLineCell {
  id: string
  glyph: string
  tone: LoadingGlyphTone
  ghostCopies: boolean
  activation: number
  spawnThreshold: number
  rotationDeg: 0 | 90
}

const staticAsciiLineCells = computed<StaticAsciiLineCell[]>(() => {
  const count = isMobileOrTablet.value ? 70 : 136
  const cells: StaticAsciiLineCell[] = []

  for (let i = 0; i < count; i++) {
    const seed = hashCellSeed(9000 + i)
    const progress = i / Math.max(1, count - 1)
    const segmentSeed = hashCellSeed(9800 + Math.floor(i / 10))
    const localSeed = hashCellSeed(9850 + i)
    const activation = clamp(progress * 0.95 + segmentSeed * 0.035 + localSeed * 0.015 - 0.025, 0, 1)
    const lineStyleSeed = hashCellSeed(9900 + Math.floor(i / 8))
    const symbolSeed = hashCellSeed(9950 + i)
    const spawnSeed = hashCellSeed(9960 + i * 3)
    const rotationDeg: 0 | 90 = lineStyleSeed > 0.52 ? 90 : 0
    let glyph = 'I'
    if (symbolSeed > 0.88) glyph = '/'
    else if (symbolSeed > 0.76) glyph = '\\'

    cells.push({
      id: `line-${i}`,
      glyph,
      tone: seed < 0.34 ? 'red' : seed < 0.67 ? 'cyan' : 'neutral',
      ghostCopies: hashCellSeed(10200 + i) > 0.7,
      activation,
      spawnThreshold: clamp(progress * 0.86 + spawnSeed * 0.22 - 0.06, 0, 1),
      rotationDeg,
    })
  }

  return cells
})

const staticAsciiLineGrowthCurve = computed(() => {
  const p = clamp(staticAsciiLineElapsed.value / STATIC_ASCII_LINE_GROWTH_MS, 0, 1)
  return p < 0.72
    ? Math.pow(p / 0.72, 2.9) * 0.28
    : 0.28 + Math.pow((p - 0.72) / 0.28, 1.05) * 0.72
})

const staticAsciiSpawnProgress = computed(() => {
  const p = clamp(staticAsciiLineElapsed.value / STATIC_ASCII_LINE_GROWTH_MS, 0, 1)
  return p < 0.75
    ? Math.pow(p / 0.75, 2.6) * 0.45
    : 0.45 + Math.pow((p - 0.75) / 0.25, 1.05) * 0.55
})

const staticAsciiLineActiveCells = computed(() => {
  const spawn = staticAsciiSpawnProgress.value
  return staticAsciiLineCells.value.filter(cell => spawn >= cell.spawnThreshold)
})

const staticAsciiLineStyle = computed(() => ({
  '--line-growth': staticAsciiLineGrowthCurve.value.toString(),
}))

const staticAsciiConcealment = computed(() => clamp(1 - currentDensity.value, 0, 1))

interface StaticAsciiRiseCell {
  id: string
  glyph: string
  tone: LoadingGlyphTone
  ghostCopies: boolean
  xPct: number
  yPx: number
  threshold: number
  spawnThreshold: number
}

const staticAsciiRiseCells = computed<StaticAsciiRiseCell[]>(() => {
  const cols = isMobileOrTablet.value ? 70 : 136
  const maxRows = isMobileOrTablet.value ? 17 : 28
  const cells: StaticAsciiRiseCell[] = []

  for (let col = 0; col < cols; col++) {
    const colSeed = hashCellSeed(11000 + col)
    const xPct = (col / Math.max(1, cols - 1)) * 100
    const normX = col / Math.max(1, cols - 1)
    const centerDistance = Math.abs(normX * 2 - 1)
    // Smooth bell-like profile: 1 at center, 0 at edges.
    const centerWeight = Math.pow(Math.cos((Math.PI * centerDistance) / 2), 1.2)
    const branchHeight = Math.floor((2 + colSeed * maxRows) * centerWeight)
    if (branchHeight <= 0) continue
    const branchNoise = hashCellSeed(11100 + col)

    for (let row = 1; row <= branchHeight; row++) {
      const rowSeed = hashCellSeed(11200 + col * 41 + row * 13)
      const segmentBias = row / Math.max(1, branchHeight)
      const sideFillPenalty = centerDistance * 0.18
      const shouldPlace = row <= 2 || rowSeed > 0.42 + sideFillPenalty - segmentBias * 0.16
      if (!shouldPlace) continue

      const threshold = clamp(
        0.05 + segmentBias * 0.78 + branchNoise * 0.12,
        0,
        1
      )
      const spawnThreshold = clamp(
        0.08 + Math.pow(row / Math.max(1, branchHeight), 1.05) * 0.7 + hashCellSeed(11400 + col * 17 + row) * 0.16,
        0,
        1
      )

      cells.push({
        id: `rise-${col}-${row}`,
        glyph: rowSeed > 0.87 ? (rowSeed > 0.94 ? '/' : '\\') : 'I',
        tone: rowSeed < 0.34 ? 'red' : rowSeed < 0.67 ? 'cyan' : 'neutral',
        ghostCopies: hashCellSeed(11300 + col * 31 + row) > 0.72,
        xPct,
        yPx: row * (isMobileOrTablet.value ? 8 : 9),
        threshold,
        spawnThreshold,
      })
    }
  }

  return cells
})

const staticRiseStripeFactor = computed(() => {
  const factor = clamp(currentDensity.value, 0, 1)
  return MIN_STRIPE_FACTOR * (1 - factor) + MAX_STRIPE_FACTOR * factor
})

function isInRiseGapLane(rightHalfXPct: number) {
  const fullX = 0.5 + (rightHalfXPct / 100) * 0.5
  const stripeBase = 1 / NUM_STRIPES
  const overdraw = currentDensity.value > 0.98 ? GAP_SAFETY_FACTOR : 1
  const stripeWidth = stripeBase * staticRiseStripeFactor.value * overdraw
  const gapWidth = stripeBase - stripeWidth
  if (gapWidth <= 0.0005) return false

  const stripeIndex = Math.min(NUM_STRIPES - 1, Math.max(0, Math.floor(fullX / stripeBase)))
  const stripeCenter = (stripeIndex + 0.5) * stripeBase
  const distanceToStripe = Math.abs(fullX - stripeCenter)
  const keepOut = stripeWidth * 0.5 + 0.0015

  return distanceToStripe > keepOut
}

const staticAsciiRiseActiveCells = computed(() => {
  const concealment = staticAsciiConcealment.value
  const spawn = staticAsciiSpawnProgress.value
  return staticAsciiRiseCells.value.filter(cell => spawn >= cell.spawnThreshold && concealment >= cell.threshold && isInRiseGapLane(cell.xPct))
})

function getLoadingGlyphStyle(cell: LoadingGlyphCell) {
  const baseOpacity = clamp((loadingGrowthCurve.value - cell.activation) / 0.022, 0, 1)
  const retreatProgress = loadingElapsed.value <= VIDEO_REVEAL_DELAY_MS
    ? 0
    : clamp((loadingElapsed.value - VIDEO_REVEAL_DELAY_MS) / (ASCII_FADE_MS * 0.42), 0, 1)
  const retreatScale = loadingElapsed.value <= VIDEO_REVEAL_DELAY_MS
    ? 1
    : Math.pow(1 - retreatProgress, 3.2)

  return {
    '--cell-activation': cell.activation.toString(),
    opacity: (baseOpacity * (loadingElapsed.value <= VIDEO_REVEAL_DELAY_MS ? 1 : Math.pow(1 - retreatProgress, 4.4))).toString(),
    left: `${cell.xPct}%`,
    top: `${cell.yPct}%`,
    animationDelay: `${cell.delay}ms`,
    animationDuration: `${cell.duration}ms`,
    transform: `translate(-50%, -50%) translate(${cell.driftX}px, ${cell.driftY}px) rotate(${cell.rotation}deg) scale(${retreatScale})`,
  }
}

function toggleSound() {
  if (!videoEl.value) return
  const nextMuted = !videoEl.value.muted
  videoEl.value.muted = nextMuted
  soundEnabled.value = !nextMuted

  if (soundEnabled.value) {
    videoEl.value.play().catch(() => {})
  }
}

function goToProject() {
  if (typeof window !== 'undefined') {
    window.location.assign(withBase('/installations/?id=Impacts'))
  }
}

// check if cursor is within the rectangular hit zone around the arrow
// simpler rectangular logic ensures consistent triggering from any direction
function isInArrowHitZone(clientX: number, clientY: number): boolean {
  // if arrow position is not set yet, do not trigger
  if (arrowCenterX === 0 && arrowCenterY === 0) return false

  const distX = Math.abs(clientX - arrowCenterX)
  const distY = Math.abs(clientY - arrowCenterY)
  
  const inZone = distX <= ARROW_HIT_ZONE_X_BUFFER.value && distY <= ARROW_HIT_ZONE_Y_BUFFER.value
  
  // Debug logging to see what's happening
  if (inZone || (distX < ARROW_HIT_ZONE_X_BUFFER.value * 1.5 && distY < ARROW_HIT_ZONE_Y_BUFFER.value * 1.5)) {
  }
  
  // rectangular zone: within X and Y buffers = fully open
  return inZone
}

// expose method to allow parent to set arrow position
function setArrowCenter(x: number, y: number) {
  arrowCenterX = x
  arrowCenterY = y
}

// Expose method to parent component
defineExpose({
  setArrowCenter
})

let densityTick = 0
function startDensityLoop() {
  if (rafId !== null) return
  function step() {
    densityTick++

    const now = performance.now()
    const diff = Math.abs(targetDensity.value - currentDensity.value)

    // while pointer is active, use a much smaller smoothing to slow motion; otherwise tiny corrections
    const smoothing = isPointerActive ? ACTIVE_SMOOTHING : INACTIVE_SMOOTHING
    currentDensity.value += (targetDensity.value - currentDensity.value) * smoothing

    // ramp activityFactor smoothly so parameters transition gracefully
    if (isPointerActive) {
      activityFactor = Math.min(1, activityFactor + ACTIVITY_RAMP_UP)
    } else {
      activityFactor = Math.max(0, activityFactor - ACTIVITY_RAMP_DOWN)
    }

    // throttle frequency: less frequent even while moving for a more deliberate feel
    const throttleFrames = isPointerActive ? ACTIVE_THROTTLE_FRAMES : INACTIVE_THROTTLE_FRAMES
    if (densityTick % throttleFrames === 0 || diff > TARGET_UPDATE_THRESHOLD) {
      generateMask(currentDensity.value)
      densityTick = 0
    }

    // stop animating shortly after movement stops
    if (!isPointerActive && now - lastMoveTime > movementKeepAlive) {
      // freeze at currentDensity; do a final gentle deterministic render
      generateMask(currentDensity.value, true)
      rafId = null
      return
    }

    // continue until explicitly stopped or until close enough when not active
    if (diff > 0.00005 || isPointerActive) {
      rafId = requestAnimationFrame(step)
    } else {
      // force deterministic final render to avoid post-stop jitter
      generateMask(targetDensity.value, true)
      rafId = null
    }
  }
  rafId = requestAnimationFrame(step)
}    

function stopDensityLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

onMounted(() => {
  reseedLoadingPattern()

  // attempt to autoplay (muted) on mount and ensure loop behavior
  if (videoEl.value) {
    videoEl.value.muted = true
    soundEnabled.value = false
    videoEl.value.loop = true

    const onEnded = () => {
      if (!videoEl.value) return
      try {
        videoEl.value.currentTime = 0
        videoEl.value.play().catch(() => {})
      } catch (e) {}
    }
    
    const onCanPlay = () => {
      handleVideoReady()
    }
    
    videoEl.value.addEventListener('ended', onEnded)
    videoEl.value.addEventListener('canplay', onCanPlay)

    videoEl.value.play().catch(() => {
      // autoplay failed silently (user gesture required)
    })

    if (videoEl.value.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      handleVideoReady()
    }

    // cleanup on unmount
    onUnmounted(() => {
      if (videoEl.value) {
        videoEl.value.removeEventListener('ended', onEnded)
        videoEl.value.removeEventListener('canplay', onCanPlay)
      }
      clearVideoRevealTimer()
      clearLoadingAnimationFrame()
      clearVideoActionLinksTimer()
      clearStaticAsciiLineTimer()
      clearStaticAsciiLineFrame()
    })
  }

  // generate the dynamic mask and keep it responsive
  nextTick(() => {
    // initial mask (force deterministic initial render)
    generateMask(currentDensity.value, true)

    // keep mask responsive on resize (force a regenerate so sizing updates correctly)
    const onResize = () => generateMask(currentDensity.value, true) 
    window.addEventListener('resize', onResize)

    // pointer/touch handling: map vertical position (Y-axis) to density
    // map cursor Y to density: top of video (0) = thin stripes, down to arrow (1) = full video
    // also check if cursor is in arrow hit zone for immediate full visibility
    const onPointerMove = (e: PointerEvent) => {
      const el = videoMaskEl.value
      if (!el) return
      const r = el.getBoundingClientRect()
      
      // check arrow hit zone first (works anywhere on page but only near arrow Y)
      if (isInArrowHitZone(e.clientX, e.clientY)) {
        targetDensity.value = 1
        lastMoveTime = performance.now()
        isPointerActive = true
        activityFactor = Math.min(1, activityFactor + ACTIVITY_RAMP_UP)
        startDensityLoop()
        return
      }

      // if cursor is above the video area, force minimal density
      if (e.clientY < r.top) {
        targetDensity.value = OUTSIDE_TOP_DENSITY
        lastMoveTime = performance.now()
        isPointerActive = true
        activityFactor = Math.max(0, activityFactor - ACTIVITY_RAMP_DOWN)
        startDensityLoop()
        return
      }
      
      // only process Y-axis mapping when cursor is strictly inside video bounds
      if (e.clientX < r.left || e.clientX > r.right || e.clientY > r.bottom) return
      
      const clientYInside = e.clientY - r.top
      // deadzone: ignore tiny moves
      if (lastPointerY !== null && Math.abs(clientYInside - lastPointerY) < pointerMoveThreshold) return
      lastPointerY = clientYInside
      // map Y from top (0) to bottom (full height) = 0 to 1 density
      const y = clamp(clientYInside / r.height)
      const mapped = y
      // mark active movement and remember timestamp
      lastMoveTime = performance.now()
      isPointerActive = true
      // nudge activity toward active (avoids abrupt instant activity)
      activityFactor = Math.min(1, activityFactor + ACTIVITY_RAMP_UP)
      // update target density only; `currentDensity` will interpolate smoothly inside the loop
      targetDensity.value = mapped
      // info log for visibility
      // ensure the loop is running to continue rendering while moving
      startDensityLoop()
    }

    const onPointerLeave = () => {
      // stop animating when leaving; do not return to center automatically
      isPointerActive = false
      lastPointerY = null
      lastMoveTime = performance.now()
      // stopDensityLoop will be triggered by the loop when it detects inactivity
    }

    const onTouchMove = (e: TouchEvent) => {
      const el = videoMaskEl.value
      if (!el) return
      const touch = e.touches[0]
      if (!touch) return
      
      // check arrow hit zone first
      if (isInArrowHitZone(touch.clientX, touch.clientY)) {
        targetDensity.value = 1
        lastMoveTime = performance.now()
        isPointerActive = true
        activityFactor = Math.min(1, activityFactor + ACTIVITY_RAMP_UP)
        startDensityLoop()
        return
      }
      
      const r = el.getBoundingClientRect()
      // if touch is above the video area, force minimal density
      if (touch.clientY < r.top) {
        targetDensity.value = OUTSIDE_TOP_DENSITY
        lastMoveTime = performance.now()
        isPointerActive = true
        activityFactor = Math.max(0, activityFactor - ACTIVITY_RAMP_DOWN)
        startDensityLoop()
        return
      }

      const clientYInside = touch.clientY - r.top
      if (lastPointerY !== null && Math.abs(clientYInside - lastPointerY) < pointerMoveThreshold) return
      lastPointerY = clientYInside
      const y = clamp(clientYInside / r.height)
      const mapped = y
      // mark active movement
      lastMoveTime = performance.now()
      isPointerActive = true
      activityFactor = Math.min(1, activityFactor + ACTIVITY_RAMP_UP)
      targetDensity.value = mapped
      startDensityLoop()
    }

    // attach listeners to the mask container
    videoMaskEl.value?.addEventListener('pointermove', onPointerMove)
    videoMaskEl.value?.addEventListener('pointerleave', onPointerLeave)
    videoMaskEl.value?.addEventListener('touchmove', onTouchMove)
    videoMaskEl.value?.addEventListener('touchend', onPointerLeave)

    const onClick = (ev: MouseEvent) => {
      const el = videoMaskEl.value
      if (!el) return
      const r = el.getBoundingClientRect()
      const clientYInside = ev.clientY - r.top
      const y = clamp(clientYInside / r.height)
      const mapped = y
      targetDensity.value = mapped
      generateMask(mapped, true)
      startDensityLoop()
    }
    videoMaskEl.value?.addEventListener('click', onClick)

    // additionally, attach to window so we capture movement even when the video element intercepts events
    const onWindowPointerMove = (e: PointerEvent) => {
      const el = videoMaskEl.value
      if (!el) return
      const r = el.getBoundingClientRect()
      
      // check arrow hit zone first (works anywhere on page but only near arrow Y)
      if (isInArrowHitZone(e.clientX, e.clientY)) {
        targetDensity.value = 1
        lastMoveTime = performance.now()
        isPointerActive = true
        activityFactor = Math.min(1, activityFactor + ACTIVITY_RAMP_UP)
        startDensityLoop()
        return
      }
      
      // if cursor is above the video area, force minimal density
      if (e.clientY < r.top) {
        targetDensity.value = OUTSIDE_TOP_DENSITY
        lastMoveTime = performance.now()
        isPointerActive = true
        activityFactor = Math.max(0, activityFactor - ACTIVITY_RAMP_DOWN)
        startDensityLoop()
        return
      }

      // only consider positions inside the video element bounds for Y-based calculation
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return
      const clientYInside = e.clientY - r.top
      if (lastPointerY !== null && Math.abs(clientYInside - lastPointerY) < pointerMoveThreshold) return
      lastPointerY = clientYInside
      const y = clamp(clientYInside / r.height)
      // map element height to density (top=0 -> bottom=1)
      const mapped = y
      // mark active movement
      lastMoveTime = performance.now()
      isPointerActive = true
      activityFactor = Math.min(1, activityFactor + ACTIVITY_RAMP_UP)
      targetDensity.value = mapped
      startDensityLoop()
    }

    const onWindowTouchMove = (e: TouchEvent) => {
      const el = videoMaskEl.value
      if (!el) return
      const touch = e.touches[0]
      if (!touch) return
      
      // check arrow hit zone first (works anywhere on page)
      if (isInArrowHitZone(touch.clientX, touch.clientY)) {
        targetDensity.value = 1
        lastMoveTime = performance.now()
        isPointerActive = true
        activityFactor = Math.min(1, activityFactor + ACTIVITY_RAMP_UP)
        startDensityLoop()
        return
      }
      
      const r = el.getBoundingClientRect()
      // if touch is above the video area, force minimal density
      if (touch.clientY < r.top) {
        targetDensity.value = OUTSIDE_TOP_DENSITY
        lastMoveTime = performance.now()
        isPointerActive = true
        activityFactor = Math.max(0, activityFactor - ACTIVITY_RAMP_DOWN)
        startDensityLoop()
        return
      }

      if (touch.clientX < r.left || touch.clientX > r.right || touch.clientY < r.top || touch.clientY > r.bottom) return
      const clientYInside = touch.clientY - r.top
      if (lastPointerY !== null && Math.abs(clientYInside - lastPointerY) < pointerMoveThreshold) return
      lastPointerY = clientYInside
      const y = clamp(clientYInside / r.height)
      const mapped = y
      // mark active movement
      lastMoveTime = performance.now()
      isPointerActive = true
      activityFactor = Math.min(1, activityFactor + ACTIVITY_RAMP_UP)
      targetDensity.value = mapped
      startDensityLoop()
    }

    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('touchmove', onWindowTouchMove)


    onUnmounted(() => {
      window.removeEventListener('resize', onResize)
      videoMaskEl.value?.removeEventListener('pointermove', onPointerMove)
      videoMaskEl.value?.removeEventListener('pointerleave', onPointerLeave)
      videoMaskEl.value?.removeEventListener('touchmove', onTouchMove)
      videoMaskEl.value?.removeEventListener('touchend', onPointerLeave)
      videoMaskEl.value?.removeEventListener('click', onClick)
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('touchmove', onWindowTouchMove)
      stopDensityLoop()
      clearLoadingPatternRetireTimer()
    })
  })
})

onUnmounted(() => {
  clearLoadingPatternRetireTimer()
  clearVideoActionLinksTimer()
  clearStaticAsciiLineTimer()
  clearStaticAsciiLineFrame()
})

// if the source changes, re-apply loop and try to play
watch(videoSrc, (val) => {
  reseedLoadingPattern()
  if (videoEl.value && val) {
    videoEl.value.loop = true
    videoInitialRevealScheduled.value = false
    videoRevealed.value = false
    staticAsciiLineRevealed.value = false
    staticAsciiLineElapsed.value = 0
    videoLoaded.value = false
    loadingElapsed.value = 0
    loadingPatternRetired.value = false
    videoActionLinksRevealed.value = false
    clearVideoRevealTimer()
    clearLoadingAnimationFrame()
    clearLoadingPatternRetireTimer()
    clearVideoActionLinksTimer()
    clearStaticAsciiLineTimer()
    clearStaticAsciiLineFrame()
    videoEl.value.play().catch(() => {})
    if (videoEl.value.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      handleVideoReady()
    }
  }
  // regenerate mask when source changes (force deterministic regenerate)
  generateMask(currentDensity.value, true)
})


function generateMask(density = 0.5, force = false) {
  // density: 0 (thin stripes) -> 1 (stripes touch and reveal entire video)
  // short-circuit to reuse last mask if density hasn't meaningfully changed (prevents unnecessary work)
  if (!force && lastMaskUrl && Math.abs(density - lastMaskDensity) < TARGET_UPDATE_THRESHOLD) {
    maskUrl.value = lastMaskUrl
    return
  }

  const el = videoMaskEl.value
  const width = Math.max(800, Math.round(el?.clientWidth ?? 1400))
  const height = Math.max(360, Math.round(el?.clientHeight ?? 640))
  const left = 0
  const right = width

  // compute stripe base and dynamic width
  const stripeBase = (right - left) / NUM_STRIPES
  const factor = clamp(density, 0, 1)
  // interpolate between min and max stripe factors
  const stripeFactor = MIN_STRIPE_FACTOR * (1 - factor) + MAX_STRIPE_FACTOR * factor
  // apply slight overdraw near max density to eliminate gaps at the sweet spot
  const overdraw = factor > 0.98 ? GAP_SAFETY_FACTOR : 1
  const stripeWidth = Math.max(1, stripeBase * stripeFactor * overdraw)

    // calculate corner rounding: more rounded when thin, less when wide
    // when density=0 (thin): rx = stripeWidth/2 (fully rounded ends like a pill)
    // when density=1 (wide): rx approaches 0 (sharp corners)
    const maxRounding = stripeWidth / 2 // maximum rounding (creates pill shape)
    const minRounding = 2 // minimum rounding when fully wide (slight softness)
    // inverse relationship: as density increases, rounding decreases
    const cornerRadius = lerp(maxRounding, minRounding, factor)

    // Taper stripe heights toward the edges when stripes are thin.
    // Middle stripes stay full height; taper vanishes as density increases.
    const minHeightScale = 0.35 // how short the outermost stripes can get (35% of full height)
    const taperStrength = 1 - factor // stronger taper when density is low (thin stripes)
    const centerIndex = (NUM_STRIPES - 1) / 2
    const maxDistFromCenter = Math.max(centerIndex, 1)

  const svgParts: string[] = []
  svgParts.push(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}' preserveAspectRatio='none'>`)

  // draw vertical filled stripes (white reveals video through the mask)
  for (let i = 0; i < NUM_STRIPES; i++) {
    const cx = left + stripeBase * (i + 0.5)
    const x = cx - stripeWidth / 2
      const distFromCenter = Math.abs(i - centerIndex)
      const distNorm = distFromCenter / maxDistFromCenter
      const heightScale = 1 - taperStrength * distNorm * (1 - minHeightScale)
      const stripeHeight = height * heightScale
      const y = (height - stripeHeight) / 2

      svgParts.push(`<rect x='${x}' y='${y}' width='${stripeWidth}' height='${stripeHeight}' rx='${cornerRadius}' fill='white' />`)
  }

  svgParts.push('</svg>')
  const svg = svgParts.join('')

  // encode & set as CSS variable value (url(...))
  maskUrl.value = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`

  // cache last generated mask so repeated calls with same density are no-ops
  lastMaskDensity = density
  lastMaskUrl = maskUrl.value

  // apply mask to element for cross-browser repaint
  if (el) {
    try {
      (el as HTMLElement).style.webkitMaskImage = maskUrl.value
      (el as HTMLElement).style.maskImage = maskUrl.value
    } catch (e) {}
  }
}

</script>

<template>
  <div class="video-wall full-bleed relative">
    <!-- subtle shadow shape behind the masked video -->
 

    <template v-if="videoSrc">
      <div
        v-if="videoLoaded && !loadingPatternRetired"
        class="video-loading-pattern"
        :style="loadingPatternStyle"
        aria-hidden="true"
      >
        <span
          v-for="cell in loadingCells"
          :key="cell.id"
          class="video-loading-glyph"
          :class="[`video-loading-glyph--${cell.tone}`, { 'video-loading-glyph--ghost': cell.ghostCopies }]"
          :data-glyph="cell.glyph"
          :style="getLoadingGlyphStyle(cell)"
        >
          {{ cell.glyph }}
        </span>
      </div>

      <div ref="videoMaskEl" :style="{'--mask-url': maskUrl}" class="video-mask relative overflow-hidden" :class="{ 'video-loaded': videoLoaded, 'video-revealed': videoRevealed }">

        <video
          ref="videoEl"
          :src="videoSrc"
          :poster="posterSrc"
          autoplay
          muted
          playsinline
          webkit-playsinline
          loop
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload noremoteplayback nofullscreen"
          @contextmenu.prevent
          class="video-element absolute inset-0"
        >
          Your browser does not support the video tag.
        </video>
      </div>

      <div
        v-if="videoLoaded"
        class="video-static-line"
        :class="{ 'video-static-line--revealed': staticAsciiLineRevealed }"
        :style="staticAsciiLineStyle"
        aria-hidden="true"
      >
        <span class="video-static-line-track">
          <span class="video-static-line-bar"></span>
        </span>
      </div>

      <div
        v-if="videoLoaded"
        class="video-static-line video-static-line--top-left"
        :class="{ 'video-static-line--revealed': staticAsciiLineRevealed }"
        :style="staticAsciiLineStyle"
        aria-hidden="true"
      >
        <span class="video-static-line-track">
          <span class="video-static-line-bar"></span>
        </span>
      </div>

      <div
        v-if="videoLoaded"
        class="video-static-line-vertical video-static-line-vertical--top-left"
        :class="{ 'video-static-line-vertical--revealed': staticAsciiLineRevealed }"
        :style="staticAsciiLineStyle"
        aria-hidden="true"
      >
        <span class="video-static-line-vertical-track">
          <span class="video-static-line-vertical-bar"></span>
        </span>
      </div>

      <div
        v-if="videoLoaded && staticAsciiLineRevealed"
        class="video-static-rise"
        aria-hidden="true"
      >
        <span
          v-for="cell in staticAsciiRiseActiveCells"
          :key="cell.id"
          class="video-static-rise-glyph"
          :class="[
            `video-static-rise-glyph--${cell.tone}`,
            { 'video-static-rise-glyph--ghost': cell.ghostCopies }
          ]"
          :data-glyph="cell.glyph"
          :style="{
            left: `${cell.xPct}%`,
            bottom: `${cell.yPx}px`,
          }"
        >
          {{ cell.glyph }}
        </span>
      </div>

      <div
        v-if="videoLoaded && staticAsciiLineRevealed"
        class="video-static-rise video-static-rise--top-left"
        aria-hidden="true"
      >
        <span
          v-for="cell in staticAsciiRiseActiveCells"
          :key="`top-${cell.id}`"
          class="video-static-rise-glyph"
          :class="[
            `video-static-rise-glyph--${cell.tone}`,
            { 'video-static-rise-glyph--ghost': cell.ghostCopies }
          ]"
          :data-glyph="cell.glyph"
          :style="{
            left: `${100 - cell.xPct}%`,
            top: `${cell.yPx}px`,
          }"
        >
          {{ cell.glyph }}
        </span>
      </div>

      <nav
        v-if="videoLoaded"
        class="video-action-links"
        :class="{ 'video-action-links--revealed': videoActionLinksRevealed }"
        aria-label="Video actions"
      >
        <button class="video-action-link" @click.stop="toggleSound">
          {{ soundEnabled ? 'Sound Off' : 'Sound On' }}
        </button>
        <button class="video-action-link" @click.stop="goToProject">
          To Project
        </button>
        <button class="video-action-link" disabled>
          Next
        </button>
      </nav>
    </template>

    <div v-else class="p-8 text-center text-gray-300">
      <p class="mb-4">No hero video found.</p>
      <p class="text-sm">Add a video at <code>docs/media/hero.mp4</code> (mp4 preferred) or update the component to point to your file.</p>
    </div>
  </div>
</template>

<style scoped>
.full-bleed {
  --hero-side-margin: var(--nav-about-left, 148px);
  width: calc(100vw - (var(--hero-side-margin) * 2));
  margin-left: calc(50% - 50vw + var(--hero-side-margin));
}

@media (max-width: 768px) {
  .full-bleed {
    width: 100vw;
    margin-left: calc(50% - 50vw);
  }
}
.video-mask {
  width: 100%;
  height: calc(100vh - 200px);  /* viewport height minus navbar (112px) and spacing for arrow */
  max-height: calc(100vh - 200px);
  min-height: 400px;
  position: relative;
  margin-top: 0;           /* flush against navbar */
  /* Multi-oscillation, higher amplitude, asymmetric; side gaps left/right */
  /* mask is provided dynamically via --mask-url which contains a data:image SVG */
  -webkit-mask-image: var(--mask-url);
  mask-image: var(--mask-url);
  -webkit-mask-size: cover;
  mask-size: cover;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  mask-position: center;
  background-color: transparent; /* allow page background to show through */
  border-radius: 20px; /* rounded edges for the video area */
  overflow: hidden;
  opacity: 1;
}

/* ensure video sits above the shadow */
.video-mask {
  z-index: 10;
  border-radius: 18px;
}
.video-element {
  z-index: 20;
  border-radius: inherit; /* keep video corners rounded */
}


.video-element {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
  opacity: 0;
  transition: opacity 850ms ease-out, transform 240ms cubic-bezier(.2,.9,.3,1);
  border-radius: inherit;
  /* allow nudging the visible video down without changing container height */
  transform: translateY(var(--video-top-offset, 0px));
  will-change: transform;
}

.video-mask.video-revealed .video-element {
  opacity: 1;
}

.video-loading-pattern {
  position: absolute;
  inset: 0;
  z-index: 25;
  overflow: hidden;
  border-radius: 18px;
  padding: 0;
  pointer-events: none;
  mix-blend-mode: screen;
  filter: saturate(1.3) contrast(1.1);
  transition: opacity 180ms linear;
  contain: layout paint style;
}

@media (max-width: 768px) {
  .video-loading-pattern {
    filter: saturate(1.2) contrast(1.08);
  }
}

.video-loading-glyph {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(10px, 0.95vw, 15px);
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0;
  color: rgba(248, 248, 250, 0.94);
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.08);
  animation-name: loading-flicker;
  animation-iteration-count: infinite;
  animation-timing-function: steps(2, end);
  transform-origin: center;
  opacity: clamp(0, calc((var(--loading-growth) - var(--cell-activation)) / 0.022), 1);
  will-change: opacity, transform;
}

.video-loading-glyph::before,
.video-loading-glyph::after {
  content: none;
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: 0.2;
}

.video-loading-glyph--ghost::before,
.video-loading-glyph--ghost::after {
  content: attr(data-glyph);
}

.video-loading-glyph--red::before {
  color: rgba(255, 92, 92, 0.9);
  transform: translate(-1.2px, 0);
  mix-blend-mode: screen;
}

.video-loading-glyph--red::after {
  color: rgba(255, 140, 140, 0.55);
  transform: translate(1px, 0);
  mix-blend-mode: screen;
}

.video-loading-glyph--cyan::before {
  color: rgba(88, 245, 255, 0.9);
  transform: translate(1.2px, 0);
  mix-blend-mode: screen;
}

.video-loading-glyph--cyan::after {
  color: rgba(149, 255, 255, 0.58);
  transform: translate(-1px, 0);
  mix-blend-mode: screen;
}

.video-loading-glyph--neutral::before {
  color: rgba(255, 255, 255, 0.28);
  transform: translate(-0.75px, 0);
}

.video-loading-glyph--neutral::after {
  color: rgba(255, 255, 255, 0.22);
  transform: translate(0.75px, 0);
}

.video-static-line {
  position: absolute;
  left: 50%;
  top: calc(100% + 6px);
  width: 50%;
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  transition: max-width 980ms cubic-bezier(.22,.61,.36,1), opacity 420ms ease-out;
}

.video-static-line--revealed {
  max-width: 50%;
  opacity: 1;
}

.video-static-line--top-left {
  left: -45px;
  top: -8px;
  bottom: auto;
  z-index: 140;
}

.video-static-line-vertical {
  position: absolute;
  left: 0;
  top: 0;
  width: 2px;
  height: 50%;
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  transition: max-height 980ms cubic-bezier(.22,.61,.36,1), opacity 420ms ease-out;
}

.video-static-line-vertical--revealed {
  max-height: 50%;
  opacity: 1;
}

.video-static-line-vertical--top-left {
  left: -30px;
  top: -23px;
  z-index: 141;
}

.video-static-line-vertical-track {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.video-static-line-vertical-bar {
  position: absolute;
  left: 0;
  top: 0;
  width: 2px;
  height: 100%;
  margin: 0;
  background: rgba(248, 248, 250, 0.96);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.08);
}

.video-static-line-track {
  display: flex;
  align-items: center;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  font-size: clamp(9px, 0.8vw, 12px);
  line-height: 1;
}

.video-static-line-bar {
  position: relative;
  display: block;
  width: calc(var(--line-growth, 0) * 100%);
  height: 2px;
  margin: 0;
  background: rgba(248, 248, 250, 0.96);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.08);
}

.video-static-line-bar::before,
.video-static-line-bar::after {
  content: none;
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: 0.2;
}

.video-static-rise {
  position: absolute;
  left: 50%;
  top: 0;
  width: 50%;
  height: calc(100% - 10px);
  pointer-events: none;
  overflow: hidden;
  z-index: 24;
}

.video-static-rise--top-left {
  left: 0;
}

.video-static-rise-glyph {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0.62em;
  font-size: clamp(9px, 0.8vw, 12px);
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0;
  transform: translateX(-50%) rotate(90deg);
  color: rgba(248, 248, 250, 0.9);
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.08);
  opacity: 1;
}

.video-static-rise-glyph::before,
.video-static-rise-glyph::after {
  content: none;
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  opacity: 0.18;
}

.video-static-rise-glyph--ghost::before,
.video-static-rise-glyph--ghost::after {
  content: attr(data-glyph);
}

.video-static-rise-glyph--red::before {
  color: rgba(255, 92, 92, 0.88);
  transform: translate(-1.1px, 0);
  mix-blend-mode: screen;
}

.video-static-rise-glyph--red::after {
  color: rgba(255, 140, 140, 0.5);
  transform: translate(0.9px, 0);
  mix-blend-mode: screen;
}

.video-static-rise-glyph--cyan::before {
  color: rgba(88, 245, 255, 0.88);
  transform: translate(1.1px, 0);
  mix-blend-mode: screen;
}

.video-static-rise-glyph--cyan::after {
  color: rgba(149, 255, 255, 0.52);
  transform: translate(-0.9px, 0);
  mix-blend-mode: screen;
}

.video-static-rise-glyph--neutral::before {
  color: rgba(255, 255, 255, 0.26);
  transform: translate(-0.7px, 0);
}

.video-static-rise-glyph--neutral::after {
  color: rgba(255, 255, 255, 0.2);
  transform: translate(0.7px, 0);
}

@media (max-width: 768px) {
  .video-static-line {
    top: calc(100% + 8px);
    transition: max-width 860ms cubic-bezier(.22,.61,.36,1), opacity 380ms ease-out;
  }

  .video-static-line--top-left {
    left: -10px;
    top: -8px;
    bottom: auto;
  }

  .video-static-line-vertical {
    width: 2px;
  }

  .video-static-line-vertical--top-left {
    left: 5px;
    top: -23px;
  }

  .video-static-line-track {
    font-size: 9px;
  }

  .video-static-line-bar {
    height: 2px;
  }

  .video-static-rise {
    height: calc(100% - 12px);
  }

  .video-static-rise-glyph {
    min-width: 0.52em;
    font-size: 9px;
  }
}

@keyframes loading-flicker {
  0%, 100% {
    opacity: 0.92;
    filter: brightness(1);
  }
  20% {
    opacity: 0.38;
    filter: brightness(0.82);
  }
  42% {
    opacity: 1;
    filter: brightness(1.22);
  }
  63% {
    opacity: 0.62;
    filter: brightness(0.94);
  }
  78% {
    opacity: 1;
    filter: brightness(1.08);
  }
}

.video-action-links {
  position: absolute;
  left: calc(50% + 52px);
  top: calc(100% + 34px);
  z-index: 120;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  pointer-events: auto;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 320ms ease, transform 320ms ease;
}

.video-action-links--revealed {
  opacity: 1;
  transform: translateY(0);
}

.video-action-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 0.95rem;
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.video-action-link:hover:not(:disabled) {
  opacity: 0.7;
}

.video-action-link:disabled {
  cursor: default;
  opacity: 0.38;
}

@media (max-width: 768px) {
  .video-action-links {
    left: calc(50% + 46px);
    top: calc(100% + 28px);
    gap: 1rem;
  }

  .video-action-link {
    font-size: 0.9rem;
  }
}

</style>
