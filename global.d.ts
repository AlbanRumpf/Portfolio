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
