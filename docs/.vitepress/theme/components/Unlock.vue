<template>
  <div class="unlock-screen">
    <div class="unlock-with-labels">
      <div class="label label-top" :style="getLabelAnimationStyle(0)">Please</div>
      <div class="label label-right" :style="getLabelAnimationStyle(1)">connect</div>
      <div class="label label-bottom" :style="getLabelAnimationStyle(2)">the</div>
      <div class="label label-left" :style="getLabelAnimationStyle(3)">dots</div>

      <div
        class="unlock-inner"
        ref="container"
        @pointerdown.prevent="onPointerDown"
        @pointermove.prevent="onPointerMove"
        @pointerup.prevent="onPointerUp"
        @pointerleave.prevent="onPointerUp"
        @touchstart.prevent="onTouchStart"
        @touchmove.prevent="onTouchMove"
        @touchend.prevent="onPointerUp"
      >
        <!-- SVG overlay for the connecting lines -->
        <svg class="pattern-svg" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" v-if="initialized">
          <polyline
            :points="polylinePoints"
            fill="none"
            stroke="rgba(255,255,255,0.95)"
            :stroke-width="strokeWidth"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>

        <div class="dots-grid" role="grid" aria-label="Unlock pattern">
          <div
            v-for="i in 9"
            :key="i"
            class="dot"
            :class="{ connected: used.has(i) }"
            :data-index="i"
            :style="getDotAnimationStyle(i)"
            tabindex="0"
          ></div>
        </div>
      </div>
    </div>

    <!-- Glitch Buttons -->
    <button
      v-for="btn in glitchButtons"
      :key="btn.id"
      v-show="btn.isFixed || showExtraButtons"
      @click="drawRandomPatternAndUnlock"
      @mouseenter="btn.isFixed ? onNoButtonHover() : undefined"
      :class="[
        'fixed bg-stone-800 hover:bg-stone-700 transition-all duration-300',
        'text-stone-400 hover:text-white opacity-0 hover:opacity-100',
        'glitch-button',
        getButtonSizeClasses(btn.size, btn.text)
      ]"
      :style="getButtonPositionStyle(btn.position)"
      :aria-label="`Skip unlock - ${btn.text}`"
      :data-button-id="btn.id"
    >
      <span class="glitch-text-no">{{ btn.text }}</span>
      <span class="glitch-text-glitch">{{ btn.glitchText }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

// Animation configuration — easily adjustable
const ANIMATION_CONFIG = {
  dotsFadeInDuration: 0.5, // in seconds
  dotsStaggerDelay: 0.05, // delay between each dot
  labelsFadeInDuration: 0.5, // in seconds
  labelsStaggerDelay: 0.5, // delay between each label
  dotsStartDelay: 0, // when dots animation starts
  labelsStartDelay: 0.5, // when labels animation starts (after dots finish)
}

// Button configuration
interface GlitchButton {
  id: string
  text: string
  glitchText: string
  position: { top?: string; bottom?: string; left?: string; right?: string }
  size: 'sm' | 'md' | 'lg'
  isFixed: boolean
}

interface Position {
  x: number
  y: number
}

const MIN_BUTTON_DISTANCE = 200 // minimum distance in pixels between buttons

function convertPositionToCoordinates(
  pos: { top?: string; bottom?: string; left?: string; right?: string },
  viewportWidth: number = window.innerWidth,
  viewportHeight: number = window.innerHeight
): Position {
  let x = 0
  let y = 0

  if (pos.left) {
    x = (parseFloat(pos.left) / 100) * viewportWidth
  } else if (pos.right) {
    x = viewportWidth - (parseFloat(pos.right) / 100) * viewportWidth
  }

  if (pos.top) {
    y = (parseFloat(pos.top) / 100) * viewportHeight
  } else if (pos.bottom) {
    y = viewportHeight - (parseFloat(pos.bottom) / 100) * viewportHeight
  }

  return { x, y }
}

function checkMinDistance(
  newPos: Position,
  existingPositions: Position[]
): boolean {
  for (const pos of existingPositions) {
    const dx = newPos.x - pos.x
    const dy = newPos.y - pos.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance < MIN_BUTTON_DISTANCE) {
      return false
    }
  }
  return true
}

