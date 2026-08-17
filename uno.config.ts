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
      studio: {
        bg: '#09090b',
        surface: '#121215',
        elevated: '#18181b',
        card: '#1c1c21',
      },
      zinc: {
        100: '#f4f4f5',
        200: '#e4e4e7',
        300: '#d4d4d8',
        400: '#a1a1aa',
        500: '#71717a',
        600: '#52525b',
        700: '#3f3f46',
        800: '#27272a',
        900: '#18181b',
        950: '#09090b',
      },
      edge: {
        orange: '#fbbf24', // Fresh Luminous Amber
        amber: '#fbbf24',
        cyan: '#38bdf8',
        emerald: '#34d399',
        rose: '#fb7185',
      },
    },
    fontFamily: {
      sans: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
      mono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
    },
  },
  shortcuts: {
    /* ── High-density UI tokens ──────────────── */
    'panel': 'bg-studio-surface border border-white/8 rounded-xl',
    'panel-elevated': 'bg-studio-elevated border border-white/10 rounded-xl shadow-xl',
    'input-clean': 'w-full bg-studio-elevated border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/30',
    'btn-primary': 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-400 text-zinc-950 hover:bg-amber-300 active:scale-[0.98] transition-all cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none shadow-sm shadow-amber-500/10',
    'btn-secondary': 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] border border-white/10 text-zinc-200 hover:bg-white/[0.09] hover:text-white active:scale-[0.98] transition-all cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none',
    'btn-ghost': 'inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-100 hover:bg-white/6 transition-colors cursor-pointer select-none disabled:opacity-40 disabled:pointer-events-none',
    'btn-danger': 'inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 transition-colors cursor-pointer select-none',
    'badge': 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium',
    'badge-public': 'badge bg-emerald-500/10 border border-emerald-500/25 text-emerald-400',
    'badge-private': 'badge bg-zinc-500/10 border border-zinc-500/25 text-zinc-400',
    'badge-count': 'inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/10 text-zinc-300',
  },
})
