import { ref, computed, onMounted, onUnmounted } from 'vue'

type ScreenSize = 'mobile' | 'tablet' | 'desktop' | 'wide'

/**
 * Composable to detect and track screen size changes
 * 
 * Breakpoints:
 * - mobile: < 768px
 * - tablet: 768px - 1024px
 * - desktop: 1024px - 1440px
 * - wide: >= 1440px
 */
export function useScreenSize() {
  const width = ref(typeof window !== 'undefined' ? window.innerWidth : 0)

  const screenSize = computed<ScreenSize>(() => {
    if (width.value < 768) return 'mobile'
    if (width.value < 1024) return 'tablet'
    if (width.value < 1440) return 'desktop'
    return 'wide'
  })

  const isMobile = computed(() => screenSize.value === 'mobile')
  const isTablet = computed(() => screenSize.value === 'tablet')
  const isDesktop = computed(() => screenSize.value === 'desktop')
  const isWide = computed(() => screenSize.value === 'wide')
  
  // Grouped checks for convenience
  const isMobileOrTablet = computed(() => isMobile.value || isTablet.value)
  const isTabletOrLarger = computed(() => !isMobile.value)
  const isDesktopOrLarger = computed(() => screenSize.value === 'desktop' || screenSize.value === 'wide')

  const handleResize = () => {
    width.value = window.innerWidth
  }

  onMounted(() => {
    if (typeof window !== 'undefined') {
      width.value = window.innerWidth
      window.addEventListener('resize', handleResize, { passive: true })
    }
  })

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handleResize)
    }
  })

  return {
    width,
    screenSize,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    isMobileOrTablet,
    isTabletOrLarger,
    isDesktopOrLarger,
  }
}
