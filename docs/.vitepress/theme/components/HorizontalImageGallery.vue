<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import metadata from '../../../paintings-sketches/images/metadata.json'

type ImportMetaWithGlob = ImportMeta & {
  glob: (
    pattern: string,
    options: { eager: true; query: '?url'; import: 'default' }
  ) => Record<string, string>
}

// Import all images from paintings-sketches/images folder
const imageModules = (import.meta as ImportMetaWithGlob).glob('../../../paintings-sketches/images/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' })

const imageFilenameByUrl = computed(() => {
  const entries = Object.entries(imageModules) as Array<[string, string]>
  return new Map(entries.map(([modulePath, url]) => [url, modulePath.split('/').pop() || '']))
})

function getImageFilename(imagePath: string): string {
  return imageFilenameByUrl.value.get(imagePath) || imagePath.split('/').pop() || ''
}

const images = computed(() => {
  const imgs = Object.values(imageModules) as string[]
  // Sort images by filename numerically (1.jpg, 2.jpg, 10.jpg, etc.)
  return imgs.sort((a, b) => {
    const fileA = getImageFilename(a)
    const fileB = getImageFilename(b)
    const numA = parseInt(fileA.match(/\d+/)?.[0] || '999')
    const numB = parseInt(fileB.match(/\d+/)?.[0] || '999')
    return numA - numB
  })
})

type GalleryCategory = 'Sketchbooks' | 'Drawings' | 'Collage' | 'Paintings' | 'Mixed Media' | 'All'
type RealGalleryCategory = Exclude<GalleryCategory, 'All'>

type ImageMeta = {
  title?: string
  year?: string
  materials?: string
  dimensions?: string
  category?: string | string[]
}

type ViewMode = 'gallery' | 'grid'

const metadataMap = metadata as Record<string, ImageMeta>
const galleryCategories: GalleryCategory[] = ['Sketchbooks', 'Drawings', 'Collage', 'Paintings', 'Mixed Media', 'All']
const selectedCategory = ref<GalleryCategory>('All')
const viewMode = ref<ViewMode>('gallery')

const menuCategories = computed<GalleryCategory[]>(() => {
  return ['All', ...galleryCategories.filter(cat => cat !== 'All')]
})

const CATEGORY_ORDER: RealGalleryCategory[] = ['Sketchbooks', 'Drawings', 'Collage', 'Paintings', 'Mixed Media']
const UNCATEGORIZED_ORDER = CATEGORY_ORDER.length

const scrollContainer = ref<HTMLElement | null>(null)
const galleryRootEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const galleryViewEl = ref<HTMLElement | null>(null)
const gridViewEl = ref<HTMLElement | null>(null)
const lightboxImage = ref<string | null>(null)
const lightboxVisible = ref(false)
const firstItemEl = ref<HTMLElement | null>(null)
const lastItemEl = ref<HTMLElement | null>(null)
const leftEdgeBuffer = ref(16)
const rightEdgeBuffer = ref(16)
const didInitialCenter = ref(false)
const disableGridMove = ref(false)
const forceHorizontalMenu = ref(false)
const hasUserStoppedAutoScroll = ref(false)
let gridMoveResetTimer: ReturnType<typeof setTimeout> | null = null
let menuLayoutRaf: number | null = null
let autoScrollRaf: number | null = null
let autoScrollStartTimer: ReturnType<typeof setTimeout> | null = null
let autoScrollDirection = 1
let autoScrollLastTs = 0
let autoScrollPosition = 0

const AUTO_SCROLL_SPEED = 22 // pixels per second

// Get metadata for an image by filename
function getMetadata(imagePath: string): ImageMeta | null {
  const filename = getImageFilename(imagePath)
  return metadataMap[filename] || null
}

function normalizeCategory(raw?: string): GalleryCategory | null {
  const normalized = (raw || '').trim().toLowerCase()
  if (normalized === 'scans') return 'Mixed Media'
  const found = galleryCategories.find(cat => cat.toLowerCase() === normalized)
  return found || null
}

function getImageCategories(imagePath: string): GalleryCategory[] {
  const rawCategory = getMetadata(imagePath)?.category
  const rawList = Array.isArray(rawCategory)
    ? rawCategory
    : typeof rawCategory === 'string'
      ? rawCategory.split(',').map(v => v.trim()).filter(Boolean)
      : []

  const normalized = rawList
    .map(v => normalizeCategory(v))
    .filter((v): v is GalleryCategory => v !== null && v !== 'All')

  return normalized.length ? normalized : ['All']
}

