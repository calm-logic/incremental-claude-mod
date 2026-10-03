export type Save = {
  tokens: number
  total: number
  ores: number[]
  pick: number
  speed: number
  luck: number
  auto: number
  swings: number
}

declare module 'claude-code' {
  interface PluginState {
    incremental: { save: Save | null; beat: number }
  }
}
