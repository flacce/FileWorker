import {
  defineConfig,
  presetUno,
  presetIcons,
  transformerDirectives,
} from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  transformers: [transformerDirectives()],
  theme: {
    colors: {
      bento: {
        canvas: '#07080a',
        cell: '#0d0f12',
        raised: '#14171c',
        hover: '#1b1f26',
        active: '#222730',
      },
      ink: {
        primary: '#edeff2',
        secondary: '#949ba6',
        muted: '#5e6572',
        faint: '#3b4049',
      },
      accent: {
        DEFAULT: '#2dd4bf',
        hover: '#5eead4',
        dim: 'rgba(45, 212, 191, 0.12)',
        line: 'rgba(45, 212, 191, 0.32)',
      },
      danger: {
        DEFAULT: '#f87171',
        dim: 'rgba(248, 113, 113, 0.12)',
        line: 'rgba(248, 113, 113, 0.28)',
      },
    },
    borderRadius: {
      bento: '8px',
      ctrl: '6px',
      tag: '4px',
    },
    fontFamily: {
      sans: '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      mono: '"JetBrains Mono", "Cascadia Mono", "SF Mono", Consolas, monospace',
    },
  },
  shortcuts: {
    'bento-box':
      'bg-bento-cell border border-white/[0.06] rounded-bento overflow-hidden flex flex-col',
    'bento-subbox':
      'bg-bento-raised border border-white/[0.05] rounded-ctrl',
    'ctrl-input':
      'w-full bg-bento-raised border border-white/[0.07] rounded-ctrl px-2.5 h-8 text-xs text-ink-primary placeholder-ink-muted outline-none transition-colors focus:border-accent-line focus:bg-bento-hover',
    'btn-accent':
      'inline-flex items-center justify-center gap-1.5 px-3 h-8 rounded-ctrl text-xs font-medium bg-accent text-[#061210] hover:bg-accent-hover active:translate-y-[0.5px] transition-all cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none',
    'btn-surface':
      'inline-flex items-center justify-center gap-1.5 px-2.5 h-8 rounded-ctrl text-xs font-medium bg-bento-raised border border-white/[0.07] text-ink-primary hover:bg-bento-hover hover:border-white/[0.12] active:translate-y-[0.5px] transition-all cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none',
    'btn-quiet':
      'inline-flex items-center justify-center gap-1 px-2 h-7 rounded-ctrl text-xs text-ink-secondary hover:text-ink-primary hover:bg-white/[0.05] transition-colors cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none',
    'btn-icon':
      'inline-flex items-center justify-center w-7 h-7 rounded-ctrl text-ink-secondary hover:text-ink-primary hover:bg-white/[0.06] transition-colors cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none',
    'btn-danger-quiet':
      'inline-flex items-center justify-center gap-1 px-2.5 h-7 rounded-ctrl text-xs font-medium bg-danger-dim border border-danger-line text-danger hover:bg-danger/20 transition-colors cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none',
    'tag-chip':
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-tag text-[11px] leading-none font-normal border',
    'tag-accent':
      'tag-chip bg-accent-dim border-accent-line text-accent',
    'tag-neutral':
      'tag-chip bg-white/[0.03] border-white/[0.07] text-ink-secondary',
  },
})
