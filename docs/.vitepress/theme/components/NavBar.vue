<script setup lang="ts">
import { useData, withBase, useRoute } from 'vitepress'
import ShapeBadge from './ShapeBadge.vue'
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'

defineProps<{
  isVisualPage?: boolean
  isSoundworksPage?: boolean
  isInstallationsPage?: boolean
}>()

const { theme } = useData()
const nav = theme.value.nav || []
const route = useRoute()
const isHome = computed(() => route.path === '/')
const menuOpen = ref(false)
const navbarHovering = ref(false)
const shapeRef = ref()

function toggleMenu() {
  menuOpen.value = !menuOpen.value
  // Persist menu state to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem('menuOpen', menuOpen.value.toString())
  }
}

function closeMenu() {
  menuOpen.value = false
  // Persist menu state to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem('menuOpen', 'false')
  }
}

// Restore menu state from localStorage on mount
onMounted(() => {
  if (typeof window !== 'undefined') {
    const savedMenuState = localStorage.getItem('menuOpen')
    if (savedMenuState === 'true') {
      menuOpen.value = true
    }
    // If the user just unlocked the site, ensure the menu starts closed
    if (localStorage.getItem('unlocked')) {
      closeMenu()
    }
    
    // Close menu when app:unlocked event is triggered (user exits Unlock page)
    window.addEventListener('app:unlocked', closeMenu)
  }
})

// Keep menu open when navigating
watch(() => route.path, () => {
  // Menu state is now persisted, so it stays as-is during navigation
})

function onMenuMouseMove(e: MouseEvent) {
  if (!menuOpen.value) return
  navbarHovering.value = true
  shapeRef.value?.updateMouseFromEvent?.(e)
}

function onMenuMouseLeave() {
  navbarHovering.value = false
  shapeRef.value?.resetMotion?.()
}

// Cleanup event listener on unmount
onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('app:unlocked', closeMenu)
  }
})
</script>

<template>
  <header :class="['relative z-40 transition-colors duration-700', isVisualPage ? 'bg-white text-gray-900' : 'text-gray-100']" :style="isSoundworksPage ? { backgroundColor: '#373c40' } : isInstallationsPage ? { backgroundColor: '#555a5e' } : (!isVisualPage ? { backgroundColor: '#292c2f' } : {})" style="height: 112px;">
    <!-- position the badge near the top-left corner -->
    <div class="absolute left-4 top-3 z-50">
      <ShapeBadge ref="shapeRef" :menuOpen="menuOpen" :isVisualPage="isVisualPage" :navbarHovering="navbarHovering" @toggle="toggleMenu" />
    </div>

    <!-- minimal menu that appears next to the badge -->
    <Transition name="slide-fade">
      <nav v-if="menuOpen" class="minimal-menu" @mousemove="onMenuMouseMove" @mouseleave="onMenuMouseLeave">
        <a :href="withBase('/soundworks/')" class="menu-link">Soundworks</a>
        <a :href="withBase('/installations/')" class="menu-link">Installations</a>
        <a :href="withBase('/paintings-sketches/')" class="menu-link">Visual</a>
        <a :href="withBase('/about/')" class="menu-link">About</a>
        <a v-if="!isHome" :href="withBase('/')" class="menu-link">Home</a>
      </nav>
    </Transition>

    <nav class="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8" style="height: 100%;">
      <div></div>

      <!-- top-right nav removed; navigation moved to homepage low-center -->
      <div></div>
    </nav>
  </header>
</template>

<style scoped>
.minimal-menu {
  position: absolute;
  left: 148px;
  top: calc(50% + 44px);
  transform: translateY(-50%);
  display: flex;
  gap: 1.5rem;
  z-index: 40;
  padding: 44px 0;
  margin: -44px 0;
  pointer-events: auto;
}

.menu-link {
  color: inherit;
  font-size: 0.95rem;
  text-decoration: none;
  transition: opacity 0.2s ease;
  white-space: nowrap;
  pointer-events: auto;
}

.menu-link:hover {
  opacity: 0.7;
}

/* Slide fade transition */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateX(-20px) translateY(-50%);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-20px) translateY(-50%);
}
</style>
