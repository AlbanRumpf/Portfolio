<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import portraitImage from '../../../about/Portrait.jpg'

const lineTimers: number[] = []

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function setRandomGlitchVars(el: HTMLElement) {
  el.style.setProperty('--glitch-visibility-duration', `${randomBetween(4.8, 8.6).toFixed(2)}s`)
  el.style.setProperty('--glitch-red-duration', `${randomBetween(0.8, 1.6).toFixed(2)}s`)
  el.style.setProperty('--glitch-cyan-duration', `${randomBetween(1.0, 1.9).toFixed(2)}s`)
  el.style.setProperty('--glitch-distort-duration', `${randomBetween(1.2, 2.3).toFixed(2)}s`)
  el.style.setProperty('--glitch-layer-red-duration', `${randomBetween(1.1, 2.4).toFixed(2)}s`)
  el.style.setProperty('--glitch-layer-cyan-duration', `${randomBetween(1.0, 2.2).toFixed(2)}s`)

  el.style.setProperty('--glitch-red-delay', `${randomBetween(-1.2, 0.3).toFixed(2)}s`)
  el.style.setProperty('--glitch-cyan-delay', `${randomBetween(-1.4, 0.35).toFixed(2)}s`)
  el.style.setProperty('--glitch-distort-delay', `${randomBetween(-1.6, 0.4).toFixed(2)}s`)
  el.style.setProperty('--glitch-layer-red-delay', `${randomBetween(-1.5, 0.3).toFixed(2)}s`)
  el.style.setProperty('--glitch-layer-cyan-delay', `${randomBetween(-1.5, 0.35).toFixed(2)}s`)

  el.style.setProperty('--glitch-jump-x', `${randomBetween(1.2, 4.2).toFixed(2)}px`)
  el.style.setProperty('--glitch-jump-y', `${randomBetween(0.6, 2.6).toFixed(2)}px`)
  el.style.setProperty('--glitch-skew', `${randomBetween(0.8, 2.8).toFixed(2)}deg`)
}

function scheduleRetune(el: HTMLElement) {
  const delayMs = Math.floor(randomBetween(2200, 5200))
  const id = window.setTimeout(() => {
    setRandomGlitchVars(el)
    scheduleRetune(el)
  }, delayMs)
  lineTimers.push(id)
}

onMounted(() => {
  const lines = document.querySelectorAll<HTMLElement>('.also-glitch-line')
  lines.forEach((line) => {
    setRandomGlitchVars(line)
    scheduleRetune(line)
  })
})

onUnmounted(() => {
  lineTimers.forEach((id) => window.clearTimeout(id))
  lineTimers.length = 0
})
</script>

<template>
  <div class="flex flex-row gap-12 min-h-[80vh] items-start text-white">
    <!-- Image on left -->
    <div class="flex-shrink-0 pt-4 -ml-47 fade-in-image">
      <img :src="portraitImage" alt="Portrait" class="w-80 h-auto rounded-lg" />
    </div>
    
    <!-- Content on right -->
    <div class="flex-1 fade-in-content">
      <Content class="prose prose-invert prose-base md:prose-lg max-w-none break-words" />
    </div>
  </div>
</template>

<style scoped>
.fade-in-image,
.fade-in-content {
  animation: fadeIn 1.8s ease-out forwards;
  opacity: 0;
}

.fade-in-image {
  animation-delay: 0s;
}

.fade-in-content {
  animation-delay: 0.3s;
}

:deep(.also-glitch-line) {
  position: relative;
  display: block;
  width: fit-content;
  margin: 0.45rem 0;
  overflow: visible;
}

:deep(.also-line-clean) {
  opacity: 0;
  transition: opacity 0.18s ease;
}

:deep(.also-line-clean a) {
  pointer-events: none;
}

:deep(.also-line-glitch) {
  overflow: visible;
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  white-space: nowrap;
  opacity: 1;
  color: rgba(255, 255, 255, 0.72);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: none;
  pointer-events: none;
}

:deep(.also-line-glitch::before),
:deep(.also-line-glitch::after) {
  content: attr(data-glitch);
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  pointer-events: none;
  opacity: 0;
}

:deep(.also-line-glitch::before) {
  color: rgba(255, 100, 100, 0.5);
  background: rgba(255, 0, 100, 0.18);
  mix-blend-mode: screen;
}

:deep(.also-line-glitch::after) {
  color: rgba(100, 255, 255, 0.5);
  background: rgba(0, 255, 255, 0.18);
  mix-blend-mode: screen;
}

:deep(.also-glitch-line:not(:hover) .also-line-glitch) {
  animation:
    about-glitch-visibility var(--glitch-visibility-duration, 5.2s) ease-in-out infinite,
    about-glitch-red var(--glitch-red-duration, 0.95s) infinite var(--glitch-red-delay, 0s),
    about-glitch-cyan var(--glitch-cyan-duration, 1.15s) infinite var(--glitch-cyan-delay, 0.2s),
    about-glitch-distort var(--glitch-distort-duration, 1.45s) steps(1, end) infinite var(--glitch-distort-delay, 0.15s);
}

