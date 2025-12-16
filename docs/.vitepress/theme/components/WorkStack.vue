<template>
  <div
    ref="containerRef"
    class="bg-gray-100 mx-auto w-full max-w-6xl p-6 rounded-2xl border border-gray-300"
  >
    <a
      v-for="card in cards"
      :key="card.slug"
      :href="withBase(card.route)"
      class="group flex flex-col sm:flex-row w-full mb-6 rounded-xl overflow-hidden border border-gray-300 bg-white shadow-sm 
             transition-all duration-300 hover:shadow-lg hover:scale-[1.02] focus:outline-none focus:ring-2 
             focus:ring-gray-400"
    >
      <!-- Cover Image -->
      <div
        class="w-full sm:w-1/5 min-w-[160px] max-w-[240px] h-48 sm:h-auto flex-shrink-0 object-center"
      >
        <img
          v-if="card.image"
          :src="card.image"
          alt="cover image"
          class="w-full h-full p-4 object-cover"
        />
        <div
          v-else
          class="w-full h-full bg-gray-300 flex items-center justify-center text-gray-500"
        >
          No Image
        </div>
      </div>

      <!-- Text Content -->
      <div class="flex-1 p-4 sm:p-6 flex flex-col justify-between">
        <div>
          <h2 class="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
            {{ card.title }}
          </h2>
          <h3 class="text-sm font-medium text-gray-600 mb-3">
            {{ card.name }}
          </h3>
          <p
            class="text-gray-700 text-sm leading-snug line-clamp-3 group-hover:line-clamp-none transition-all duration-300"
          >
            {{ card.excerpt }}
          </p>
        </div>
      </div>
    </a>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { withBase } from 'vitepress'

type Card = {
  slug: string
  title: string
  name: string
  excerpt: string
  route: string      // `/works/?id=slug`
  image: string | null
}

const markdownFiles = import.meta.glob('../../../works/**/index.md', {
  as: 'raw',
  eager: true,
})
const imageFiles = import.meta.glob('../../../works/**/cover.*', {
  eager: true,
  import: 'default',
})

const cards = ref<Card[]>([])

for (const path in markdownFiles) {
  const raw = markdownFiles[path] as string
  const lines = raw.split('\n')

  const titleLine = lines.find(line => line.startsWith('# '))
  const nameLine = lines.find(line => line.startsWith('## '))
  const excerptLine = lines.find(line => line.trim() && !line.startsWith('#'))

  // docs/works/my-work/index.md -> slug = "my-work"
  const match = path.match(/works\/([^/]+)\/index\.md$/)
  const slug = match?.[1] ?? ''

  const route = `/works/?id=${slug}`

  const folder = path.replace(/\/index\.md$/, '/')
  const imageKey = Object.keys(imageFiles).find(k => k.startsWith(folder))

  cards.value.push({
    slug,
    title: titleLine?.replace(/^# /, '') || 'Untitled',
    name: nameLine?.replace(/^## /, '') || 'Anonymous',
    excerpt: excerptLine || '',
    route,
    image: imageKey ? (imageFiles[imageKey] as string) : null,
  })
}
</script>

<style scoped>
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
