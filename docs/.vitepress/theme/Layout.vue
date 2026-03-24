<script setup lang="ts">
import { useData, useRoute, withBase } from 'vitepress'
import NavBar from './components/NavBar.vue'
import WorkPage from './components/WorkPage.vue'
import WorkStack from './components/WorkStack.vue'
import AboutPage from './components/AboutPage.vue'
import HeroSection from './home-page-components/hero-section/HeroSection.vue'
import VideoWall from './components/VideoWall.vue'
import Unlock from './components/Unlock.vue'
import ShapeBadge from './components/ShapeBadge.vue'
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'

const { frontmatter, site } = useData()
const route = useRoute()

// Remove base from the path so matching works in dev & GitHub Pages
const normalizedPath = computed(() => {
  const base = site.value.base || '/'
  // ensure leading slash and strip any base prefix
  return route.path.replace(base, '/') || '/'
})

const currentPageComponent = computed(() => {
  if (frontmatter.value.layout === 'home') return WorkStack
  if (normalizedPath.value.startsWith('/installations/')) return WorkPage
  if (normalizedPath.value.startsWith('/soundworks/')) return WorkPage
  if (normalizedPath.value.startsWith('/paintings-sketches/')) return WorkPage
  if (normalizedPath.value.startsWith('/about')) return AboutPage
  return null
})

// Check if on Visual (paintings-sketches) page
const isVisualPage = computed(() => normalizedPath.value.startsWith('/paintings-sketches/'))

// Check if on Soundworks page
const isSoundworksPage = computed(() => normalizedPath.value.startsWith('/soundworks/'))

// Check if on Installations page
const isInstallationsPage = computed(() => normalizedPath.value.startsWith('/installations/'))

const pageChromeClass = computed(() => {
  if (isVisualPage.value) return 'min-h-screen font-plexsans transition-colors duration-700 bg-white text-gray-900'
  if (isSoundworksPage.value || isInstallationsPage.value) return 'min-h-screen font-plexsans transition-colors duration-700 text-gray-100'
  return 'min-h-screen font-plexsans transition-colors duration-700 bg-gray-900 text-gray-100'
})

const pageChromeStyle = computed(() => {
  if (isSoundworksPage.value) return { backgroundColor: '#373c40' }
  if (isInstallationsPage.value) return { backgroundColor: '#555a5e' }
  return {}
})

// Helpful boolean for homepage (low centered vertical nav)
const isHome = computed(() => frontmatter.value.layout === 'home' || normalizedPath.value === '/')

// Refs for arrow and VideoWall
const arrowButtonRef = ref<HTMLElement | null>(null)
const videoWallRef = ref<InstanceType<typeof VideoWall> | null>(null)
const belowHeroRef = ref<HTMLElement | null>(null)
const showScrollUpButton = ref(false)

// whether to show the unlock screen (null = unknown during SSR, true = show unlock, false = show site)
const showUnlock = ref<boolean | null>(null)

// Heartbeat config: keep unlock alive across windows while the browser/session is active
const HEARTBEAT_INTERVAL = 2000 // ms
const HEARTBEAT_TTL = 5000 // consider session dead if no heartbeat within this ms
let heartbeatTimer: number | null = null
let expiryCheckTimer: number | null = null

function startHeartbeat() {
  if (heartbeatTimer !== null) return
  // immediately update once
  try { localStorage.setItem('unlockHeartbeat', Date.now().toString()) } catch (e) {}
  heartbeatTimer = window.setInterval(() => {
    try { localStorage.setItem('unlockHeartbeat', Date.now().toString()) } catch (e) {}
  }, HEARTBEAT_INTERVAL)
}