const filteredImages = computed(() => {
  if (selectedCategory.value === 'All') return images.value
  return images.value.filter(img => getImageCategories(img).includes(selectedCategory.value))
})

function getImageGroupOrder(imagePath: string): number {
  const categories = getImageCategories(imagePath).filter(v => v !== 'All')
  if (!categories.length) return UNCATEGORIZED_ORDER

  const firstMatch = CATEGORY_ORDER.findIndex(cat => categories.includes(cat))
  return firstMatch === -1 ? UNCATEGORIZED_ORDER : firstMatch
}

function numericFilenameSort(a: string, b: string): number {
  const fileA = getImageFilename(a)
  const fileB = getImageFilename(b)
  const numA = parseInt(fileA.match(/\d+/)?.[0] || '999')
  const numB = parseInt(fileB.match(/\d+/)?.[0] || '999')
  return numA - numB
}

const gridSortedImages = computed(() => {
  return [...filteredImages.value].sort((a, b) => {
    const groupA = getImageGroupOrder(a)
    const groupB = getImageGroupOrder(b)
    if (groupA !== groupB) return groupA - groupB
    return numericFilenameSort(a, b)
  })
})

function setItemRef(index: number, total: number, el: unknown) {
  const htmlEl = el instanceof HTMLElement ? el : null
  if (index === 0) firstItemEl.value = htmlEl
  if (index === total - 1) lastItemEl.value = htmlEl
}

function setGalleryViewRef(el: unknown) {
  const htmlEl = el instanceof HTMLElement ? el : null
  scrollContainer.value = htmlEl
  galleryViewEl.value = htmlEl
}

function updateEdgeBuffers() {
  const container = scrollContainer.value
  const first = firstItemEl.value
  const last = lastItemEl.value
  if (!container || !first || !last) {
    leftEdgeBuffer.value = 16
    rightEdgeBuffer.value = 16
    return
  }

  const containerWidth = container.clientWidth
  const styles = getComputedStyle(container)
  const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0

  // subtract one flex gap because there is a gap between spacer and first/last item
  leftEdgeBuffer.value = Math.max(16, (containerWidth - first.offsetWidth) / 2 - gap)
  rightEdgeBuffer.value = Math.max(16, (containerWidth - last.offsetWidth) / 2 - gap)
}

function smoothScrollBy(container: HTMLElement, distance: number, duration: number) {
  const start = container.scrollLeft
  const startTime = performance.now()

  function step(currentTime: number) {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / duration, 1)
    // Ease in-out cubic
    const ease = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2
    container.scrollLeft = start + distance * ease
    if (progress < 1) requestAnimationFrame(step)
  }

  requestAnimationFrame(step)
}

// How many pixels from center counts as "already centered"
const CENTER_THRESHOLD = 80

function centerImage(event: MouseEvent, image: string) {
  stopAutoScrollByUserIntent()

  const container = scrollContainer.value
  const target = (event.currentTarget as HTMLElement)
  if (!container || !target) return

  const containerRect = container.getBoundingClientRect()
  const imageRect = target.getBoundingClientRect()
  const scrollOffset = (imageRect.left + imageRect.width / 2) - (containerRect.left + containerRect.width / 2)

  if (Math.abs(scrollOffset) <= CENTER_THRESHOLD) {
    // Already centered enough — open lightbox immediately
    openLightbox(image)
  } else {
    // Not centered — scroll into place, no lightbox
    smoothScrollBy(container, scrollOffset, 900)
  }
}

function openLightbox(image: string) {
  lightboxImage.value = image
  lightboxVisible.value = true
}

function closeLightbox() {
  lightboxVisible.value = false
  setTimeout(() => { lightboxImage.value = null }, 400)
}

function setCategory(category: GalleryCategory) {
  stopAutoScrollByUserIntent()
  selectedCategory.value = category
  closeLightbox()
  if (viewMode.value === 'gallery' && scrollContainer.value) {
    scrollContainer.value.scrollTo({ left: 0, behavior: 'auto' })
  }
  if (viewMode.value === 'gallery') {
    nextTick(updateEdgeBuffers)
  }
}