function generateRandomPosition(
  existingButtons: { position: { top?: string; bottom?: string; left?: string; right?: string } }[]
): { top?: string; bottom?: string; left?: string; right?: string } {
  const existingPositions = existingButtons.map(btn => 
    convertPositionToCoordinates(btn.position)
  )

  let attempts = 0
  const maxAttempts = 50

  while (attempts < maxAttempts) {
    // Avoid center 60% of screen (where unlock grid is)
    const positions = [
      { top: `${Math.random() * 15 + 5}%`, left: `${Math.random() * 15 + 5}%` },
      { top: `${Math.random() * 15 + 5}%`, right: `${Math.random() * 15 + 5}%` },
      { bottom: `${Math.random() * 15 + 5}%`, left: `${Math.random() * 15 + 5}%` },
      { bottom: `${Math.random() * 15 + 5}%`, right: `${Math.random() * 20 + 25}%` }, // avoid original "No" button
    ]
    
    const candidatePos = positions[Math.floor(Math.random() * positions.length)]
    const candidateCoords = convertPositionToCoordinates(candidatePos)

    if (checkMinDistance(candidateCoords, existingPositions)) {
      return candidatePos
    }

    attempts++
  }

  // If we couldn't find a good position, return a fallback
  return { top: `${Math.random() * 15 + 5}%`, left: `${Math.random() * 15 + 5}%` }
}

const glitchButtons = ref<GlitchButton[]>([
  {
    id: 'no-button',
    text: 'No',
    glitchText: '/////',
    position: { bottom: '2rem', right: '2rem' },
    size: 'lg',
    isFixed: true,
  },
])

// Initialize additional buttons after the fixed "No" button
const button1 = {
  id: 'random-1',
  text: 'Skip',
  glitchText: '>>>',
  position: generateRandomPosition(glitchButtons.value),
  size: 'md' as const,
  isFixed: false,
}
glitchButtons.value.push(button1)

const button2 = {
  id: 'random-2',
  text: 'Pass',
  glitchText: '---',
  position: generateRandomPosition(glitchButtons.value),
  size: 'sm' as const,
  isFixed: false,
}
glitchButtons.value.push(button2)

const button3 = {
  id: 'random-3',
  text: 'Later',
  glitchText: '...',
  position: generateRandomPosition(glitchButtons.value),
  size: 'md' as const,
  isFixed: false,
}
glitchButtons.value.push(button3)

function getButtonSizeClasses(size: 'sm' | 'md' | 'lg', text: string) {
  // Adjust padding based on text length for more rectangular vs cubic shapes
  const textLength = text.length
  const isShortText = textLength <= 3
  
  switch (size) {
    case 'sm':
      return isShortText ? 'px-5 py-2 text-sm' : 'px-4 py-2 text-sm'
    case 'md':
      return isShortText ? 'px-8 py-3 text-base' : 'px-6 py-3 text-base'
    case 'lg':
      return isShortText ? 'px-12 py-5 text-2xl' : 'px-10 py-5 text-2xl'
    default:
      return 'px-6 py-3 text-base'
  }
}

function getButtonPositionStyle(position: GlitchButton['position']) {
  return {
    top: position.top,
    bottom: position.bottom,
    left: position.left,
    right: position.right,
  }
}

// remember last saved pattern in background without displaying it
const lastPattern = ref<number[] | null>(null)

const container = ref<HTMLElement | null>(null)
const pattern = ref<number[]>([])
const used = ref(new Set<number>())
const centers = ref<Record<number, { x: number; y: number; r: number }>>({})
const width = ref(360)
const height = ref(360)
const strokeWidth = ref(16)
// hit tolerance factor (fraction of dot radius) — raised to make connecting easier
const HIT_TOLERANCE = 1.15
const initialized = ref(false)
const drawing = ref(false)
const currentPos = ref<{ x: number; y: number } | null>(null)
// status messaging removed to keep UI minimal
let pointerId: number | null = null

// Extra buttons visibility control
const showExtraButtons = ref(false)
const inactivityTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const INACTIVITY_TIMEOUT = 60000 // 1 minute in milliseconds

