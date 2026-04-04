<script setup lang="ts">
import { withBase } from 'vitepress'
import ShapeBadge from './ShapeBadge.vue'
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

defineProps<{
  isVisualPage?: boolean
  isSoundworksPage?: boolean
  isInstallationsPage?: boolean
}>()

const navbarHovering = ref(false)
const shapeRef = ref()
const aboutLinkRef = ref<HTMLAnchorElement | null>(null)
const installationsLinkRef = ref<HTMLAnchorElement | null>(null)

function updateInstallationsOffset() {
  if (typeof document === 'undefined') return

  const aboutLink = aboutLinkRef.value
  if (aboutLink) {
    const aboutLeft = Math.round(aboutLink.getBoundingClientRect().left)
    document.documentElement.style.setProperty('--nav-about-left', `${aboutLeft}px`)
  }

  const link = installationsLinkRef.value
  if (!link) return

  const left = Math.round(link.getBoundingClientRect().left)
  document.documentElement.style.setProperty('--nav-installations-left', `${left}px`)
}

function goHome() {
  if (typeof window !== 'undefined') {
    window.location.assign(withBase('/'))
  }
}

function onMenuMouseMove(e: MouseEvent) {
  navbarHovering.value = true
  shapeRef.value?.updateMouseFromEvent?.(e)
}

function onMenuMouseLeave() {
  navbarHovering.value = false
  shapeRef.value?.resetMotion?.()
}

onMounted(() => {
  nextTick(() => {
    updateInstallationsOffset()
    window.addEventListener('resize', updateInstallationsOffset)
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', updateInstallationsOffset)
})
</script>

<template>
  <header :class="['relative z-40 transition-colors duration-700', isVisualPage ? 'bg-white text-gray-900' : 'text-gray-100']" :style="isSoundworksPage ? { backgroundColor: '#373c40' } : isInstallationsPage ? { backgroundColor: '#555a5e' } : (!isVisualPage ? { backgroundColor: '#292c2f' } : {})" style="height: 112px;">
    <!-- position the badge near the top-left corner -->
    <div class="absolute left-4 top-3 z-50">
      <ShapeBadge ref="shapeRef" :isVisualPage="isVisualPage" :navbarHovering="navbarHovering" @toggle="goHome" />
    </div>

    <!-- minimal menu that appears next to the badge -->
    <nav class="minimal-menu" @mousemove="onMenuMouseMove" @mouseleave="onMenuMouseLeave">
      <a ref="aboutLinkRef" :href="withBase('/about/')" class="menu-link">About</a>
      <a :href="withBase('/soundworks/')" class="menu-link">Sound</a>
      <a ref="installationsLinkRef" :href="withBase('/installations/')" class="menu-link">Installations</a>
      <a :href="withBase('/paintings-sketches/')" class="menu-link">Visual</a>
    </nav>

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
</style>