function toggleViewMode() {
  stopAutoScrollByUserIntent()
  viewMode.value = viewMode.value === 'gallery' ? 'grid' : 'gallery'
  closeLightbox()

  if (viewMode.value === 'gallery') {
    nextTick(() => {
      scrollContainer.value?.scrollTo({ left: 0, behavior: 'auto' })
      updateEdgeBuffers()
    })
  }
}

function onGridBeforeLeave(el: Element) {
  if (disableGridMove.value) return
  const item = el as HTMLElement
  item.style.width = `${item.offsetWidth}px`
  item.style.height = `${item.offsetHeight}px`
}

function onGridAfterLeave(el: Element) {
  const item = el as HTMLElement
  item.style.width = ''
  item.style.height = ''
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeLightbox()
}

function onResize() {
  updateEdgeBuffers()
  scheduleMenuLayoutUpdate()
}

function stopAutoScroll() {
  if (autoScrollStartTimer !== null) {
    clearTimeout(autoScrollStartTimer)
    autoScrollStartTimer = null
  }
  if (autoScrollRaf !== null) {
    cancelAnimationFrame(autoScrollRaf)
    autoScrollRaf = null
  }
  autoScrollLastTs = 0
  autoScrollPosition = 0
}

function stopAutoScrollByUserIntent() {
  hasUserStoppedAutoScroll.value = true
  stopAutoScroll()
}

function onGalleryUserIntent() {
  stopAutoScrollByUserIntent()
}

function runAutoScroll(ts: number) {
  const container = scrollContainer.value
  if (!container || viewMode.value !== 'gallery' || hasUserStoppedAutoScroll.value) {
    stopAutoScroll()
    return
  }

  const maxScroll = container.scrollWidth - container.clientWidth
  if (maxScroll <= 0) {
    autoScrollRaf = requestAnimationFrame(runAutoScroll)
    return
  }

  if (autoScrollLastTs === 0) {
    autoScrollLastTs = ts
    autoScrollPosition = container.scrollLeft
  }

  const dt = Math.max(0, ts - autoScrollLastTs)
  autoScrollLastTs = ts

  let nextScrollLeft = autoScrollPosition + autoScrollDirection * (AUTO_SCROLL_SPEED * dt / 1000)

  if (nextScrollLeft >= maxScroll) {
    nextScrollLeft = maxScroll
    autoScrollDirection = -1
  } else if (nextScrollLeft <= 0) {
    nextScrollLeft = 0
    autoScrollDirection = 1
  }

  autoScrollPosition = nextScrollLeft
  container.scrollLeft = nextScrollLeft
  autoScrollRaf = requestAnimationFrame(runAutoScroll)
}

function startAutoScrollIfEligible() {
  if (viewMode.value !== 'gallery' || hasUserStoppedAutoScroll.value) return
  if (!scrollContainer.value) return
  if (autoScrollRaf !== null) return
  autoScrollDirection = 1
  autoScrollLastTs = 0
  autoScrollRaf = requestAnimationFrame(runAutoScroll)
}

function scheduleAutoScrollStart(delayMs = 700) {
  if (viewMode.value !== 'gallery' || hasUserStoppedAutoScroll.value) return
  if (autoScrollStartTimer !== null) {
    clearTimeout(autoScrollStartTimer)
  }
  autoScrollStartTimer = setTimeout(() => {
    autoScrollStartTimer = null
    startAutoScrollIfEligible()
  }, delayMs)
}

function onImageLoad() {
  nextTick(() => {
    updateEdgeBuffers()
    scheduleMenuLayoutUpdate()
    scheduleAutoScrollStart(350)
    if (!didInitialCenter.value) {
      scrollContainer.value?.scrollTo({ left: 0, behavior: 'auto' })
      didInitialCenter.value = true
    }
  })
}

function getLeadingContentRect(): DOMRect | null {
  if (viewMode.value === 'gallery') {
    const firstGalleryItem = galleryViewEl.value?.querySelector<HTMLElement>('.group')
    return firstGalleryItem?.getBoundingClientRect() || galleryViewEl.value?.getBoundingClientRect() || null
  }

  const firstGridItem = gridViewEl.value?.querySelector<HTMLElement>('.gallery-grid-item')
  return firstGridItem?.getBoundingClientRect() || gridViewEl.value?.getBoundingClientRect() || null
}

