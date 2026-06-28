import { Check, Palette } from 'lucide-react'
import { Section, SectionHeading } from '../ui/Section'
import { Reveal } from '../ui/Reveal'
import { THEMES, useTheme } from '../../lib/theme'
import { cn } from '../../lib/cn'

export function ThemeGallery(): React.JSX.Element {
  const { themeId, commit, preview } = useTheme()

  return (
    <Section id="themes" className="py-24 sm:py-32" grid>
      <SectionHeading
        kicker="9 originals, not recolors"
        title="Dress your deck."
        sub="Every theme defines its own surfaces, ink, accent, and a full 16-color ANSI palette. Hover any swatch to preview it across this whole page. Click to keep it."
      />

      <div
        className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onMouseLeave={() => preview(null)}
      >
        {THEMES.map((t, i) => {
          const isActive = t.id === themeId
          return (
            <Reveal key={t.id} delay={i * 45}>
              <button
                onMouseEnter={() => preview(t.id)}
                onFocus={() => preview(t.id)}
                onClick={() => commit(t.id)}
                aria-pressed={isActive}
                className={cn(
                  'group block w-full overflow-hidden rounded-xl border text-left transition-all duration-150 hover:-translate-y-0.5',
                  isActive
                    ? 'border-accent/60 shadow-[0_18px_44px_-26px_var(--accent-soft)]'
                    : 'border-edge-2 hover:border-edge'
                )}
              >
                {/* preview */}
                <div
                  className="flex h-24 flex-col justify-between p-3.5"
                  style={{ backgroundColor: t.bg[0] }}
                >
                  <div className="flex gap-1.5">
                    {[t.accent, t.ansi[2], t.ansi[4], t.ansi[5], t.ink[0]].map((c, j) => (
                      <span
                        key={j}
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: c, boxShadow: `0 0 0 1px ${t.edge[0]}` }}
                      />
                    ))}
                  </div>
                  <div className="flex items-end gap-1.5 font-mono text-[11px]" style={{ color: t.term.ink }}>
                    <span style={{ color: t.accent }}>❯</span>
                    <span className="truncate">{t.tagline}</span>
                  </div>
                </div>
                {/* footer */}
                <div
                  className="flex items-center justify-between border-t px-3.5 py-2.5"
                  style={{ backgroundColor: t.bg[1], borderColor: t.edge[1] }}
                >
                  <span className="font-ui text-[12.5px] font-semibold" style={{ color: t.ink[0] }}>
                    {t.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className="font-ui text-[9.5px] font-semibold tracking-wider uppercase"
                      style={{ color: t.ink[2] }}
                    >
                      {t.kind}
                    </span>
                    {isActive && (
                      <span className="flex items-center gap-1 rounded px-1.5 py-0.5 font-ui text-[9.5px] font-semibold tracking-wider uppercase" style={{ backgroundColor: `${t.accent}26`, color: t.accent }}>
                        <Check size={10} /> Active
                      </span>
                    )}
                  </span>
                </div>
              </button>
            </Reveal>
          )
        })}
      </div>

      <Reveal delay={120} className="mt-6 flex items-center justify-center gap-2 font-ui text-[12.5px] text-ink-3">
        <Palette size={14} className="text-accent" />
        The same switcher lives in the nav. Your choice is remembered on this page.
      </Reveal>
    </Section>
  )
}