:deep(.also-glitch-line:not(:hover) .also-line-glitch::before) {
  animation: about-glitch-layer-red var(--glitch-layer-red-duration, 1.4s) infinite var(--glitch-layer-red-delay, 0s);
}

:deep(.also-glitch-line:not(:hover) .also-line-glitch::after) {
  animation: about-glitch-layer-cyan var(--glitch-layer-cyan-duration, 1.35s) infinite var(--glitch-layer-cyan-delay, 0.25s);
}

:deep(.also-glitch-line:hover .also-line-clean) {
  opacity: 1;
}

:deep(.also-glitch-line:hover .also-line-clean a) {
  pointer-events: auto;
}

:deep(.also-glitch-line:hover .also-line-glitch) {
  opacity: 0;
  animation: none;
  text-shadow: none;
  box-shadow: none;
  transform: none;
}

:deep(.also-glitch-line:hover .also-line-glitch::before),
:deep(.also-glitch-line:hover .also-line-glitch::after) {
  opacity: 0;
  animation: none;
}

@keyframes about-glitch-red {
  0%, 100% {
    text-shadow:
      0 0 0 rgba(255, 0, 0, 0),
      3px 3px 0 rgba(255, 0, 0, 0);
  }
  50% {
    text-shadow:
      -2px 0 0 rgba(255, 80, 80, 0.45),
      2px 2px 0 rgba(255, 50, 50, 0.35);
  }
}

@keyframes about-glitch-cyan {
  0%, 100% {
    box-shadow:
      0 0 0 rgba(0, 255, 255, 0);
  }
  50% {
    box-shadow:
      2px -1px 0 rgba(0, 220, 255, 0.35),
      -2px 0 0 rgba(0, 255, 255, 0.3);
  }
}

@keyframes about-glitch-distort {
  0%, 100% {
    transform: translate(0, 0) skewX(0deg) scaleX(1);
  }
  9% {
    transform: translate(calc(var(--glitch-jump-x, 2px) * -0.4), 0) skewX(calc(var(--glitch-skew, 2deg) * -0.45)) scaleX(0.995);
  }
  21% {
    transform: translate(var(--glitch-jump-x, 2px), calc(var(--glitch-jump-y, 1px) * -1)) skewX(calc(var(--glitch-skew, 2deg) * 1.2)) scaleX(1.015);
  }
  33% {
    transform: translate(calc(var(--glitch-jump-x, 2px) * -1.25), var(--glitch-jump-y, 1px)) skewX(calc(var(--glitch-skew, 2deg) * -1.05)) scaleX(0.985);
  }
  47% {
    transform: translate(calc(var(--glitch-jump-x, 2px) * 0.45), calc(var(--glitch-jump-y, 1px) * -1.35)) skewX(calc(var(--glitch-skew, 2deg) * 0.55)) scaleX(1.01);
  }
  62% {
    transform: translate(calc(var(--glitch-jump-x, 2px) * -0.8), calc(var(--glitch-jump-y, 1px) * -0.6)) skewX(calc(var(--glitch-skew, 2deg) * -1.25)) scaleX(0.99);
  }
  78% {
    transform: translate(calc(var(--glitch-jump-x, 2px) * 1.35), calc(var(--glitch-jump-y, 1px) * 0.8)) skewX(calc(var(--glitch-skew, 2deg) * 0.8)) scaleX(1.02);
  }
  91% {
    transform: translate(calc(var(--glitch-jump-x, 2px) * -0.35), 0) skewX(calc(var(--glitch-skew, 2deg) * -0.3)) scaleX(1);
  }
}

@keyframes about-glitch-visibility {
  0%, 9% {
    opacity: 0.72;
  }
  14%, 30% {
    opacity: 0;
  }
  37%, 45% {
    opacity: 0.68;
  }
  51%, 68% {
    opacity: 0;
  }
  76%, 84% {
    opacity: 0.7;
  }
  90%, 100% {
    opacity: 0;
  }
}

@keyframes about-glitch-layer-red {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  20% {
    transform: translate(-18px, -15px);
    opacity: 0.28;
  }
  40% {
    transform: translate(15px, -12px);
    opacity: 0.22;
  }
  60% {
    transform: translate(-14px, 17px);
    opacity: 0.28;
  }
  80% {
    transform: translate(17px, 11px);
    opacity: 0.22;
  }
  100% {
    transform: translate(0, 0);
    opacity: 0;
  }
}

@keyframes about-glitch-layer-cyan {
  0% {
    transform: translate(0, 0);
    opacity: 0;
  }
  20% {
    transform: translate(17px, 14px);
    opacity: 0.28;
  }
  40% {
    transform: translate(-15px, 15px);
    opacity: 0.22;
  }
  60% {
    transform: translate(18px, -11px);
    opacity: 0.28;
  }
  80% {
    transform: translate(-17px, -14px);
    opacity: 0.22;
  }
  100% {
    transform: translate(0, 0);
    opacity: 0;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