function updateMenuLayoutMode() {
  const menu = menuEl.value
  if (!menu) return

  // Keep mobile behavior explicit and stable.
  if (window.innerWidth <= 768) {
    forceHorizontalMenu.value = true
    return
  }

  const contentRect = getLeadingContentRect()
  if (!contentRect) {
    forceHorizontalMenu.value = false
    return
  }

  const menuRect = menu.getBoundingClientRect()
  const requiredGap = 18
  const overlaps = menuRect.right + requiredGap > contentRect.left
  forceHorizontalMenu.value = overlaps
}

function scheduleMenuLayoutUpdate() {
  if (typeof window === 'undefined') return
  if (menuLayoutRaf !== null) cancelAnimationFrame(menuLayoutRaf)
  menuLayoutRaf = requestAnimationFrame(() => {
    menuLayoutRaf = null
    updateMenuLayoutMode()
  })
}

watch([filteredImages, viewMode], async () => {
  await nextTick()
  if (viewMode.value === 'gallery') {
    updateEdgeBuffers()
    scheduleAutoScrollStart()
  } else {
    stopAutoScroll()
  }
  scheduleMenuLayoutUpdate()
})

watch(
  () => scrollContainer.value,
  async (container) => {
    if (!container) return
    await nextTick()
    scheduleAutoScrollStart()
  }
)

watch(filteredImages, (newImages, oldImages = []) => {
  const oldSet = new Set(oldImages)
  const hasSharedImages = newImages.some(img => oldSet.has(img))

  // If there is no overlap between categories, avoid move animation.
  // New images should fade in at their final position.
  disableGridMove.value = !hasSharedImages

  if (gridMoveResetTimer) {
    clearTimeout(gridMoveResetTimer)
    gridMoveResetTimer = null
  }

  if (disableGridMove.value) {
    gridMoveResetTimer = setTimeout(() => {
      disableGridMove.value = false
      gridMoveResetTimer = null
    }, 420)
  }

  nextTick(() => {
    scheduleMenuLayoutUpdate()
  })
})

onMounted(async () => {
  hasUserStoppedAutoScroll.value = false
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', onResize)
  await nextTick()
  updateEdgeBuffers()
  scheduleMenuLayoutUpdate()
  // Keep the first image centered on initial load
  scrollContainer.value?.scrollTo({ left: 0, behavior: 'auto' })
  scheduleAutoScrollStart(900)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', onResize)
  stopAutoScroll()
  if (menuLayoutRaf !== null) {
    cancelAnimationFrame(menuLayoutRaf)
    menuLayoutRaf = null
  }
  if (gridMoveResetTimer) {
    clearTimeout(gridMoveResetTimer)
    gridMoveResetTimer = null
  }
})
</script>

