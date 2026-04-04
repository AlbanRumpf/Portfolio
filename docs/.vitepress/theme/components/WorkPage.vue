<script setup lang="ts">
import { withBase, useRouter, useData, useRoute } from 'vitepress'
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import HorizontalImageGallery from './HorizontalImageGallery.vue'

type Card = {
  category: string
  slug: string
  title: string
  name: string
  excerpt: string
  route: string
  image: string | null
  component: any
  year?: string
  audio?: string | null
  info?: string | null
  infoImages?: string[]
  soundCategories?: SoundCategory[]
}

type SoundCategory = 'All' | 'Electroacoustic' | 'Instrumental' | 'Collaborative'

// Modules & raw markdowns per category
const mdModsInst = import.meta.glob('../../../installations/**/index.md', { eager: true })
const mdRawInst = import.meta.glob('../../../installations/**/index.md', { query: '?raw', import: 'default', eager: true })
const imgInst = import.meta.glob('../../../installations/**/cover.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' })

const mdModsSound = import.meta.glob('../../../soundworks/**/index.md', { eager: true })
const mdRawSound = import.meta.glob('../../../soundworks/**/index.md', { query: '?raw', import: 'default', eager: true })
const imgSound = import.meta.glob('../../../soundworks/**/cover.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' })
const audioSound = import.meta.glob('../../../soundworks/**/{*.mp3,*.wav,*.ogg,*.m4a,*.flac}', { eager: true, query: '?url', import: 'default' })
const detailImgSound = import.meta.glob('../../../soundworks/**/*.{jpg,jpeg,png,webp,avif,gif}', { eager: true, query: '?url', import: 'default' })

const mdModsPaint = import.meta.glob('../../../paintings-sketches/**/index.md', { eager: true })
const mdRawPaint = import.meta.glob('../../../paintings-sketches/**/index.md', { query: '?raw', import: 'default', eager: true })
const imgPaint = import.meta.glob('../../../paintings-sketches/**/cover.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' })

const cards = ref<Card[]>([])
const soundMenuCategories: SoundCategory[] = ['All', 'Electroacoustic', 'Instrumental', 'Collaborative']