function computeCenters() {
  const el = container.value!
  const rect = el.getBoundingClientRect()
  width.value = Math.round(rect.width)
  height.value = Math.round(rect.height)

  const dots = Array.from(el.querySelectorAll<HTMLElement>('.dot'))
  dots.forEach((d) => {
    const i = Number(d.dataset.index)
    const r = d.getBoundingClientRect()
    centers.value[i] = {
      x: Math.round(r.left - rect.left + r.width / 2),
      y: Math.round(r.top - rect.top + r.height / 2),
      r: Math.round(Math.max(r.width, r.height) / 2),
    }
  })
  initialized.value = true
}

function startInactivityTimer() {
  // Clear existing timer
  if (inactivityTimer.value) {
    clearTimeout(inactivityTimer.value)
  }
  // Start new timer
  inactivityTimer.value = setTimeout(() => {
    showExtraButtons.value = true
  }, INACTIVITY_TIMEOUT)
}

function resetInactivityTimer() {
  if (inactivityTimer.value) {
    clearTimeout(inactivityTimer.value)
    inactivityTimer.value = null
  }
}

function onNoButtonHover() {
  showExtraButtons.value = true
  resetInactivityTimer()
}

// Not exposing reset/save UI; keep functions minimal and internal if needed
function resetPattern() {
  pattern.value = []
  used.value = new Set()
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function tryAddAtPoint(p: { x: number; y: number }) {
  for (const iStr in centers.value) {
    const idx = Number(iStr)
    if (used.value.has(idx)) continue
    const c = centers.value[idx]
    if (!c) continue
    // tolerate pointer slightly outside the dot center to make connections easier
    if (distance(p, c) <= c.r * HIT_TOLERANCE) {
      pattern.value.push(idx)
      used.value.add(idx)
      return true
    }
  }
  return false
}

function pointFromPointerEvent(e: PointerEvent | Touch) {
  const el = container.value!
  const rect = el.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function onPointerDown(e: any) {
  // start capturing
  if (!container.value) return
  drawing.value = true
  resetInactivityTimer() // Reset timer when user starts drawing
  pointerId = e?.pointerId ?? null
  if (pointerId !== null) {
    ;(e?.target as HTMLElement)?.setPointerCapture?.(pointerId)
  }
  const p = pointFromPointerEvent(e)
  currentPos.value = p
  tryAddAtPoint(p)
}

function onPointerMove(e: any) {
  if (!drawing.value) return
  const p = pointFromPointerEvent(e)
  currentPos.value = p
  // try to add any unconnected dot under the pointer
  tryAddAtPoint(p)
}

function onPointerUp(e?: any) {
  if (pointerId !== null && container.value) {
    try {
      container.value.releasePointerCapture?.(pointerId)
    } catch (err) {}
  }
  drawing.value = false
  currentPos.value = null
  pointerId = null

  // If at least 3 dots were connected, treat as an unlock and proceed
  if (pattern.value.length >= 3) {
    unlock()
  } else {
    // Restart inactivity timer after failed attempt
    startInactivityTimer()
  }
}

// touch helpers
function onTouchStart(e: TouchEvent) {
  if (!e.touches || e.touches.length === 0) return
  const t = e.touches[0]
  drawing.value = true
  resetInactivityTimer() // Reset timer when user starts drawing
  const p = pointFromPointerEvent(t)
  currentPos.value = p
  tryAddAtPoint(p)
}

function onTouchMove(e: TouchEvent) {
  if (!drawing.value || !e.touches || e.touches.length === 0) return
  const t = e.touches[0]
  const p = pointFromPointerEvent(t)
  currentPos.value = p
  tryAddAtPoint(p)
}

// savePattern is no longer exposed in the UI; pattern is auto-saved via watcher

function unlock() {
  // persist pattern and mark as unlocked for the current browser session
  try {
    localStorage.setItem('unlockPattern', JSON.stringify(pattern.value))
    localStorage.setItem('unlocked', '1')
    // set heartbeat immediately so other windows see recent activity
    try { localStorage.setItem('unlockHeartbeat', Date.now().toString()) } catch (e) {}
    // notify other parts of the app in the same window; keep UI minimal (no status text)
    window.dispatchEvent(new Event('app:unlocked'))
  } catch (err) {
    // keep silent on failure to be minimal
  }
}

// Draw a random pattern automatically (for the "No..." button)
function drawRandomPatternAndUnlock() {
  resetPattern()
  
  // Random number of dots between 3 and 9
  const numDots = Math.floor(Math.random() * 7) + 3 // 3 to 9
  
  // Create array of all available dots (1-9)
  const availableDots = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  
  // Shuffle the array
  for (let i = availableDots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableDots[i], availableDots[j]] = [availableDots[j], availableDots[i]]
  }
  
  // Take the first numDots from shuffled array
  const selectedDots = availableDots.slice(0, numDots)
  
  // Add dots to pattern with animation delay
  selectedDots.forEach((dot, index) => {
    setTimeout(() => {
      pattern.value.push(dot)
      used.value.add(dot)
      
      // Unlock after the last dot is drawn
      if (index === selectedDots.length - 1) {
        setTimeout(() => {
          unlock()
        }, 300)
      }
    }, index * 150) // 150ms delay between each dot
  })
}

const polylinePoints = computed(() => {
  const pts: string[] = []
  for (const idx of pattern.value) {
    const c = centers.value[idx]
    if (c) pts.push(`${c.x},${c.y}`)
  }
  // while drawing, add current pointer position as temporary endpoint
  if (drawing.value && currentPos.value) pts.push(`${currentPos.value.x},${currentPos.value.y}`)
  return pts.join(' ')
})

function getDotAnimationStyle(index: number) {
  const delayInSeconds = ANIMATION_CONFIG.dotsStartDelay + (index - 1) * ANIMATION_CONFIG.dotsStaggerDelay
  return {
    animationName: 'fadeIn',
    animationDuration: `${ANIMATION_CONFIG.dotsFadeInDuration}s`,
    animationTimingFunction: 'ease-out',
    animationDelay: `${delayInSeconds}s`,
    animationFillMode: 'both',
  }
}

function getLabelAnimationStyle(index: number) {
  const delayInSeconds = ANIMATION_CONFIG.labelsStartDelay + index * ANIMATION_CONFIG.labelsStaggerDelay
  return {
    animationName: 'fadeIn',
    animationDuration: `${ANIMATION_CONFIG.labelsFadeInDuration}s`,
    animationTimingFunction: 'ease-out',
    animationDelay: `${delayInSeconds}s`,
    animationFillMode: 'both',
  }
}
// Random flicker configuration
const FLICKER_CONFIG = {
  minPause: 500, // milliseconds
  maxPause: 4200, // milliseconds
  fadeDuration: 90, // milliseconds for fade in/out
  peakDuration: 180, // milliseconds at peak opacity
}

let flickerInterval: ReturnType<typeof setInterval> | null = null
let flickerTimeouts: ReturnType<typeof setTimeout>[] = []
let isFlickerPaused = false

function clearFlickerTimeouts() {
  flickerTimeouts.forEach(timeout => clearTimeout(timeout))
  flickerTimeouts = []
}

function startRandomFlicker() {
  const buttons = document.querySelectorAll('.glitch-button') as NodeListOf<HTMLElement>
  if (!buttons.length) return

  buttons.forEach((button, index) => {
    let isButtonFlickerPaused = false
    
    function randomPause() {
      return Math.random() * (FLICKER_CONFIG.maxPause - FLICKER_CONFIG.minPause) + FLICKER_CONFIG.minPause
    }

    function performFlicker() {
      if (isButtonFlickerPaused) {
        // Schedule next flicker check if paused
        const timeout = setTimeout(performFlicker, 100)
        flickerTimeouts.push(timeout)
        return
      }

      // Fade in: 0 → 0.6
      let opacity = 0
      const fadeInStep = 0.6 / (FLICKER_CONFIG.fadeDuration / 16) // 16ms per frame
      const fadeInInterval = setInterval(() => {
        opacity = Math.min(opacity + fadeInStep, 0.6)
        button.style.opacity = opacity.toString()
        if (opacity >= 0.6) clearInterval(fadeInInterval)
      }, 16)

      // Hold at peak, then fade out
      const peakTimeout = setTimeout(() => {
        let peakOpacity = 0.6
        const fadeOutStep = 0.6 / (FLICKER_CONFIG.fadeDuration / 16)
        const fadeOutInterval = setInterval(() => {
          peakOpacity = Math.max(peakOpacity - fadeOutStep, 0)
          button.style.opacity = peakOpacity.toString()
          if (peakOpacity <= 0) {
            clearInterval(fadeOutInterval)
            // Schedule next flicker with random pause
            if (!isButtonFlickerPaused) {
              const nextTimeout = setTimeout(performFlicker, randomPause())
              flickerTimeouts.push(nextTimeout)
            }
          }
        }, 16)
      }, FLICKER_CONFIG.peakDuration)
      
      flickerTimeouts.push(peakTimeout)
    }

    // Start first flicker after initial delay (staggered per button)
    const initialTimeout = setTimeout(performFlicker, 2000 + index * 800)
    flickerTimeouts.push(initialTimeout)
    
    // Add hover listeners to pause/resume flicker
    button.addEventListener('mouseenter', () => {
      isButtonFlickerPaused = true
      button.style.opacity = '1' // Show button at full opacity on hover
    })
    
    button.addEventListener('mouseleave', () => {
      isButtonFlickerPaused = false
      button.style.opacity = '0' // Reset opacity
      // Resume flicker immediately
      const resumeTimeout = setTimeout(performFlicker, randomPause())
      flickerTimeouts.push(resumeTimeout)
    })
  })
}

onMounted(async () => {
  await nextTick()
  computeCenters()
  window.addEventListener('resize', computeCenters)
  
  // Start inactivity timer
  startInactivityTimer()
  
  // Start random flicker animation on button
  startRandomFlicker()

  // load stored pattern (if any) but do NOT apply it visually — keep it in background for later use
  try {
    const stored = localStorage.getItem('unlockPattern')
    if (stored) {
      const arr = JSON.parse(stored)
      if (Array.isArray(arr)) {
        lastPattern.value = arr
      }
    }
  } catch (err) {}
})

// persist pattern automatically whenever it changes (background save)
watch(pattern, (val) => {
  try {
    localStorage.setItem('unlockPattern', JSON.stringify(val))    // also update lastPattern so consumers can read the most recent value without reloading
    lastPattern.value = Array.isArray(val) ? [...val] : null  } catch (err) {}
})
onUnmounted(() => {
  window.removeEventListener('resize', computeCenters)
  if (flickerInterval) {
    clearInterval(flickerInterval)
  }
  clearFlickerTimeouts()
  resetInactivityTimer()
})
</script>

<script lang="ts">
// Module export: reads the last stored pattern from localStorage (safe for SSR)
export function getLastDrawnPattern(): number[] | null {
  try {
    if (typeof window === 'undefined') return null
    const s = localStorage.getItem('unlockPattern')
    if (!s) return null
    const arr = JSON.parse(s)
    return Array.isArray(arr) ? arr : null
  } catch (err) {
    return null
  }
}
</script>

<style>
/* Unscoped keyframes so they work with inline styles */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>

<style scoped>
/* Minimal, full-bleed unlock surface (no extra boxed background) */
.unlock-screen {
  background-color: transparent; /* allow underlying page background to show through */
  min-height: 100vh;
  width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
} 

.unlock-inner {
  width: min(500px, 80%);
  height: min(500px, 80%);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none; /* prevent the page from scrolling while drawing */
}

.unlock-with-labels {
  position: relative;
  width: min(650px, 90vw);
  height: min(650px, 90vw);
  display: flex;
  align-items: center;
  justify-content: center;
  --label-distance: clamp(30px, 12%, 80px);
}

.label {
  position: absolute;
  font-size: clamp(14px, 2vw, 20px);
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
  font-weight: 300;
  text-transform: uppercase;
  opacity: 0;
}

.label-top {
  top: 0;
  left: 50%;
  transform: translateX(-50%) translateY(calc(-100% - var(--label-distance)));
}

.label-right {
  right: 0;
  top: 50%;
  transform: translateY(-50%) translateX(calc(100% + var(--label-distance))) rotate(90deg);
  transform-origin: center;
}

.label-bottom {
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) translateY(calc(100% + var(--label-distance))) scaleX(-1);
}