<template>
  <div v-if="images.length > 0" ref="galleryRootEl" class="relative w-full gallery-root" :class="{ 'menu-horizontal': forceHorizontalMenu }">
    <!-- Shared category menu for both modes -->
    <nav ref="menuEl" class="gallery-menu gallery-menu-vertical" :class="{ 'gallery-menu-force-horizontal': forceHorizontalMenu }" aria-label="Gallery categories">
      <button
        class="gallery-menu-link gallery-menu-toggle"
        @click="toggleViewMode"
      >
        {{ viewMode === 'gallery' ? 'Grid' : 'Gallery' }}
      </button>
      <button
        v-for="category in menuCategories"
        :key="category"
        class="gallery-menu-link gallery-menu-category"
        :class="{ 'is-active': selectedCategory === category }"
        @click="setCategory(category)"
      >
        {{ category }}
      </button>
    </nav>

    <Transition name="mode-fade" mode="out-in">
      <!-- Horizontal gallery view -->
      <div
        v-if="viewMode === 'gallery'"
        :key="`gallery-${selectedCategory}`"
        :ref="setGalleryViewRef"
        class="gallery-view flex gap-6 overflow-x-auto"
        style="scroll-behavior: auto;"
        @wheel.passive="onGalleryUserIntent"
        @touchstart.passive="onGalleryUserIntent"
        @pointerdown="onGalleryUserIntent"
      >
        <div class="edge-spacer" :style="{ width: `${leftEdgeBuffer}px` }" aria-hidden="true"></div>
        <div
          v-for="(image, index) in filteredImages"
          :key="index"
          class="flex-shrink-0 flex flex-col group"
          :ref="(el) => setItemRef(index, filteredImages.length, el)"
          @click="(e) => centerImage(e, image)"
        >
          <img
            :src="image"
            :alt="`Visual ${index + 1}`"
            class="h-screen max-h-[600px] object-cover rounded-lg hover:scale-105 transition-transform duration-300 cursor-pointer mobile:max-h-[400px] tablet:max-h-[500px]"
            @load="onImageLoad"
          />
          <!-- Metadata displayed underneath -->
          <div class="mt-3 text-sm text-gray-700 text-center gallery-meta">
            <p class="font-semibold text-gray-800 gallery-meta-title">{{ getMetadata(image)?.title || '\u00A0' }}</p>
            <p class="text-gray-700 gallery-meta-line">{{ getMetadata(image)?.year || '\u00A0' }}</p>
            <p class="text-gray-700 gallery-meta-line">{{ getMetadata(image)?.materials || '\u00A0' }}</p>
            <p class="text-gray-700 gallery-meta-line">{{ getMetadata(image)?.dimensions || '\u00A0' }}</p>
          </div>
        </div>
        <div class="edge-spacer" :style="{ width: `${rightEdgeBuffer}px` }" aria-hidden="true"></div>
      </div>

      <!-- Grid view -->
      <div v-else key="grid" ref="gridViewEl" class="gallery-grid-layout">
        <TransitionGroup
          name="grid-fade"
          tag="div"
          class="gallery-grid-wrapper"
          :class="{
            'grid-disable-move': disableGridMove,
            'grid-use-absolute-leave': !disableGridMove
          }"
          @before-leave="onGridBeforeLeave"
          @after-leave="onGridAfterLeave"
        >
          <div
            v-for="(image, index) in gridSortedImages"
            :key="image"
            class="gallery-grid-item group"
            @click="openLightbox(image)"
          >
            <img
              :src="image"
              :alt="`Visual ${index + 1}`"
              class="gallery-grid-image"
            />
            <div class="mt-3 text-sm text-gray-700 text-center gallery-meta gallery-grid-meta">
              <p class="font-semibold text-gray-800 gallery-meta-title">{{ getMetadata(image)?.title || '\u00A0' }}</p>
              <p class="text-gray-700 gallery-meta-line">{{ getMetadata(image)?.year || '\u00A0' }}</p>
              <p class="text-gray-700 gallery-meta-line">{{ getMetadata(image)?.materials || '\u00A0' }}</p>
              <p class="text-gray-700 gallery-meta-line">{{ getMetadata(image)?.dimensions || '\u00A0' }}</p>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </Transition>

    <div v-if="filteredImages.length === 0" class="py-10 text-center text-gray-400 text-sm">
      No images in this category yet.
    </div>
  </div>

  <!-- Empty state -->
  <div v-else class="text-center py-12 text-gray-500">
    <p>No images yet. Drop images in <code>docs/paintings-sketches/images/</code> to display them here.</p>
  </div>

  <!-- Lightbox -->
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="lightboxVisible && lightboxImage"
        class="lightbox-overlay"
        @click="closeLightbox"
      >
        <img
          :src="lightboxImage"
          class="lightbox-img"
          @click.stop="closeLightbox"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Hide scrollbar for cleaner look */
::-webkit-scrollbar {
  display: none;
}

/* Lightbox */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
  padding: 2rem;
}

.lightbox-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 6px;
  cursor: zoom-out;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
}

/* Lightbox fade transition */
.lightbox-enter-active {
  transition: opacity 0.4s ease;
}
.lightbox-leave-active {
  transition: opacity 0.4s ease;
}
.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}

.mode-fade-enter-active,
.mode-fade-leave-active {
  transition: opacity 0.28s ease;
}

.mode-fade-enter-from,
.mode-fade-leave-to {
  opacity: 0;
}

.gallery-category-fade-enter-active,
.gallery-category-fade-leave-active {
  transition: opacity 0.28s ease;
}

.gallery-category-fade-enter-from,
.gallery-category-fade-leave-to {
  opacity: 0;
}

/* Minimal category menu under gallery */
.gallery-root {
  --gallery-vertical-offset: 2.5rem;
  margin-top: var(--gallery-vertical-offset);
}

.gallery-menu {
  margin-top: 1.5rem;
  display: flex;
  justify-content: flex-start;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.gallery-menu-link {
  color: inherit;
  opacity: 0.7;
  font-size: 0.95rem;
  text-decoration: none;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: opacity 0.2s ease;
  white-space: nowrap;
  text-align: left;
}

.gallery-menu-link:hover {
  opacity: 1;
}

.gallery-menu-link.is-active {
  opacity: 1;
}

.gallery-menu-category {
  position: relative;
  padding-bottom: 0.15rem;
}

.gallery-menu-category.is-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.12rem;
  height: 1px;
  background: currentColor;
  opacity: 0.75;
}

