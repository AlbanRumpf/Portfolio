/// <reference types="node" />  // 👈 keep this if you use TypeScript

import { defineConfig } from 'vitepress'

const isProd = process.env.NODE_ENV === 'production'

// ⚠️ make sure this matches your repo name exactly
const repoName = 'Portfolio'

export default defineConfig({
  title: 'Portfolio',
  description: 'A VitePress Site',

  vite: {
    assetsInclude: ['**/*.JPG', '**/*.JPEG', '**/*.PNG', '**/*.WEBP', '**/*.MP4']
  },

  // GitHub Pages project site: https://<user>.github.io/<repo>/
  base: isProd ? `/${repoName}/` : '/',

  themeConfig: {
    nav: [
      // ❌ no BASE_URL here, just plain paths
      { text: 'Home',  link: '/' },
      { text: 'about', link: '/about/' },
      { text: 'Installations', link: '/installations/' },
    ],
  },

  head: [
    [
      'link',
      {
        rel: 'stylesheet',
        href:
          'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans&family=IBM+Plex+Serif&display=swap'
      }
    ]
  ]
})
