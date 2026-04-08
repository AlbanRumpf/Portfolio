<template>
  <div ref="containerEl" class="shape-badge-container">
    <button 
      class="shape-badge" 
      :class="{ 'shape-badge-expanded': props.scale && props.scale > 2 }"
      role="button" 
      aria-label="Open navigation menu" 
      @click="$emit('toggle')"
      @mousemove="onLocalMouseMove"
      @mouseleave="onLocalMouseLeave"
      ref="badgeEl"
      :style="{ width: `${88 * (props.scale || 1)}px`, height: `${88 * (props.scale || 1)}px` }"
    >
      <div class="shape-wrap" :style="{ width: `${64 * (props.scale || 1)}px`, height: `${64 * (props.scale || 1)}px` }">
      <!-- Text Badge -->
      <div class="text-badge" :class="{ 'is-visible': showText }" :style="{ color: textColor }">
        <div class="text-line">Alban</div>
        <div class="text-line">Rumpf</div>
      </div>
      
      <!-- Shape Badge -->
      <div v-if="points.length" class="shape-3d-container" :class="{ 'is-active': isActive && !props.disableHoverEffects, 'is-retracted': isRetracted, 'show-background': props.showBackgroundLayers }" :style="rotationStyle">
        <!-- 3D extruded shape layers with connecting side faces -->
        
        <!-- Perspective-corrected background stripes -->
        <svg class="shape-layer layer-perspective" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <polygon 
            v-for="(tri, idx) in perspectiveTriangles" 
            :key="'persp-' + idx" 
            :points="tri.points"
            :fill="`rgba(${80 + tri.layer * 30}, ${100 + tri.layer * 20}, ${140 + tri.layer * 10}, ${0.3 - tri.layer * 0.05})`"
            :stroke="`rgba(${100 + tri.layer * 30}, ${120 + tri.layer * 20}, ${160}, ${0.5 - tri.layer * 0.1})`"
            stroke-width="0.8"/>
        </svg>
        
        <!-- Connecting side faces between layers - HIGHLY VISIBLE -->
        <svg class="shape-layer layer-sides" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <polygon 
            v-for="(face, idx) in sideFaces" 
            :key="'side-' + idx" 
            :points="face.points" 
            :fill="`rgba(${Math.floor(100 + face.brightness * 100)}, ${Math.floor(120 + face.brightness * 80)}, ${Math.floor(180 + face.brightness * 60)}, 0.95)`"
            :stroke="`rgba(${Math.floor(150 + face.brightness * 100)}, ${Math.floor(170 + face.brightness * 80)}, ${Math.floor(220)}, 1.0)`"
            stroke-width="2.5"/>
        </svg>
        
        <!-- Back layer - darkest -->
        <svg class="shape-layer layer-back" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="backShade" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" :stop-color="colorScheme.backGradientStart" stop-opacity="0.9" />
              <stop offset="100%" :stop-color="colorScheme.backGradientEnd" stop-opacity="0.9" />
            </linearGradient>
          </defs>
          <polyline :points="svgPoints({x:0,y:0})" fill="none" :stroke="colorScheme.backStroke" :stroke-width="strokeWidth + 1" stroke-linecap="round" stroke-linejoin="round"/>
          <polygon v-for="(tri, idx) in triangles" :key="'back-' + idx" :points="tri" fill="url(#backShade)" :stroke="colorScheme.backStroke" stroke-width="2"/>
        </svg>
        
        <!-- Mid layer - medium tone with slight translucency -->
        <svg class="shape-layer layer-mid" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="midShade" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" :stop-color="colorScheme.midGradientStart" stop-opacity="0.9" />
              <stop offset="100%" :stop-color="colorScheme.midGradientEnd" stop-opacity="0.85" />
            </linearGradient>
          </defs>
          <polyline :points="svgPoints({x:0,y:0})" fill="none" :stroke="colorScheme.midStroke" :stroke-width="strokeWidth" stroke-linecap="round" stroke-linejoin="round"/>
          <polygon v-for="(tri, idx) in triangles" :key="'mid-' + idx" :points="tri" fill="url(#midShade)" :stroke="colorScheme.midStroke" stroke-width="1.5"/>
        </svg>
        
        <!-- Front layer - bright white with highlight -->
        <svg class="shape-layer layer-front" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <polyline :points="svgPoints(offsetBack)" fill="none" :stroke="colorScheme.frontShadow" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline :points="svgPoints({x:0,y:0})" fill="none" :stroke="colorScheme.frontStroke" :stroke-width="strokeWidth" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline :points="svgPoints(offsetFront)" fill="none" :stroke="colorScheme.frontStroke" stroke-width="3" stroke-opacity="0.85" stroke-linecap="round" stroke-linejoin="round"/>
          <polygon v-for="(tri, idx) in triangles" :key="'front-' + idx" :points="tri" :fill="`${colorScheme.frontStroke === '#000000' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.3)'}`" :stroke="`${colorScheme.frontStroke === '#000000' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)'}`" stroke-width="1"/>
        </svg>
      </div>
      <div v-else class="placeholder-dots">
        <span v-for="n in 3" :key="n" class="dot-small"></span>
      </div>
    </div>
    </button>
    
    <!-- Hover labels (only shown when showHoverText prop is true) -->
    <div v-if="props.showHoverText" class="hover-labels-container" :class="{ 'is-vertical': useVerticalHoverLabels }">
      <div ref="leftLabelEl" class="hover-label hover-label-left" :class="{ 'is-visible': isHovering }" :style="getCombinedHoverLabelStyle(0)">You did this</div>
      <div ref="rightLabelEl" class="hover-label hover-label-right" :class="{ 'is-visible': isHovering }" :style="getCombinedHoverLabelStyle(1)">{{ currentFollowUpWord }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { getLastDrawnPattern } from './Unlock.vue'

const props = defineProps<{
  menuOpen?: boolean
  isVisualPage?: boolean
  navbarHovering?: boolean
  disableHoverEffects?: boolean
  scale?: number
  strokeWidth?: number
  disableCycling?: boolean
  showBackgroundLayers?: boolean
  showHoverText?: boolean
  viewportTracking?: boolean
}>()

const points = ref<number[]>([])
const containerEl = ref<HTMLElement | null>(null)
const badgeEl = ref<HTMLElement | null>(null)
const mouseX = ref(0)
const mouseY = ref(0)
const smoothMouseX = ref(0)
const smoothMouseY = ref(0)
const isHovering = ref(false)
const isRetracted = ref(false)
const showText = ref(false)
const leftLabelEl = ref<HTMLElement | null>(null)
const rightLabelEl = ref<HTMLElement | null>(null)
const useVerticalHoverLabels = ref(false)
const topVerticalLabelStyle = ref<Record<string, string>>({})
const bottomVerticalLabelStyle = ref<Record<string, string>>({})
const strokeWidth = ref(props.strokeWidth ?? 6)
const offsetBack = { x: -3, y: 3 }
const offsetFront = { x: 2, y: -2 }

// Hover text animation
const followUpWords = ['kinda...', 'somewhat...', 'partially...', 'sorta...', 'more or less...',  'somehow...', 'or did you...', 'in conjunction with...', 'but...', 'also...', 'depending on your definition of...', 'arguably...', 'on some level...', 'maybe...', 'to an extend...', 'in a way...']
const currentFollowUpWord = ref(followUpWords[0])
const followUpWordQueue = ref<string[]>([])
let followUpWordTimeoutId: ReturnType<typeof setTimeout> | null = null

let animationFrameId: number | null = null
let hoverLayoutRafId: number | null = null
let retractionTimeoutId: ReturnType<typeof setTimeout> | null = null
let textDisplayTimeoutId: ReturnType<typeof setTimeout> | null = null
const RETRACTION_DELAY = 10000 // 10 seconds before shape switches to text 
const TEXT_DISPLAY_DURATION = 5000 // 5 seconds before text switches back to shape

const isActive = computed(() => isHovering.value || props.menuOpen || props.navbarHovering)

// Color scheme based on page
const colorScheme = computed(() => {
  if (props.isVisualPage) {
    return {
      backStroke: '#8b9dc3',
      midStroke: '#4a5568',
      backGradientStart: '#e5e7eb',
      backGradientEnd: '#d1d5db',
      midGradientStart: '#f3f4f6',
      midGradientEnd: '#e5e7eb',
      frontStroke: '#000000',
      frontShadow: 'rgba(255,255,255,0.65)'
    }
  }
  return {
    backStroke: '#4b5563',
    midStroke: '#9ca3af',
    backGradientStart: '#1f2937',
    backGradientEnd: '#111827',
    midGradientStart: '#374151',
    midGradientEnd: '#1f2937',
    frontStroke: '#ffffff',
    frontShadow: 'rgba(0,0,0,0.65)'
  }
})

const rotationStyle = computed(() => {
  // Always calculate rotation based on mouse position, even when shape is hidden
  // This ensures shape appears in correct position when fading back in
  if (smoothMouseX.value === 0 && smoothMouseY.value === 0) return {}
  
  // Use smoothed mouse position for inertia effect
  // Reduce rotation intensity for large instance to prevent clipping
  const rotationMultiplier = props.disableHoverEffects ? 0.5 : 1.0
  const rotateY = smoothMouseX.value * 20 * rotationMultiplier // reduced from 60
  const rotateX = -smoothMouseY.value * 28 * rotationMultiplier // reduced from 50
  const rotateZ = smoothMouseX.value * -8 * rotationMultiplier // reduced from -15
  
  // Only apply scale on hover when hover effects are enabled
  const scaleValue = props.disableHoverEffects ? 1.0 : 1.30
  
  return {
    transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg) scale(${scaleValue})`,
  }
})

const textColor = computed(() => {
  return props.isVisualPage ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)'
})

// Smooth interpolation for inertia
function smoothMousePosition() {
  const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor
  
  smoothMouseX.value = lerp(smoothMouseX.value, mouseX.value, 0.15)
  smoothMouseY.value = lerp(smoothMouseY.value, mouseY.value, 0.15)
  
  if (isHovering.value) {
    animationFrameId = requestAnimationFrame(smoothMousePosition)
  }
}

function onMouseMove(e: MouseEvent) {
  if (!badgeEl.value) return
  
  // Keep tracking mouse position even when showing text
  // This ensures shape has correct rotation when it fades back in
  updateMouse(e)
  
  // Start follow-up word rotation on first hover
  if (props.showHoverText && isHovering.value) {
    ensureFollowUpWordRotation()
  }
}

function onMouseLeave() {
  resetMotion()
  
  // Cancel follow-up word rotation
  if (followUpWordTimeoutId !== null) {
    clearTimeout(followUpWordTimeoutId)
    followUpWordTimeoutId = null
  }
  
  // Skip cycling if disabled
  if (props.disableCycling) return
  
  // Start timer to switch from shape to text when mouse leaves
  if (retractionTimeoutId !== null) {
    clearTimeout(retractionTimeoutId)
  }
  retractionTimeoutId = setTimeout(() => {
    isRetracted.value = true
    // Delay showing text until after shape fades out (800ms fade + small buffer)
    setTimeout(() => {
      showText.value = true
      // Start timer to switch back to shape
      scheduleShapeReturn()
    }, 900)
    retractionTimeoutId = null
  }, RETRACTION_DELAY)
}

function scheduleShapeReturn() {
  if (textDisplayTimeoutId !== null) {
    clearTimeout(textDisplayTimeoutId)
  }
  textDisplayTimeoutId = setTimeout(() => {
    showText.value = false
    // Delay showing shape until after text fades out (800ms fade + small buffer)
    setTimeout(() => {
      isRetracted.value = false
      // Restart the cycle: begin countdown to next retraction
      scheduleRetraction()
    }, 900)
    textDisplayTimeoutId = null
  }, TEXT_DISPLAY_DURATION)
}

function scheduleRetraction() {
  if (retractionTimeoutId !== null) {
    clearTimeout(retractionTimeoutId)
  }
  retractionTimeoutId = setTimeout(() => {
    isRetracted.value = true
    // Delay showing text until after shape fades out (800ms fade + small buffer)
    setTimeout(() => {
      showText.value = true
      // Start timer to switch back to shape
      scheduleShapeReturn()
    }, 900)
    retractionTimeoutId = null
  }, RETRACTION_DELAY)
}

function updateMouse(e: MouseEvent) {
  if (!badgeEl.value) return
  isHovering.value = true
  const rect = badgeEl.value.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  mouseX.value = (e.clientX - centerX) / (rect.width / 2)
  mouseY.value = (e.clientY - centerY) / (rect.height / 2)
  if (props.showHoverText) {
    ensureFollowUpWordRotation()
  }
  if (animationFrameId === null) smoothMousePosition()
}

function onLocalMouseMove(e: MouseEvent) {
  if (props.viewportTracking) return
  onMouseMove(e)
}

function onLocalMouseLeave() {
  if (props.viewportTracking) return
  onMouseLeave()
}

function resetMotion() {
  isHovering.value = false
  mouseX.value = 0
  mouseY.value = 0
  // Smoothly animate back to center instead of instant reset
  smoothToCenter()
}

function smoothToCenter() {
  const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor
  
  smoothMouseX.value = lerp(smoothMouseX.value, 0, 0.2)
  smoothMouseY.value = lerp(smoothMouseY.value, 0, 0.2)
  
  // Continue until very close to zero
  if (Math.abs(smoothMouseX.value) > 0.001 || Math.abs(smoothMouseY.value) > 0.001) {
    animationFrameId = requestAnimationFrame(smoothToCenter)
  } else {
    smoothMouseX.value = 0
    smoothMouseY.value = 0
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
  }
}

function loadPattern() {
  // try module function first
  try {
    const p = getLastDrawnPattern()
    if (p && Array.isArray(p) && p.length) {
      points.value = p
      return
    }
  } catch (e) {}
  // fallback to localStorage
  try {
    const raw = localStorage.getItem('unlockPattern')
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length) {
        points.value = arr
        return
      }
    }
  } catch (e) {}
  points.value = []
}

function indexToCoord(i: number) {
  // index 1..9 left-to-right, top-to-bottom
  const idx = i - 1
  const col = idx % 3
  const row = Math.floor(idx / 3)
  // map to 0..100 range with padding
  const pad = 12
  const cell = (100 - pad * 2) / 2
  const x = pad + col * cell
  const y = pad + row * cell
  return { x, y }
}

function svgPoints(offset = { x: 0, y: 0 }) {
  return points.value.map(i => {
    const c = indexToCoord(i)
    return `${c.x + offset.x},${c.y + offset.y}`
  }).join(' ')
}

// Generate triangular faces with perspective-corrected coordinates
const perspectiveTriangles = computed(() => {
  if (points.value.length < 3) return []
  
  const tris: Array<{points: string, layer: number}> = []
  const coords = points.value.map(i => indexToCoord(i))
  
  // Get rotation angles
  const rotateY = smoothMouseX.value * 35
  const rotateX = -smoothMouseY.value * 28
  const rotateZ = smoothMouseX.value * -8
  
  // Convert to radians
  const rX = (rotateX * Math.PI) / 180
  const rY = (rotateY * Math.PI) / 180
  const rZ = (rotateZ * Math.PI) / 180
  
  // Create triangles with 3 different depth layers
  const centerX = 50
  const centerY = 50
  
  const transformPoint = (p: {x: number, y: number}, depth: number) => {
    // Translate to origin
    let x = p.x - centerX
    let y = p.y - centerY
    let z = depth
    
    // Apply rotation matrices
    // RotateY
    let x1 = x * Math.cos(rY) - z * Math.sin(rY)
    let z1 = x * Math.sin(rY) + z * Math.cos(rY)
    
    // RotateX
    let y2 = y * Math.cos(rX) - z1 * Math.sin(rX)
    let z2 = y * Math.sin(rX) + z1 * Math.cos(rX)
    
    // RotateZ
    let x3 = x1 * Math.cos(rZ) - y2 * Math.sin(rZ)
    let y3 = x1 * Math.sin(rZ) + y2 * Math.cos(rZ)
    
    // Perspective projection
    const perspective = 500
    const scale = perspective / (perspective + z2)
    
    return {
      x: x3 * scale + centerX,
      y: y3 * scale + centerY
    }
  }
  
  for (let depth = -40; depth <= 0; depth += 20) {
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i]
      const p2 = coords[i + 1]
      const center = { x: centerX, y: centerY }
      
      const p1T = transformPoint(p1, depth)
      const p2T = transformPoint(p2, depth)
      const cT = transformPoint(center, depth)
      
      const triPoints = `${p1T.x},${p1T.y} ${p2T.x},${p2T.y} ${cT.x},${cT.y}`
      tris.push({ points: triPoints, layer: Math.floor(-depth / 20) })
    }
  }
  
  return tris
})

// Original triangles for backward compatibility
const triangles = computed(() => {
  if (points.value.length < 3) return []
  
  const tris: string[] = []
  const coords = points.value.map(i => indexToCoord(i))
  
  const centerX = coords.reduce((sum, c) => sum + c.x, 0) / coords.length
  const centerY = coords.reduce((sum, c) => sum + c.y, 0) / coords.length
  
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i]
    const p2 = coords[i + 1]
    tris.push(`${p1.x},${p1.y} ${p2.x},${p2.y} ${centerX},${centerY}`)
  }
  
  return tris
})

// Generate connecting side faces (quads between layers)
const sideFaces = computed(() => {
  if (points.value.length < 2) return []
  
  const faces: Array<{points: string, brightness: number}> = []
  const coords = points.value.map(i => indexToCoord(i))
  
  // Get rotation angles from smooth mouse position
  const rotateY = smoothMouseX.value * 35
  const rotateX = -smoothMouseY.value * 28
  
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i]
    const p2 = coords[i + 1]
    
    // Calculate back positions (smaller due to perspective)
    const centerX = 50
    const centerY = 50
    const depthFactor = 0.18
    const backScale = 1 - depthFactor
    
    const p1Back = {
      x: centerX + (p1.x - centerX) * backScale,
      y: centerY + (p1.y - centerY) * backScale
    }
    const p2Back = {
      x: centerX + (p2.x - centerX) * backScale,
      y: centerY + (p2.y - centerY) * backScale
    }
    
    // Create quad
    const quadPoints = `${p1.x},${p1.y} ${p2.x},${p2.y} ${p2Back.x},${p2Back.y} ${p1Back.x},${p1Back.y}`
    
    // Calculate brightness based on rotation
    // Sides facing right are brighter when rotating right
    const midX = (p1.x + p2.x) / 2
    const facing = (midX - 50) * Math.sin((rotateY * Math.PI) / 180)
    const brightness = 0.4 + facing * 0.6
    
    faces.push({ points: quadPoints, brightness })
  }
  
  return faces
})

function onStorage(e: StorageEvent) {
  if (e.key === 'unlockPattern') loadPattern()
}

function shuffledWords(words: string[]): string[] {
  const arr = [...words]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function refillFollowUpWordQueue() {
  if (followUpWords.length === 0) {
    followUpWordQueue.value = []
    return
  }

  let nextBatch = shuffledWords(followUpWords)

  // Avoid immediate repeat at cycle boundaries when possible.
  if (nextBatch.length > 1 && nextBatch[0] === currentFollowUpWord.value) {
    nextBatch = shuffledWords(followUpWords)
    if (nextBatch[0] === currentFollowUpWord.value) {
      const swapIndex = nextBatch.findIndex(word => word !== currentFollowUpWord.value)
      if (swapIndex > 0) {
        ;[nextBatch[0], nextBatch[swapIndex]] = [nextBatch[swapIndex], nextBatch[0]]
      }
    }
  }

  followUpWordQueue.value = nextBatch
}

function nextFollowUpWord(): string {
  if (followUpWordQueue.value.length === 0) {
    refillFollowUpWordQueue()
  }
  return followUpWordQueue.value.shift() ?? currentFollowUpWord.value
}

function ensureFollowUpWordRotation() {
  if (!props.showHoverText || followUpWordTimeoutId !== null) return
  currentFollowUpWord.value = nextFollowUpWord()
  scheduleFollowUpWordChange()
}

function scheduleFollowUpWordChange() {
  if (followUpWordTimeoutId !== null) {
    clearTimeout(followUpWordTimeoutId)
  }
  followUpWordTimeoutId = setTimeout(() => {
    currentFollowUpWord.value = nextFollowUpWord()
    // Schedule next change
    if (isHovering.value && props.showHoverText) {
      scheduleFollowUpWordChange()
    } else {
      followUpWordTimeoutId = null
    }
  }, 1200) // Change word every 1.2 seconds
}

function getHoverLabelStyle(index: number) {
  // Stagger the second label to appear shortly after the first
  const delay = index === 0 ? 0 : 0.3
  return {
    animationDelay: `${delay}s`,
  }
}

function getCombinedHoverLabelStyle(index: number) {
  const baseStyle = getHoverLabelStyle(index)
  if (!useVerticalHoverLabels.value) return baseStyle
  return {
    ...baseStyle,
    ...(index === 0 ? topVerticalLabelStyle.value : bottomVerticalLabelStyle.value),
  }
}

function getArrowBounds() {
  const topArrow = document.querySelector('button[aria-label="Scroll up"]') as HTMLElement | null
  const bottomArrow = document.querySelector('button[aria-label="Scroll down"]') as HTMLElement | null

  const viewportTop = 0
  const viewportBottom = window.innerHeight
  const topBound = topArrow ? topArrow.getBoundingClientRect().bottom + 12 : viewportTop + 12
  const bottomBound = bottomArrow ? bottomArrow.getBoundingClientRect().top - 12 : viewportBottom - 12

  return { topBound, bottomBound }
}

function updateVerticalLabelPositions() {
  if (!containerEl.value || !badgeEl.value || !leftLabelEl.value || !rightLabelEl.value) return

  const containerRect = containerEl.value.getBoundingClientRect()
  const shapeRect = badgeEl.value.getBoundingClientRect()
  const leftRect = leftLabelEl.value.getBoundingClientRect()
  const rightRect = rightLabelEl.value.getBoundingClientRect()
  const { topBound, bottomBound } = getArrowBounds()
  const gap = 16

  let topLabelY = shapeRect.top - leftRect.height - gap
  let bottomLabelY = shapeRect.bottom + gap

  topLabelY = Math.max(topBound, topLabelY)
  bottomLabelY = Math.min(bottomBound - rightRect.height, bottomLabelY)

  if (topLabelY + leftRect.height + 8 > bottomLabelY) {
    topLabelY = Math.max(topBound, shapeRect.top - leftRect.height - 8)
    bottomLabelY = Math.min(bottomBound - rightRect.height, shapeRect.bottom + 8)
  }

  topVerticalLabelStyle.value = {
    top: `${Math.round(topLabelY - containerRect.top)}px`,
    transform: 'translateX(-50%)',
  }

  bottomVerticalLabelStyle.value = {
    top: `${Math.round(bottomLabelY - containerRect.top)}px`,
    transform: 'translateX(-50%)',
  }
}

async function updateHoverLabelLayoutMode() {
  if (!props.showHoverText) return
  if (!leftLabelEl.value || !rightLabelEl.value || !containerEl.value) return

  if (useVerticalHoverLabels.value) {
    useVerticalHoverLabels.value = false
    await nextTick()
    if (!leftLabelEl.value || !rightLabelEl.value) return
  }

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  const margin = 8
  const leftRect = leftLabelEl.value.getBoundingClientRect()
  const rightRect = rightLabelEl.value.getBoundingClientRect()

  const isClipped = [leftRect, rightRect].some((rect) => (
    rect.left < margin ||
    rect.right > viewportWidth - margin ||
    rect.top < margin ||
    rect.bottom > viewportHeight - margin
  ))

  useVerticalHoverLabels.value = isClipped
  if (useVerticalHoverLabels.value) {
    await nextTick()
    updateVerticalLabelPositions()
  } else {
    topVerticalLabelStyle.value = {}
    bottomVerticalLabelStyle.value = {}
  }
}

function scheduleHoverLabelLayoutCheck() {
  if (typeof window === 'undefined') return
  if (hoverLayoutRafId !== null) {
    cancelAnimationFrame(hoverLayoutRafId)
  }
  hoverLayoutRafId = requestAnimationFrame(() => {
    hoverLayoutRafId = null
    updateHoverLabelLayoutMode()
  })
}

// Restore shape when menu closes
watch(() => props.menuOpen, (menuOpen) => {
  if (!menuOpen) {
    resetToInitialState()
  }
})

// Also reset when navbar hovering changes
watch(() => props.navbarHovering, (navbarHovering) => {
  if (props.disableCycling) return
  
  if (navbarHovering) {
    // Start cycling when navbar is hovered
    scheduleRetraction()
  } else if (!props.menuOpen) {
    resetToInitialState()
    // Restart the cycle when navbar hover ends
    scheduleRetraction()
  }
})

watch(() => isHovering.value, (hovering) => {
  if (hovering) {
    scheduleHoverLabelLayoutCheck()
  }
})

watch(() => currentFollowUpWord.value, () => {
  scheduleHoverLabelLayoutCheck()
})

watch(() => props.scale, () => {
  scheduleHoverLabelLayoutCheck()
})

watch(() => props.showHoverText, () => {
  scheduleHoverLabelLayoutCheck()
})

watch(() => useVerticalHoverLabels.value, (isVertical) => {
  if (isVertical) {
    scheduleHoverLabelLayoutCheck()
  }
})

function resetToInitialState() {
  isRetracted.value = false
  showText.value = false
  // Cancel any pending timers to prevent interference
  if (retractionTimeoutId !== null) {
    clearTimeout(retractionTimeoutId)
    retractionTimeoutId = null
  }
  if (textDisplayTimeoutId !== null) {
    clearTimeout(textDisplayTimeoutId)
    textDisplayTimeoutId = null
  }
  if (followUpWordTimeoutId !== null) {
    clearTimeout(followUpWordTimeoutId)
    followUpWordTimeoutId = null
  }
}

onMounted(() => {
  loadPattern()
  window.addEventListener('storage', onStorage)
  window.addEventListener('resize', scheduleHoverLabelLayoutCheck)
  window.addEventListener('scroll', scheduleHoverLabelLayoutCheck, { passive: true })
  // Ensure clean initial state
  resetToInitialState()
  // Start the automatic shape/text switching cycle (unless disabled)
  if (!props.disableCycling) {
    scheduleRetraction()
  }
  nextTick(() => {
    scheduleHoverLabelLayoutCheck()
  })
})
onUnmounted(() => {
  window.removeEventListener('storage', onStorage)
  window.removeEventListener('resize', scheduleHoverLabelLayoutCheck)
  window.removeEventListener('scroll', scheduleHoverLabelLayoutCheck)
  if (hoverLayoutRafId !== null) {
    cancelAnimationFrame(hoverLayoutRafId)
    hoverLayoutRafId = null
  }
  resetMotion()
  // Clean up timers
  if (retractionTimeoutId !== null) {
    clearTimeout(retractionTimeoutId)
    retractionTimeoutId = null
  }
  if (textDisplayTimeoutId !== null) {
    clearTimeout(textDisplayTimeoutId)
    textDisplayTimeoutId = null
  }
  if (followUpWordTimeoutId !== null) {
    clearTimeout(followUpWordTimeoutId)
    followUpWordTimeoutId = null
  }
})

defineExpose({
  updateMouseFromEvent: updateMouse,
  resetMotion
})
</script>

<style>
/* Unscoped keyframes for hover labels */
@keyframes hoverLabelFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>

<style scoped>
.shape-badge-container {
  position: relative;
  display: inline-block;
}

.shape-badge {
  width: 88px;
  height: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
}

.shape-badge-expanded {
  padding: 120px;
}
.shape-wrap {
  width: 64px;
  height: 64px;
  perspective: 260px; /* stronger parallax */
  perspective-origin: 50% 40%;
  overflow: visible;
}

.shape-3d-container {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: opacity 800ms ease-out, transform 800ms ease-out, filter 300ms ease;
  overflow: visible;
}

.shape-3d-container.is-retracted {
  opacity: 0;
  transform: scale(0.3);
  pointer-events: none;
  transition: opacity 800ms ease-in, transform 800ms cubic-bezier(0.4, 0, 1, 1);
}

.shape-3d-container.is-active {
  filter: drop-shadow(0 12px 22px rgba(0, 0, 0, 0.55));
}

.shape-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform-origin: 50% 50%;
  backface-visibility: visible;
  transition: opacity 300ms ease, transform 300ms ease;
  overflow: visible;
}

.shape-layer svg,
.shape-layer {
  overflow: visible;
}

.layer-perspective {
  transform: translateZ(-20px);
  opacity: 0;
  pointer-events: none;
}

.layer-sides {
  transform: translateZ(-35px);
  opacity: 0;
  mix-blend-mode: multiply;
}

.layer-back {
  transform: translateZ(-70px);
  opacity: 0;
  filter: brightness(0.5);
}

.layer-mid {
  transform: translateZ(-40px);
  opacity: 0;
  filter: brightness(0.75);
}

.layer-front {
  transform: translateZ(0px);
}

.shape-3d-container.is-active .layer-perspective {
  opacity: 1;
  transform: translateZ(-20px);
}

.shape-3d-container.is-active .layer-sides {
  opacity: 1;
  transform: translateZ(-35px);
}

.shape-3d-container.is-active .layer-back {
  opacity: 1;
  transform: translateZ(-70px);
  filter: brightness(0.45) drop-shadow(0 2px 4px rgba(0,0,0,0.3));
}

.shape-3d-container.is-active .layer-mid {
  opacity: 1;
  transform: translateZ(-40px);
  filter: brightness(0.7);
}

/* Show background layers without hover effects */
.shape-3d-container.show-background .layer-perspective {
  opacity: 1;
  transform: translateZ(-20px);
}

.shape-3d-container.show-background .layer-sides {
  opacity: 1;
  transform: translateZ(-35px);
}

.shape-3d-container.show-background .layer-back {
  opacity: 1;
  transform: translateZ(-70px);
  filter: brightness(0.45) drop-shadow(0 2px 4px rgba(0,0,0,0.3));
}

.shape-3d-container.show-background .layer-mid {
  opacity: 1;
  transform: translateZ(-40px);
  filter: brightness(0.7);
}

@keyframes gentle-rotate {
  0%, 100% { 
    filter: brightness(1);
  }
  50% { 
    filter: brightness(1.15);
  }
}

.placeholder-dots {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
}
.dot-small {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  border: 2px solid rgba(255,255,255,0.12);
}

/* Text Badge Styling */
.text-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 800ms ease-in-out;
}

.text-badge.is-visible {
  opacity: 1;
  pointer-events: auto;
}

.text-line {
  font-family: 'Futura', monospace;
  font-size: 21px;
  font-weight: 600;
  letter-spacing: 1px;
  white-space: nowrap;
  line-height: 1.2;
  color: inherit;
}

/* Hover labels (similar to unlock screen labels) */
.hover-labels-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.hover-label {
  position: absolute;
  font-size: clamp(14px, 2vw, 20px);
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
  font-weight: 300;
  text-transform: uppercase;
  opacity: 0;
  transition: opacity 500ms ease-out;
}

.hover-label.is-visible {
  animation: hoverLabelFadeIn 0.5s ease-out forwards;
  opacity: 1;
}

.hover-label-left {
  left: -15%;
  top: 30%;
  transform: translateX(-100%) translateY(-50%);
}

.hover-label-right {
  right: -15%;
  top: 80%;
  transform: translateX(100%) translateY(-50%);
}

.hover-labels-container.is-vertical .hover-label {
  left: 50%;
  right: auto;
  text-align: center;
  max-width: min(92vw, 32rem);
  white-space: normal;
  line-height: 1.2;
}

.hover-labels-container.is-vertical .hover-label-left {
  transform: translateX(-50%);
}

.hover-labels-container.is-vertical .hover-label-right {
  transform: translateX(-50%);
}

@media (max-width: 900px) {
  .hover-label {
    left: 50%;
    right: auto;
    text-align: center;
    max-width: min(92vw, 32rem);
    white-space: normal;
    line-height: 1.2;
  }

  .hover-label-left {
    top: -1.4rem;
    transform: translateX(-50%) translateY(-100%);
  }

  .hover-label-right {
    top: calc(100% + 1.4rem);
    transform: translateX(-50%) translateY(0);
  }
}
</style>