.gallery-menu-toggle {
  opacity: 1;
  font-weight: 600;
}

.gallery-menu-vertical {
  margin-top: 0;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 1.85rem;
  position: fixed;
  top: calc(132px + var(--gallery-vertical-offset, 1.1rem) + 0.4rem);
  left: 1rem;
  margin-left: 0;
  padding-left: 1rem;
  transform: none;
  width: max-content;
  z-index: 20;
}

.gallery-root.menu-horizontal {
  --gallery-vertical-offset: 0.75rem;
}

.gallery-menu-force-horizontal {
  position: static;
  margin-top: 1rem;
  gap: 0.95rem;
  left: auto;
  top: auto;
  width: 100%;
  z-index: auto;
  flex-direction: row;
  flex-wrap: wrap;
  padding-left: 0;
}

/* Mobile: move menu to top and stack horizontally */
@media (max-width: 768px) {
  .gallery-root {
    --gallery-vertical-offset: 0.75rem;
  }

  .gallery-menu-vertical {
    position: static;
    margin-top: 1rem;
    gap: 0.95rem;
    left: auto;
    top: auto;
    width: 100%;
    z-index: auto;
    flex-direction: row;
    flex-wrap: wrap;
    padding-left: 0;
  }
}

.edge-spacer {
  flex: 0 0 auto;
  height: 1px;
}

.gallery-grid-layout {
  display: block;
  width: 100%;
}

.gallery-grid-wrapper {
  --gallery-col-width: 340px;
  position: relative;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding-left: 3rem;
  padding-right: 1rem;
  column-gap: 1.35rem;
  column-width: var(--gallery-col-width);
}

/* Mobile: reduce padding and column width */
@media (max-width: 768px) {
  .gallery-grid-wrapper {
    --gallery-col-width: var(--gallery-item-width, 160px);
    padding-left: var(--layout-gutter);
    padding-right: var(--layout-gutter);
    column-gap: 0.75rem;
  }
}

.gallery-grid-item {
  display: inline-block;
  width: 100%;
  margin: 0 0 1.25rem;
  break-inside: avoid;
  cursor: pointer;
}

.gallery-grid-image {
  width: 100%;
  height: auto;
  max-height: 88vh;
  object-fit: contain;
  border-radius: 0.45rem;
  transition: transform 0.3s ease;
}

.gallery-grid-item:hover .gallery-grid-image {
  transform: scale(1.01);
}

.grid-fade-enter-active {
  transition: opacity 0.28s ease 0.42s;
}

.grid-fade-leave-active {
  transition: opacity 0.4s ease;
  pointer-events: none;
  overflow: hidden;
}

.grid-use-absolute-leave .grid-fade-leave-active {
  position: absolute;
  z-index: 1;
}

.grid-fade-enter-from,
.grid-fade-leave-to {
  opacity: 0;
}

.grid-fade-move {
  transition: transform 0.9s cubic-bezier(0.22, 0.8, 0.22, 1);
  will-change: transform;
}

.grid-disable-move .grid-fade-move {
  transition: none !important;
}

.gallery-grid-meta {
  text-align: left;
}

@media (max-width: 960px) {
  .gallery-grid-layout {
    grid-template-columns: 1fr;
    gap: 1.5rem;
    margin-left: 0;
    padding-left: 0;
  }

  .gallery-menu-vertical {
    position: static;
    margin-top: 0.5rem;
    gap: 0.55rem;
    left: auto;
    top: auto;
    width: auto;
    z-index: auto;
    transform: none;
  }

  .gallery-grid-wrapper {
    --gallery-col-width: 280px;
    column-width: 280px;
  }
}

@media (max-width: 640px) {
  .gallery-grid-wrapper {
    column-count: 1;
    column-width: auto;
  }
}

.gallery-meta {
  min-height: 5.8em;
}

.gallery-meta-title,
.gallery-meta-line {
  opacity: 0;
  transition: opacity 0.3s ease;
}

.group:hover .gallery-meta-title {
  opacity: 1;
}

.group:hover .gallery-meta-line {
  opacity: 0.75;
}
</style>