function stopHeartbeat() {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function checkHeartbeatFresh() {
  const hb = Number(localStorage.getItem('unlockHeartbeat') || '0')
  if (localStorage.getItem('unlocked') && Date.now() - hb < HEARTBEAT_TTL) {
    // active session — hide unlock
    if (showUnlock.value !== false) showUnlock.value = false
    startHeartbeat()
  } else {
    // expired or not set — ensure unlocked flag not lingering
    if (localStorage.getItem('unlocked')) try { localStorage.removeItem('unlocked') } catch (e) {}
    if (showUnlock.value !== true) showUnlock.value = true
    stopHeartbeat()
  }
}

function handleStorageEvent(e: StorageEvent) {
  if (e.key === 'unlocked') {
    if (e.newValue) {
      showUnlock.value = false
      startHeartbeat()
    } else {
      showUnlock.value = true
      stopHeartbeat()
    }
  }
  if (e.key === 'unlockHeartbeat') {
    const hb = Number(e.newValue || '0')
    if (localStorage.getItem('unlocked') && Date.now() - hb < HEARTBEAT_TTL) {
      showUnlock.value = false
      startHeartbeat()
    }
  }
}

function scrollToBelow() {
  const el = document.getElementById('below-hero')
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' })
  } else {
    window.scrollBy({ top: window.innerHeight, behavior: 'smooth' })
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function updateScrollUpVisibility() {
  // Show button when scrolled past the hero section
  const heroHeight = window.innerHeight - 112 // 112px is navbar height
  showScrollUpButton.value = window.scrollY > heroHeight
}

function updateArrowPosition() {
  if (!arrowButtonRef.value || !videoWallRef.value) return
  const rect = arrowButtonRef.value.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  videoWallRef.value.setArrowCenter(centerX, centerY)
}

onMounted(() => {
  // check initial state
  checkHeartbeatFresh()

  // keep checking in the background in case the heartbeat expires
  expiryCheckTimer = window.setInterval(checkHeartbeatFresh, HEARTBEAT_INTERVAL)

  // respond to other windows updating localStorage
  window.addEventListener('storage', handleStorageEvent)

  // respond to unlock events triggered in the same window (Unlock.vue will dispatch)
  window.addEventListener('app:unlocked', () => {
    showUnlock.value = false
    startHeartbeat()
  })

  // Update arrow position for VideoWall mask interaction
  nextTick(() => {
    updateArrowPosition()
    window.addEventListener('resize', updateArrowPosition)
    window.addEventListener('scroll', updateArrowPosition)
    window.addEventListener('scroll', updateScrollUpVisibility)
  })
})

onUnmounted(() => {
  stopHeartbeat()
  if (expiryCheckTimer !== null) {
    clearInterval(expiryCheckTimer)
    expiryCheckTimer = null
  }
  window.removeEventListener('storage', handleStorageEvent)
  window.removeEventListener('app:unlocked', () => {})
  window.removeEventListener('resize', updateArrowPosition)
  window.removeEventListener('scroll', updateArrowPosition)
  window.removeEventListener('scroll', updateScrollUpVisibility)
})
</script>

<template>
  <!-- Show Unlock screen (or placeholder) until session is determined as unlocked -->
  <div v-if="showUnlock !== false" class="min-h-screen bg-gray-900 flex items-center justify-center">
    <!-- Explicit unlock mode: show the Unlock component when ready -->
    <div v-if="showUnlock === true">
      <Unlock />
    </div>
    <!-- Placeholder while we determine client state (prevents nav/video flash) -->
    <div v-else class="w-full h-full"></div>
  </div>

  <!-- Normal site chrome (NavBar + content) when unlocked -->
  <div v-else :class="['layout-chrome', pageChromeClass]" :style="pageChromeStyle">
    <NavBar :isVisualPage="isVisualPage" :isSoundworksPage="isSoundworksPage" :isInstallationsPage="isInstallationsPage" />

    <!-- full-bleed hero video for homepage (hidden until unlocked) -->
    <div v-if="isHome">
      <div class="hero-section" style="height: calc(100vh - 112px); position: relative;">
        <VideoWall ref="videoWallRef" />
        
        <!-- arrow fixed at bottom of viewport, only visible on homepage -->
        <button ref="arrowButtonRef" @click="scrollToBelow" class="fixed left-1/2 transform -translate-x-1/2 z-40 bg-transparent p-2 arrow-button" style="bottom: 24px;" aria-label="Scroll down">
          <svg class="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14"></path>
            <path d="M19 12l-7 7-7-7"/>
          </svg>
        </button>
      </div>

      <!-- content below the hero; the arrow scrolls to this area -->
      <div id="below-hero" ref="belowHeroRef" class="below-hero layout-section-pad flex flex-col items-center justify-center gap-8" style="min-height: 100vh; position: relative;">
        <!-- Large interactive shape (no hover effects, just cursor tracking) -->
        <ShapeBadge :isVisualPage="isVisualPage" :disableHoverEffects="true" :scale="8" :strokeWidth="1.5" :disableCycling="true" :showBackgroundLayers="true" :showHoverText="true" />
        
        <!-- scroll up button that appears at top when scrolled down -->
        <button v-if="showScrollUpButton" @click="scrollToTop" class="fixed left-1/2 transform -translate-x-1/2 z-40 bg-transparent p-2 arrow-button" style="top: 24px; transition: opacity 0.3s ease;" aria-label="Scroll up">
          <svg class="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 19V5"></path>
            <path d="M5 12l7-7 7 7"/>
          </svg>
        </button>
      </div>
    </div>

    <main class="layout-main">
      <component
        v-if="currentPageComponent"
        :is="currentPageComponent"
        :key="route.path"
      />
      <Content
        v-else
        class="prose prose-base md:prose-lg lg:prose-xl max-w-none mt-8 prose-invert"
      />
    </main>
  </div>
</template>
