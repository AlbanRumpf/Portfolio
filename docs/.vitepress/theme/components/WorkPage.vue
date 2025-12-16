<script setup lang="ts">
import { withBase, useRouter } from 'vitepress'
import { ref, computed, onMounted } from 'vue'

type Card = {
  slug: string
  title: string
  name: string
  excerpt: string
  route: string   // `/works/?id=slug`
  image: string | null
  component: any
}

// 1) Markdown as Vue components
const markdownModules = import.meta.glob('../../../works/**/index.md', {
  eager: true
})

// 2) Raw markdown text for meta (title, name, excerpt)
const markdownFiles = import.meta.glob('../../../works/**/index.md', {
  as: 'raw',
  eager: true
})

// Images
const imageFiles = import.meta.glob('../../../works/**/cover.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default'
})

const cards = ref<Card[]>([])

for (const path in markdownFiles) {
  const raw = markdownFiles[path] as string
  const lines = raw.split('\n')

  const titleLine = lines.find(line => line.startsWith('# '))
  const nameLine = lines.find(line => line.startsWith('## '))
  const excerptLine = lines.find(line => line.trim() && !line.startsWith('#'))

  // e.g. docs/works/my-work/index.md -> slug = "my-work"
  const match = path.match(/works\/([^/]+)\/index\.md$/)
  const slug = match?.[1] ?? ''

  // We stay on /works and switch via ?id=slug
  const route = `/works/?id=${slug}`

  const folder = path.replace(/\/index\.md$/, '/')
  const imageKey = Object.keys(imageFiles).find(k => k.startsWith(folder))

  const mod = markdownModules[path] as any

  cards.value.push({
    slug,
    title: titleLine?.replace(/^# /, '') || 'Untitled',
    name: nameLine?.replace(/^## /, '') || 'Anonymous',
    excerpt: excerptLine || '',
    route,
    image: imageKey ? (imageFiles[imageKey] as string) : null,
    component: mod?.default || null
  })
}

const router = useRouter()

// 👇 this is the *actual* selected work
const currentSlug = ref<string | undefined>(cards.value[0]?.slug)

// helper to read slug from current URL (?id=slug)
function getSlugFromLocation(): string | undefined {
  if (typeof window === 'undefined') {
    return cards.value[0]?.slug
  }

  const params = new URLSearchParams(window.location.search)
  const id = params.get('id')
  return id || cards.value[0]?.slug
}

// initial selection when page loads (including from WorkStack)
onMounted(() => {
  currentSlug.value = getSlugFromLocation()
})

// when user clicks in the sidebar
function selectCard(slug: string, routePath: string) {
  currentSlug.value = slug

  // keep the URL in sync (and let VitePress do SPA navigation)
  router.go(withBase(routePath))
}

const currentCard = computed(() =>
  cards.value.find(card => card.slug === currentSlug.value)
)
</script>

<template>
  <div class="flex flex-col lg:flex-row min-h-[80vh] border border-gray-400 rounded-2xl overflow-hidden shadow-lg">
    <!-- Sidebar -->
    <aside class="w-full lg:w-1/4 bg-gray-100 border-r border-gray-400 p-4 space-y-4 overflow-auto">
      <h2 class="text-xl font-bold mb-2 text-gray-900">Proposals</h2>
      <ul class="space-y-3">
        <li
          v-for="card in cards"
          :key="card.slug"
          class="rounded-lg transition hover:scale-[1.02]"
          :class="{ 'ring-2 ring-gray-700': card.slug === currentSlug }"
        >
          <a
            :href="withBase(card.route)"
            @click.prevent="selectCard(card.slug, card.route)"
            class="flex items-center gap-3 p-2 rounded-lg bg-gray-200 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            <img
              v-if="card.image"
              :src="card.image"
              alt="cover"
              class="w-12 h-12 object-cover rounded border border-gray-400"
            />
            <div>
              <div class="text-sm font-semibold text-gray-900 leading-snug">
                {{ card.title }}
              </div>
              <div class="text-xs text-gray-600">{{ card.name }}</div>
            </div>
          </a>
        </li>
      </ul>
    </aside>

    <!-- Markdown Content -->
    <section class="w-full bg-white lg:w-3/4 p-6 overflow-auto">
      <div v-if="currentCard">
        <div v-if="currentCard.image" class="mb-6">
          <img
            :src="currentCard.image"
            alt="cover image"
            class="w-full max-h-96 object-cover rounded border border-gray-400"
          />
        </div>

        <!-- Render markdown component directly -->
        <component
          v-if="currentCard.component"
          :is="currentCard.component"
          class="prose prose-base md:prose-lg max-w-none"
        />
      </div>

      <div v-else class="text-gray-500">
        Work not found.
      </div>
    </section>
  </div>
</template>