.label-left {
  left: 0;
  top: 50%;
  transform: translateY(-50%) translateX(calc(-100% - var(--label-distance))) rotate(-90deg);
  transform-origin: center;
} 

.pattern-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  pointer-events: none; /* svg should not intercept pointer events */
}

.dots-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(20px, 4vw, 40px);
  width: min(400px, 90%);
  justify-items: center;
  z-index: 20;
} 

.dot {
  aspect-ratio: 1/1;
  width: 100%;
  min-width: 60px;
  max-width: clamp(70px, 15vw, 140px);
  background: rgba(255, 255, 255, 0.06);
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.14);
  box-shadow: none; /* remove inset shadow */
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 180ms ease, background 180ms ease, border-color 160ms ease;
  opacity: 0;
} 

.dot.connected {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.6);
  transform: translateY(-8px) scale(1.06);
  box-shadow: 0 6px 18px rgba(0,0,0,0.45);
} 

.dot:hover,
.dot:focus {
  background: rgba(255, 255, 255, 0.12);
  transform: translateY(-4px);
  outline: none;
}

/* Color Channel Glitch effect for the button */
@keyframes glitch-red {
  0%, 100% {
    text-shadow: 
      0 0 0 rgba(255, 0, 0, 0),
      3px 3px 0 rgba(255, 0, 0, 0);
  }
  50% {
    text-shadow: 
      -5px 0 0 rgba(255, 80, 80, 1),
      5px 3px 0 rgba(255, 50, 50, 0.9);
  }
}

