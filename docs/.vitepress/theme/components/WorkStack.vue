<template>
  <div
    ref="containerRef"
    class="mx-auto w-full max-w-6xl p-6"
  >
    <!-- Homepage content area (project list permanently removed from hero) -->
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
  route: string      // `/installations/?id=slug`
  image: string | null
}

const markdownFiles = import.meta.glob('../../../installations/**/index.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const imageFiles = import.meta.glob('../../../installations/**/cover.*', {
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

  // docs/installations/my-work/index.md -> slug = "my-work"
  const match = path.match(/installations\/([^/]+)\/index\.md$/)
  const slug = match?.[1] ?? ''

  const route = `/installations/?id=${slug}`

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
