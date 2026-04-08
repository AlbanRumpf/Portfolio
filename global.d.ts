interface ImportMeta {
  glob(
    pattern: string | readonly string[],
    options?: {
      as?: string
      eager?: boolean
      import?: string
      query?: string | Record<string, string | number | boolean>
      exhaustive?: boolean
    }
  ): Record<string, unknown>
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.jpeg' {
  const src: string
  export default src
}

declare module '*.webp' {
  const src: string
  export default src
}

declare module '*.gif' {
  const src: string
  export default src
}