@keyframes glitch-cyan {
  0%, 100% {
    box-shadow: 
      0 0 0 rgba(0, 255, 255, 0);
  }
  50% {
    box-shadow: 
      5px -3px 0 rgba(0, 220, 255, 0.9),
      -5px 0 0 rgba(0, 255, 255, 0.8);
  }
}

@keyframes glitch-distort {
  0%, 100% {
    transform: skewX(0deg) scaleX(1);
  }
  25% {
    transform: skewX(-2deg) scaleX(0.98);
  }
  50% {
    transform: skewX(2deg) scaleX(1.02);
  }
  75% {
    transform: skewX(-1deg) scaleX(0.99);
  }
}

@keyframes glitch-layer-red {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  20% {
    transform: translate(-18px, -15px);
    opacity: 0.6;
  }
  40% {
    transform: translate(15px, -12px);
    opacity: 0.5;
  }
  60% {
    transform: translate(-14px, 17px);
    opacity: 0.6;
  }
  80% {
    transform: translate(17px, 11px);
    opacity: 0.5;
  }
  100% {
    transform: translate(0, 0);
    opacity: 0;
  }
}

@keyframes glitch-layer-cyan {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  20% {
    transform: translate(17px, 14px);
    opacity: 0.6;
  }
  40% {
    transform: translate(-15px, 15px);
    opacity: 0.5;
  }
  60% {
    transform: translate(18px, -11px);
    opacity: 0.6;
  }
  80% {
    transform: translate(-17px, -14px);
    opacity: 0.5;
  }
  100% {
    transform: translate(0, 0);
    opacity: 0;
  }
}

