<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { withBase } from 'vitepress'

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

// arrow hit zone: invisible area around arrow for full video visibility

const ARROW_HIT_ZONE_Y_BUFFER = 100 // pixels; vertical distance from arrow center (extended for easier triggering)
const ARROW_HIT_ZONE_X_BUFFER = 100 // pixels; horizontal distance from arrow center (extended for easier triggering)
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

// check if cursor is within the rectangular hit zone around the arrow
// simpler rectangular logic ensures consistent triggering from any direction
function isInArrowHitZone(clientX: number, clientY: number): boolean {
  // if arrow position is not set yet, do not trigger
  if (arrowCenterX === 0 && arrowCenterY === 0) return false

  const distX = Math.abs(clientX - arrowCenterX)
  const distY = Math.abs(clientY - arrowCenterY)
  
  const inZone = distX <= ARROW_HIT_ZONE_X_BUFFER && distY <= ARROW_HIT_ZONE_Y_BUFFER
  
  // Debug logging to see what's happening
  if (inZone || (distX < ARROW_HIT_ZONE_X_BUFFER * 1.5 && distY < ARROW_HIT_ZONE_Y_BUFFER * 1.5)) {
    console.debug('Arrow zone check:', { clientX, clientY, arrowCenterX, arrowCenterY, distX, distY, inZone })
  }
  
  // rectangular zone: within X and Y buffers = fully open
  return inZone
}

// expose method to allow parent to set arrow position
function setArrowCenter(x: number, y: number) {
  arrowCenterX = x
  arrowCenterY = y
  console.debug('arrow center updated', { arrowCenterX, arrowCenterY, xBuffer: ARROW_HIT_ZONE_X_BUFFER, yBuffer: ARROW_HIT_ZONE_Y_BUFFER })
}

// Expose method to parent component
defineExpose({
  setArrowCenter
})

let densityTick = 0
function startDensityLoop() {
  if (rafId !== null) return
  console.debug('startDensityLoop')
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
      console.debug('generateMask in loop', { currentDensity: currentDensity.value, diff, isPointerActive, activityFactor })
      generateMask(currentDensity.value)
      densityTick = 0
    }

    // stop animating shortly after movement stops
    if (!isPointerActive && now - lastMoveTime > movementKeepAlive) {
      // freeze at currentDensity; do a final gentle deterministic render
      console.info('stopping density loop (inactive)', { currentDensity: currentDensity.value })
      generateMask(currentDensity.value, true)
      rafId = null
      return
    }

    // continue until explicitly stopped or until close enough when not active
    if (diff > 0.00005 || isPointerActive) {
      rafId = requestAnimationFrame(step)
    } else {
      console.debug('final generateMask', targetDensity.value)
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
  // attempt to autoplay (muted) on mount and ensure loop behavior
  if (videoEl.value) {
    videoEl.value.muted = true
    videoEl.value.loop = true

    const onEnded = () => {
      if (!videoEl.value) return
      try {
        videoEl.value.currentTime = 0
        videoEl.value.play().catch(() => {})
      } catch (e) {}
    }
    
    const onCanPlay = () => {
      videoLoaded.value = true
    }
    
    videoEl.value.addEventListener('ended', onEnded)
    videoEl.value.addEventListener('canplay', onCanPlay)

    videoEl.value.play().catch(() => {
      // autoplay failed silently (user gesture required)
    })

    // cleanup on unmount
    onUnmounted(() => {
      if (videoEl.value) {
        videoEl.value.removeEventListener('ended', onEnded)
        videoEl.value.removeEventListener('canplay', onCanPlay)
      }
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
      console.info('onPointerMove', { clientYInside, y, mapped })
      // ensure the loop is running to continue rendering while moving
      startDensityLoop()
    }

    const onPointerLeave = () => {
      // stop animating when leaving; do not return to center automatically
      isPointerActive = false
      lastPointerY = null
      lastMoveTime = performance.now()
      // stopDensityLoop will be triggered by the loop when it detects inactivity
      console.info('onPointerLeave — stopping active movement')
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
      console.info('onTouchMove', { clientYInside, y, mapped })
      startDensityLoop()
    }

    // attach listeners to the mask container
    videoMaskEl.value?.addEventListener('pointermove', onPointerMove)
    videoMaskEl.value?.addEventListener('pointerleave', onPointerLeave)
    videoMaskEl.value?.addEventListener('touchmove', onTouchMove)
    videoMaskEl.value?.addEventListener('touchend', onPointerLeave)

    // quick click preview to force an immediate mask update for testing
    const onClick = (ev: MouseEvent) => {
      const el = videoMaskEl.value
      if (!el) return
      const r = el.getBoundingClientRect()
      const clientYInside = ev.clientY - r.top
      const y = clamp(clientYInside / r.height)
      const mapped = y
      console.info('onClick', { clientYInside, y, mapped })
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
      console.info('onWindowPointerMove', { clientYInside, y, mapped })
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
      console.info('onWindowTouchMove', { clientYInside, y, mapped })
      startDensityLoop()
    }

    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('touchmove', onWindowTouchMove)

    console.debug('pointer/touch listeners attached')

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
    })
  })
})

// if the source changes, re-apply loop and try to play
watch(videoSrc, (val) => {
  if (videoEl.value && val) {
    videoEl.value.loop = true
    videoEl.value.play().catch(() => {})
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
  console.info('generateMask (stripes)', { density, stripeWidth })

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
 

    <div v-if="videoSrc" ref="videoMaskEl" :style="{'--mask-url': maskUrl}" class="video-mask relative overflow-hidden" :class="{ 'video-loaded': videoLoaded }">
      <video
        ref="videoEl"
        :src="videoSrc"
        :poster="posterSrc"
        autoplay
        muted
        playsinline
        loop
        class="video-element absolute inset-0"
      >
        Your browser does not support the video tag.
      </video>
    </div>

    <div v-else class="p-8 text-center text-gray-300">
      <p class="mb-4">No hero video found.</p>
      <p class="text-sm">Add a video at <code>docs/media/hero.mp4</code> (mp4 preferred) or update the component to point to your file.</p>
    </div>
  </div>
</template>

<style scoped>
.full-bleed {
  width: 100vw;
  margin-left: calc(50% - 50vw);
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
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 800ms ease-out, transform 800ms ease-out;
}

.video-mask.video-loaded {
  opacity: 1;
  transform: translateY(0);
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
  opacity: 1;
  transition: opacity 200ms ease, transform 240ms cubic-bezier(.2,.9,.3,1);
  border-radius: inherit;
  /* allow nudging the visible video down without changing container height */
  transform: translateY(var(--video-top-offset, 0px));
  will-change: transform;
}

</style>