function normalizeSoundCategory(raw?: string): SoundCategory | null {
  const normalized = (raw || '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'all') return 'All'
  if (normalized === 'electroacoustic') return 'Electroacoustic'
  if (normalized === 'instrumental') return 'Instrumental'
  if (normalized === 'collaborative') return 'Collaborative'
  return null
}

function pushFromMaps(
  mods: Record<string, any>,
  raws: Record<string, string>,
  imgs: Record<string, string>,
  audioMap: Record<string, string> | null,
  categoryKey: string
) {
  const stripHtml = (value: string): string => value.replace(/<[^>]*>/g, '').trim()

  const extractHtmlH1 = (raw: string): string | undefined => {
    const match = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    if (!match) return undefined
    const cleaned = stripHtml(match[1])
    return cleaned || undefined
  }

  const extractMarkdownH1 = (raw: string): string | undefined => {
    const match = raw.match(/^#\s+(.+)$/m)
    if (!match) return undefined
    const cleaned = match[1].trim()
    return cleaned || undefined
  }

  const parseFrontmatter = (raw: string): Record<string, string> => {
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!m) return {}
    const out: Record<string, string> = {}
    const normalizeFrontmatterValue = (value: string): string => {
      let normalized = value.trim()

      if (
        (normalized.startsWith('"') && normalized.endsWith('"')) ||
        (normalized.startsWith("'") && normalized.endsWith("'"))
      ) {
        normalized = normalized.slice(1, -1)
      }

      // Support escaped line breaks in plain frontmatter values.
      return normalized.replace(/\\n/g, '\n')
    }

    m[1].split(/\r?\n/).forEach(line => {
      const [k, ...rest] = line.split(':')
      if (!k || rest.length === 0) return
      out[k.trim()] = normalizeFrontmatterValue(rest.join(':'))
    })
    return out
  }

  for (const path in raws) {
    const raw = raws[path] as string
    const lines = raw.split('\n')
    const fm = parseFrontmatter(raw)

    const titleLine = lines.find(line => /^#\s+/.test(line))
    const nameLine = lines.find(line => line.startsWith('## '))
    const excerptLine = lines.find(line => line.trim() && !line.startsWith('#'))

    const match = path.match(new RegExp(categoryKey + "\\/([^/]+)\\/index\\.md$"))
    const slug = match?.[1] ?? ''

    // Skip category index pages like docs/installations/index.md
    if (!slug) continue

    const route = `/${categoryKey}/?id=${slug}`

    const imageKey = Object.keys(imgs).find(k => k.includes(`/${slug}/`))

    const mod = (mods as any)[path] as any
    const frontmatter = mod?.frontmatter || fm || {}
    
    // Debug: log image loading
    let imageUrl = null
    if (imageKey) {
      // With query: '?url', import: 'default', the value should be directly the URL string
      imageUrl = imgs[imageKey] as string
    } else {
    }

    // Resolve optional audio snippet (only for soundworks when frontmatter.audio is present)
    let audioUrl: string | null = null
    const audioField = typeof frontmatter.audio === 'string' ? frontmatter.audio : null
    if (audioField && audioMap) {
      const normalizedAudio = audioField.startsWith('./') ? audioField.slice(2) : audioField
      const audioKey = Object.keys(audioMap).find(k => k.includes(`/${slug}/`) && k.endsWith(`/${normalizedAudio}`))
      if (audioKey) {
        audioUrl = audioMap[audioKey]
      }
    }

    // Resolve optional extra info content (only used by soundworks cards)
    const infoText = typeof frontmatter.info === 'string' ? frontmatter.info : null
    const infoImagesField = frontmatter.infoImages
    const requestedInfoImages = Array.isArray(infoImagesField)
      ? infoImagesField.filter((value: unknown): value is string => typeof value === 'string')
      : typeof frontmatter.infoImage === 'string'
        ? [frontmatter.infoImage]
        : []
    const infoImages = requestedInfoImages
      .map((name) => {
        const normalizedName = name.startsWith('./') ? name.slice(2) : name
        const imageKey = Object.keys(detailImgSound).find(k =>
          k.includes(`/${slug}/`) &&
          !/\/cover\.(jpg|jpeg|png|webp)$/i.test(k) &&
          k.endsWith(`/${normalizedName}`)
        )
        return imageKey ? (detailImgSound[imageKey] as string) : null
      })
      .filter((url): url is string => !!url)

    const soundCategoriesRaw = frontmatter.soundCategories ?? frontmatter.soundCategory ?? frontmatter.category ?? frontmatter.type
    const soundCategoryList = Array.isArray(soundCategoriesRaw)
      ? soundCategoriesRaw
      : typeof soundCategoriesRaw === 'string'
        ? soundCategoriesRaw.split(',').map(v => v.trim()).filter(Boolean)
        : []
    const soundCategories = categoryKey === 'soundworks'
      ? Array.from(new Set(
          soundCategoryList
            .map((value) => normalizeSoundCategory(String(value)))
            .filter((value): value is SoundCategory => value !== null && value !== 'All')
        ))
      : []

    cards.value.push({
      category: categoryKey,
      slug,
      title:
        frontmatter.title ||
        extractHtmlH1(raw) ||
        extractMarkdownH1(raw) ||
        titleLine?.replace(/^#\s+/, '') ||
        slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      name: nameLine?.replace(/^## /, '') || '',
      excerpt: excerptLine || '',
      route,
      image: imageUrl,
      component: mod?.default || null,
      year: frontmatter.year || undefined,
      audio: audioUrl,
      info: infoText,
      infoImages,
      soundCategories
    })
  }
}

pushFromMaps(mdModsInst as any, mdRawInst as any, imgInst as any, null, 'installations')
pushFromMaps(mdModsSound as any, mdRawSound as any, imgSound as any, audioSound as any, 'soundworks')
pushFromMaps(mdModsPaint as any, mdRawPaint as any, imgPaint as any, null, 'paintings-sketches')

const router = useRouter()
const { site } = useData()
const route = useRoute()

// current category inferred from the URL path
function categoryFromPath(): string {
  // Prefer route.path which is already base-stripped in VitePress
  const p = route?.path || (typeof window !== 'undefined' ? window.location.pathname : '/installations/')
  const base = site?.value?.base || '/'
  const path = p.startsWith(base) ? p.slice(base.length - 1) : p
  if (path.startsWith('/installations/')) return 'installations'
  if (path.startsWith('/soundworks/')) return 'soundworks'
  if (path.startsWith('/paintings-sketches/')) return 'paintings-sketches'
  return 'installations'
}

const currentCategory = ref<string>(categoryFromPath())

// 👇 this is the *actual* selected work
const currentSlug = ref<string | undefined>(cards.value.find(c => c.category === currentCategory.value)?.slug)
const audioOpen = ref<Record<string, boolean>>({})
const audioPlaying = ref<Record<string, boolean>>({})
const infoOpen = ref<Record<string, boolean>>({})
const soundSelectedCategory = ref<SoundCategory>('All')
const showSoundworksContent = ref(currentCategory.value !== 'soundworks')
let soundworksContentTimer: number | null = null
const showInstallationsContent = ref(currentCategory.value !== 'installations')
let installationsContentTimer: number | null = null
const showVisualContent = ref(currentCategory.value !== 'paintings-sketches')
let visualContentTimer: number | null = null

// Keep category in sync with route changes
watch(
  () => route.path,
  () => {
    const nextCat = categoryFromPath()
    if (nextCat !== currentCategory.value) {
      currentCategory.value = nextCat
      currentSlug.value = cards.value.find(c => c.category === nextCat)?.slug
      isPanelOpen.value = false
    }
  }
)

watch(
  () => currentCategory.value,
  (nextCat) => {
    if (soundworksContentTimer !== null) {
      clearTimeout(soundworksContentTimer)
      soundworksContentTimer = null
    }
    if (nextCat === 'soundworks') {
      showSoundworksContent.value = false
      soundworksContentTimer = window.setTimeout(() => {
        showSoundworksContent.value = true
      }, 700)
    } else {
      showSoundworksContent.value = true
    }

    if (installationsContentTimer !== null) {
      clearTimeout(installationsContentTimer)
      installationsContentTimer = null
    }
    if (nextCat === 'installations') {
      showInstallationsContent.value = false
      installationsContentTimer = window.setTimeout(() => {
        showInstallationsContent.value = true
      }, 700)
    } else {
      showInstallationsContent.value = true
    }

    if (visualContentTimer !== null) {
      clearTimeout(visualContentTimer)
      visualContentTimer = null
    }
    if (nextCat === 'paintings-sketches') {
      showVisualContent.value = false
      visualContentTimer = window.setTimeout(() => {
        showVisualContent.value = true
      }, 700)
    } else {
      showVisualContent.value = true
    }
  }
)

// helper to read slug from current URL (?id=slug)
function getSlugFromLocation(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const params = new URLSearchParams(window.location.search)
  const id = params.get('id')
  return id || undefined
}

// when user clicks in the sidebar
function selectCard(slug: string, routePath: string) {
  currentSlug.value = slug

  // keep the URL in sync (and let VitePress do SPA navigation)
  router.go(withBase(routePath))
}

const currentCard = computed(() =>
  cards.value.find(card => card.slug === currentSlug.value && card.category === currentCategory.value)
)

function resolveImageUrl(url?: string | null): string {
  if (!url) return ''

  // Keep absolute/data URLs untouched
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:')) {
    return url
  }

  const base = site?.value?.base || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`

  // Fix accidental duplicated base prefix (e.g. /Portfolio/Portfolio/assets/...)
  if (normalizedBase !== '/') {
    const duplicateBase = `${normalizedBase}${normalizedBase.slice(1)}`
    if (url.startsWith(duplicateBase)) {
      return `${normalizedBase}${url.slice(duplicateBase.length)}`
    }
  }

  // Already base-prefixed
  if (normalizedBase !== '/' && url.startsWith(normalizedBase)) {
    return url
  }

  // Root asset path should be base-prefixed on project-site deployments
  if (url.startsWith('/assets/')) {
    return withBase(url)
  }

  return url
}

const sidebarCards = computed(() => cards.value.filter(c => c.category === currentCategory.value))
const otherCards = computed(() => {
  const categoryCards = sidebarCards.value
  return categoryCards.filter(c => c.slug !== currentSlug.value)
})
const soundworkCards = computed(() => {
  const soundworks = cards.value.filter((c) => {
    if (c.category !== 'soundworks') return false
    if (soundSelectedCategory.value === 'All') return true
    return (c.soundCategories || []).includes(soundSelectedCategory.value)
  })
  // Sort by year descending (newest first, oldest last)
  return [...soundworks].sort((a, b) => {
    const yearA = a.year ? parseInt(a.year) : 0
    const yearB = b.year ? parseInt(b.year) : 0
    return yearB - yearA // Descending order
  })
})

// Debug: log what cards we have

// Watch for currentSlug changes to debug otherCard
watch(currentSlug, () => {
})

// Track if detail panel is open
const isPanelOpen = ref(false)
const panelContent = ref<HTMLElement | null>(null)
const panelScrolled = ref(false)

function onPanelScroll() {
  if (!panelContent.value) return
  panelScrolled.value = panelContent.value.scrollTop > 1
}

// Open the detail panel
function openPanel(slug: string, routePath: string) {
  currentSlug.value = slug
  isPanelOpen.value = true
  panelScrolled.value = false
  // Update URL
  router.go(withBase(routePath))
  // Scroll panel to top
  nextTick(() => {
    if (panelContent.value) {
      panelContent.value.scrollTop = 0
      panelScrolled.value = false
    }
  })
}

// Close the detail panel
function closePanel() {
  isPanelOpen.value = false
  panelScrolled.value = false
  currentSlug.value = undefined
  // Navigate back to the category page
  router.go(withBase(`/${currentCategory.value}/`))
}

function toggleAudio(slug: string) {
  audioOpen.value = { ...audioOpen.value, [slug]: !audioOpen.value[slug] }
}

function toggleInfo(slug: string) {
  infoOpen.value = { ...infoOpen.value, [slug]: !infoOpen.value[slug] }
}

function setSoundCategory(category: SoundCategory) {
  soundSelectedCategory.value = category
}

// Audio visualizer setup
const audioContexts = ref<Record<string, AudioContext>>({})
const analysers = ref<Record<string, AnalyserNode>>({})
const animationFrames = ref<Record<string, number>>({})

function setupAudioVisualizer(audioElement: HTMLAudioElement, slug: string) {
  if (audioContexts.value[slug]) return // Already setup

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  const analyser = audioContext.createAnalyser()
  const source = audioContext.createMediaElementSource(audioElement)
  
  analyser.fftSize = 64 // Small number for minimal bars
  source.connect(analyser)
  analyser.connect(audioContext.destination)
  
  audioContexts.value[slug] = audioContext
  analysers.value[slug] = analyser
}

function drawVisualizer(canvas: HTMLCanvasElement, slug: string) {
  const analyser = analysers.value[slug]
  if (!analyser || !audioPlaying.value[slug]) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)
  analyser.getByteFrequencyData(dataArray)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  const barCount = 20
  const barWidth = canvas.width / barCount
  const barGap = 2
  
  // Skip lower frequencies, focus on mid-to-high range
  // Start from 30% into the buffer (skips deep bass) and use the upper 70%
  const startIndex = Math.floor(bufferLength * 0.3)
  const usableRange = bufferLength - startIndex
  
  for (let i = 0; i < barCount; i++) {
    // Sample from the mid-to-high frequency range
    const dataIndex = startIndex + Math.floor(i * (usableRange / barCount))
    const rawValue = dataArray[dataIndex]
    
    // Amplify high frequencies - higher indices get more boost
    const frequencyBoost = 1 + (i / barCount) * 1.5 // 1.5 to 1.8x boost
    const barHeight = Math.min((rawValue / 255) * canvas.height * frequencyBoost, canvas.height)
    
    ctx.fillStyle = `rgba(255, 255, 255, 0.5)`
    ctx.fillRect(
      i * barWidth,
      canvas.height - barHeight,
      barWidth - barGap,
      barHeight
    )
  }

  animationFrames.value[slug] = requestAnimationFrame(() => drawVisualizer(canvas, slug))
}

function startVisualizer(slug: string) {
  const canvas = document.querySelector(`[data-visualizer="${slug}"]`) as HTMLCanvasElement
  if (canvas && analysers.value[slug]) {
    drawVisualizer(canvas, slug)
  } else {
  }
}

function stopVisualizer(slug: string) {
  if (animationFrames.value[slug]) {
    cancelAnimationFrame(animationFrames.value[slug])
    delete animationFrames.value[slug]
  }
  
  // Clear canvas
  const canvas = document.querySelector(`[data-visualizer="${slug}"]`) as HTMLCanvasElement
  if (canvas) {
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
  }
}

function onAudioMounted(audioElement: HTMLAudioElement | null, slug: string) {
  if (!audioElement) return
  
  
  audioElement.addEventListener('play', () => {
    setupAudioVisualizer(audioElement, slug)
    audioPlaying.value = { ...audioPlaying.value, [slug]: true }
    // Use nextTick to ensure DOM is updated
    nextTick(() => {
      startVisualizer(slug)
    })
  })
  
  audioElement.addEventListener('pause', () => {
    audioPlaying.value = { ...audioPlaying.value, [slug]: false }
    stopVisualizer(slug)
  })
  
  audioElement.addEventListener('ended', () => {
    audioPlaying.value = { ...audioPlaying.value, [slug]: false }
    stopVisualizer(slug)
  })
}

// Update onMounted to check for direct links
onMounted(() => {
  if (currentCategory.value === 'soundworks') {
    showSoundworksContent.value = false
    soundworksContentTimer = window.setTimeout(() => {
      showSoundworksContent.value = true
    }, 700)
  }
  if (currentCategory.value === 'installations') {
    showInstallationsContent.value = false
    installationsContentTimer = window.setTimeout(() => {
      showInstallationsContent.value = true
    }, 700)
  }
  if (currentCategory.value === 'paintings-sketches') {
    showVisualContent.value = false
    visualContentTimer = window.setTimeout(() => {
      showVisualContent.value = true
    }, 700)
  }
  currentCategory.value = categoryFromPath()
  const slugFromUrl = getSlugFromLocation()
  // Only open panel if there's an explicit ?id= parameter in the URL
  if (slugFromUrl) {
    const foundCard = cards.value.find(c => c.slug === slugFromUrl && c.category === currentCategory.value)
    if (foundCard) {
      currentSlug.value = slugFromUrl
      isPanelOpen.value = true
    }
  }
})

</script>

<template>
  <div class="relative">
    <!-- Soundworks: horizontal layout with audio players on the right -->
    <div v-if="currentCategory === 'soundworks'" class="soundworks-container" style="background-color: #373c40;">
      <nav v-if="showSoundworksContent" class="sound-menu sound-menu-vertical sound-menu-fade" aria-label="Soundworks options">
        <button
          type="button"
          class="sound-menu-link sound-menu-toggle"
        >
          List
        </button>
        <button
          v-for="menuCategory in soundMenuCategories"
          :key="menuCategory"
          type="button"
          class="sound-menu-link sound-menu-category"
          :class="{ 'is-active': soundSelectedCategory === menuCategory }"
          @click="setSoundCategory(menuCategory)"
        >
          {{ menuCategory }}
        </button>
      </nav>

      <div v-if="showSoundworksContent" class="soundworks-list py-12">
        <div
          v-for="card in soundworkCards"
          :key="card.category + '/' + card.slug"
          class="soundworks-row"
        >
        <!-- Left side: Work info and button -->
        <div class="soundworks-meta flex flex-col gap-2 flex-shrink-0">
          <div class="text-white text-xl font-normal">{{ card.title }}</div>
          <div class="text-sm text-gray-300">{{ card.year || 'Year TBA' }}</div>
          <div v-if="card.audio" class="mt-1">
            <button
              class="inline-flex items-center gap-2 px-0 py-0 text-sm text-gray-200 hover:text-white transition-colors relative"
              style="border: none; background: transparent; padding-left: 0; min-width: 120px;"
              @click="toggleAudio(card.slug)"
            >
              <Transition name="fade" mode="out-in">
                <span v-if="!audioOpen[card.slug]" key="listen">Listen to excerpt</span>
                <span v-else key="hide">Hide player</span>
              </Transition>
            </button>
          </div>
          <div class="mt-1">
            <button
              class="inline-flex items-center gap-2 px-0 py-0 text-sm text-gray-200 hover:text-white transition-colors relative"
              style="border: none; background: transparent; padding-left: 0; min-width: 120px;"
              @click="toggleInfo(card.slug)"
            >
              <Transition name="fade" mode="out-in">
                <span v-if="!infoOpen[card.slug]" key="open-info">Open information</span>
                <span v-else key="hide-info">Hide information</span>
              </Transition>
            </button>
          </div>
          <div v-if="!card.audio" class="text-gray-500 text-sm">Audio coming soon.</div>
        </div>
        
        <!-- Divider line / Visualizer between work info and player -->
        <Transition name="fade-slide">
          <div v-if="card.audio && audioOpen[card.slug]" class="relative flex items-center flex-shrink-0 mr-12" style="width: 240px; height: 40px;">
            <!-- Static line (shown when not playing) -->
            <div v-show="!audioPlaying[card.slug]" class="absolute bg-white opacity-50" style="width: 100%; height: 2px; top: 50%; transform: translateY(-50%);"></div>
            <!-- Canvas visualizer (always rendered, shown when playing) -->
            <canvas 
              :data-visualizer="card.slug"
              class="absolute inset-0"
              :class="{ 'opacity-0': !audioPlaying[card.slug] }"
              width="240"
              height="40"
              style="width: 240px; height: 40px;"
            ></canvas>
          </div>
        </Transition>
        
        <!-- Right side: Audio player (vertically centered) -->
        <Transition name="fade-slide">
          <div v-if="card.audio && audioOpen[card.slug]" class="flex items-center flex-1" style="background-color: #373c40;">
            <audio 
              :src="card.audio" 
              :data-slug="card.slug" 
              :ref="(el) => onAudioMounted(el as HTMLAudioElement, card.slug)"
              controls 
              class="audio-player"
            ></audio>
          </div>
        </Transition>

        <Transition name="expand-fade">
          <div v-if="infoOpen[card.slug]" class="soundworks-info-panel">
            <p v-if="card.info" class="soundworks-info-text">{{ card.info }}</p>

            <div v-if="card.infoImages && card.infoImages.length" class="soundworks-info-images">
              <img
                v-for="(image, index) in card.infoImages"
                :key="`${card.slug}-info-image-${index}`"
                :src="resolveImageUrl(image)"
                :alt="`${card.title} information image ${index + 1}`"
                class="soundworks-info-image"
              />
            </div>

            <p v-if="!card.info && (!card.infoImages || card.infoImages.length === 0)" class="soundworks-info-empty">
              Information coming soon.
            </p>
          </div>
        </Transition>
        </div>
      </div>
    </div>

    <!-- Other categories: existing grid with detail panel -->
    <div v-if="currentCategory === 'paintings-sketches' && showVisualContent" class="mb-12 visual-content-fade">
      <HorizontalImageGallery />
    </div>

    <div
      v-if="currentCategory !== 'soundworks'"
      class="grid-responsive py-12 transition-opacity duration-300 ease-in-out"
      :class="{ 'opacity-20 pointer-events-none': isPanelOpen }"
    >
      <div
        v-for="card in sidebarCards"
        :key="card.category + '/' + card.slug"
        v-show="currentCategory !== 'installations' || showInstallationsContent"
        class="group flex flex-col installations-list"
      >
        <!-- Project Name Above Card (shown on hover) -->
        <h3 class="text-white text-lg font-semibold mb-4 px-2 text-center h-7 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          {{ card.title }}
        </h3>
        
        <!-- Card -->
        <a
          :href="withBase(card.route)"
          @click.prevent="openPanel(card.slug, card.route)"
          class="relative aspect-square rounded-3xl overflow-hidden cursor-pointer transition-all duration-300 group-hover:scale-105 group-hover:shadow-2xl flex-1"
        >
          <!-- Cover Image -->
          <img
            v-if="card.image"
            :src="resolveImageUrl(card.image)"
            :alt="card.title"
            class="w-full h-full object-cover"
          />
          <div
            v-else
            class="w-full h-full bg-gray-700 flex items-center justify-center text-white"
          >
            <span>No Image: {{ card.slug }}</span>
          </div>
        </a>
      </div>
    </div>

    <!-- Slide-in Detail Panel -->
    <Transition name="detail-overlay">
    <div
      v-if="isPanelOpen && currentCategory !== 'soundworks'"
      class="fixed inset-x-0 bottom-0 top-[112px] z-[60] flex items-center justify-end"
      @click.self="closePanel"
    >
      <!-- Backdrop -->
      <div class="absolute inset-0 transition-opacity" style="background-color: #555a5e;" @click="closePanel"></div>
      
      <!-- Left Side: Other Project Cards -->
      <div v-if="otherCards.length > 0" class="absolute left-8 top-1/2 transform -translate-y-1/2 z-[70] flex flex-col gap-4">
        <a
          v-for="otherCard in otherCards"
          :key="otherCard.slug"
          :href="withBase(otherCard.route)"
          @click.prevent="openPanel(otherCard.slug, otherCard.route)"
          class="relative w-48 h-48 rounded-3xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl block group flex-shrink-0"
        >
          <!-- Cover Image -->
          <img
            v-if="otherCard.image"
            :src="resolveImageUrl(otherCard.image)"
            :alt="otherCard.title"
            class="w-full h-full object-cover"
          />
          <!-- Fallback -->
          <div v-else class="w-full h-full bg-gray-700 flex items-center justify-center">
            <span class="text-white text-center px-4 text-sm">{{ otherCard.title }}</span>
          </div>
          
          <!-- Title Overlay - only shows on hover -->
          <div class="absolute inset-0 bg-black opacity-0 group-hover:opacity-40 transition-opacity duration-300 flex items-center justify-center pointer-events-none">
            <h3 class="text-white text-center font-semibold px-4 text-sm">
              {{ otherCard.title }}
            </h3>
          </div>
        </a>
      </div>
      
      <!-- Panel -->
      <div ref="panelContent" @scroll.passive="onPanelScroll" class="detail-panel relative h-full w-full md:w-3/4 lg:w-2/3 rounded-tl-3xl shadow-2xl overflow-y-auto transform transition-transform duration-300 ease-in-out" :style="{ backgroundColor: currentCategory === 'soundworks' ? '#373c40' : '#292c2f' }">
        <div class="detail-top-fade" :class="{ 'is-visible': panelScrolled }"></div>
        <Transition name="detail-content" mode="out-in">
          <div :key="currentCard?.slug || 'not-found'">
            <!-- Panel Content -->
            <div v-if="currentCard" class="p-8">
              <!-- Cover Image -->
              <div v-if="currentCard.image" class="mb-8">
                <img
                  :src="resolveImageUrl(currentCard.image)"
                  alt="cover image"
                  class="w-full max-h-96 object-cover rounded-2xl"
                />
              </div>

              <!-- Markdown Content -->
              <component
                v-if="currentCard.component"
                :is="currentCard.component"
                class="prose prose-base md:prose-lg max-w-none prose-invert"
              />
            </div>

            <div v-else class="p-8 text-gray-400">
              Work not found.
            </div>
          </div>
        </Transition>
      </div>
    </div>
    </Transition>
  </div>
</template>

<style scoped>
.soundworks-container {
  position: relative;
  left: calc(50% - 50vw);
  width: 100vw;
  overflow-x: clip;
  box-sizing: border-box;
  padding: 0 clamp(1rem, 3vw, 2.5rem) 0 var(--nav-installations-left, 148px);
}

.sound-menu {
  display: flex;
  justify-content: flex-start;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.sound-menu-link {
  font-family: inherit;
  font-weight: 400;
  color: inherit;
  opacity: 0.7;
  font-size: 0.95rem;
  letter-spacing: normal;
  text-decoration: none;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: opacity 0.2s ease;
  white-space: nowrap;
  text-align: left;
}

.sound-menu-link:hover {
  opacity: 1;
}

.sound-menu-link.is-active {
  opacity: 1;
}

.sound-menu-category {
  position: relative;
  padding-bottom: 0.15rem;
}

.sound-menu-category.is-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.12rem;
  height: 1px;
  background: currentColor;
  opacity: 0.75;
}

.sound-menu-toggle {
  opacity: 1;
  font-weight: 600;
}

.sound-menu-vertical {
  margin-top: 0;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 1.5rem;
  position: fixed;
  top: calc(112px + var(--layout-vertical-pad) + 3rem);
  left: 1rem;
  margin-left: 0;
  padding-left: 1rem;
  transform: none;
  width: max-content;
  z-index: 20;
}

.sound-menu-fade {
  animation: soundworksFadeIn 1.8s ease-out forwards;
}

.soundworks-list {
  animation: soundworksFadeIn 1.8s ease-out forwards;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.soundworks-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.soundworks-info-panel {
  flex: 0 0 100%;
  width: 100%;
  overflow: hidden;
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
}

.soundworks-info-text {
  color: #e7e7e7;
  line-height: 1.45;
  white-space: pre-line;
}

.soundworks-info-images {
  margin-top: 0.75rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
}

.soundworks-info-image {
  width: 100%;
  height: auto;
  border-radius: 0.5rem;
  object-fit: cover;
}

.soundworks-info-empty {
  color: #9ca3af;
  font-size: 0.92rem;
}

.soundworks-meta {
  min-width: 0;
}

.audio-player {
  width: 100%;
  max-width: 400px;
  background-color: #373c40 !important;
  border: none !important;
  color-scheme: dark;
  accent-color: #ffffff;
}

/* Override webkit audio player styling */
.audio-player::-webkit-media-controls-panel {
  background-color: #373c40 !important;
}

.audio-player::-webkit-media-controls-mute-button {
  background-color: transparent !important;
}

/* Firefox audio player styling */
.audio-player {
  background: #373c40 !important;
}

.detail-panel {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.detail-panel::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.detail-top-fade {
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  height: 36px;
  margin-bottom: -36px;
  pointer-events: none;
  z-index: 15;
  opacity: 0;
  transition: opacity 0.2s ease;
  background: linear-gradient(to bottom, rgba(41, 44, 47, 0.95) 0%, rgba(41, 44, 47, 0.75) 45%, rgba(41, 44, 47, 0) 100%);
}

.detail-top-fade.is-visible {
  opacity: 1;
}

.detail-overlay-enter-active,
.detail-overlay-leave-active {
  transition: opacity 0.3s ease;
}

.detail-overlay-enter-from,
.detail-overlay-leave-to {
  opacity: 0;
}

.detail-content-enter-active,
.detail-content-leave-active {
  transition: opacity 0.25s ease;
}

.detail-content-enter-from,
.detail-content-leave-to {
  opacity: 0;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.expand-fade-enter-active,
.expand-fade-leave-active {
  transition: max-height 0.35s ease, opacity 0.3s ease, margin-top 0.35s ease;
}

.expand-fade-enter-from,
.expand-fade-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
}

.expand-fade-enter-to,
.expand-fade-leave-from {
  max-height: 1200px;
  opacity: 1;
  margin-top: 0.15rem;
}

.visual-content-fade {
  animation: visualFadeIn 1.8s ease-out forwards;
}

/* Installations cards fade-in animation */
.installations-list {
  animation: installationsFadeIn 1.8s ease-out forwards;
}

@media (min-width: 768px) {
  .soundworks-row {
    flex-direction: row;
    align-items: center;
    align-content: flex-start;
    gap: 0.75rem;
  }

  .soundworks-meta {
    min-width: 300px;
  }
}

@media (max-width: 768px) {
  .sound-menu-vertical {
    position: static;
    margin-top: 1rem;
    gap: 0.75rem;
    left: auto;
    top: auto;
    width: 100%;
    z-index: auto;
    flex-direction: row;
    flex-wrap: wrap;
    padding-left: 0;
  }

  .soundworks-container {
    padding-left: var(--layout-gutter);
  }
}

@keyframes installationsFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes soundworksFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes visualFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