/* Button with layered ghost elements */
.glitch-button {
  overflow: visible;
}

.glitch-button::before,
.glitch-button::after {
  content: attr(data-glitch-text);
  position: absolute;
  padding: inherit;
  pointer-events: none;
  opacity: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: inherit;
}

.glitch-button::before {
  top: 0;
  left: 0;
  background: rgba(255, 0, 100, 0.4);
  color: rgba(255, 100, 100, 0.8);
  mix-blend-mode: screen;
}

.glitch-button::after {
  top: 0;
  left: 0;
  background: rgba(0, 255, 255, 0.4);
  color: rgba(100, 255, 255, 0.8);
  mix-blend-mode: screen;
}

/* Text content switching */
.glitch-text-no {
  display: inline;
  opacity: 0;
}

.glitch-text-glitch {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
}

.glitch-button:not(:hover) {
  animation: 
    glitch-red 0.15s infinite,
    glitch-cyan 0.25s infinite 0.05s,
    glitch-distort 0.2s infinite 0.1s;
}

.glitch-button:not(:hover)::before {
  animation: 
    glitch-layer-red 0.2s infinite;
}

.glitch-button:not(:hover)::after {
  animation: 
    glitch-layer-cyan 0.15s infinite 0.08s;
}

.glitch-button:not(:hover) .glitch-text-no {
  opacity: 0;
}

.glitch-button:not(:hover) .glitch-text-glitch {
  opacity: 1;
}

.glitch-button:hover {
  animation: none;
  text-shadow: none;
  box-shadow: none;
  transform: none;
}

.glitch-button:hover::before,
.glitch-button:hover::after {
  animation: none;
  opacity: 0;
}

.glitch-button:hover .glitch-text-no {
  opacity: 1;
}

.glitch-button:hover .glitch-text-glitch {
  opacity: 0;
}

</style>
