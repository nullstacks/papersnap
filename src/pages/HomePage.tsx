/**
 * Landing page: hero, category filter and the full tool grid.
 *
 * The grid is the reference's own card layout — 48px tool icon, title, and a
 * two-line description in a bordered tile that lifts on hover.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HOME_FILTERS, TOOLS } from '@/content/tools';

const FEATURES = [
  {
    title: 'Files stay on your device',
    body: 'Every conversion runs inside your browser tab. Nothing is uploaded, nothing is stored, and no account is needed.',
  },
  {
    title: 'Real PDF tooling, not a wrapper',
    body: 'Paging, merging, encryption, text extraction and rendering are done by a PDF engine bundled with this site.',
  },
  {
    title: 'Works offline',
    body: 'Once the page has loaded you can keep working with the network switched off. Add it to your home screen and it stays available.',
  },
] as const;

export function HomePage() {
  const [filter, setFilter] = useState('all');

  const visible = useMemo(
    () => (filter === 'all' ? TOOLS : TOOLS.filter((t) => t.category === filter)),
    [filter],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1240px] px-6 pt-10 pb-20">
        <div className="mx-auto mb-8 max-w-[860px] text-center">
          <h1 className="text-[34px] leading-[42px] font-semibold text-ink-2 md:text-[42px] md:leading-[52px]">
            Every tool you need to work with PDFs in one place
          </h1>
          <p className="mx-auto mt-4 max-w-[800px] text-[17px] leading-7 text-body">
            Every tool you need to use PDFs, at your fingertips. All are 100% free and easy to use.
            Merge, split, compress, convert, rotate, unlock and watermark PDFs with just a few
            clicks — all inside your browser.
          </p>
        </div>

        <div className="mb-7 flex flex-wrap justify-center gap-2">
          {HOME_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === f.id
                  ? /* Inverted pill: brand red reads correctly on both themes,
                       unlike an ink/white pair which collides in dark mode. */
                    'border-brand bg-brand text-white'
                  : 'border-line bg-surface text-ink-2 hover:border-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {visible.map((tool) => (
            <Link
              key={tool.slug}
              to={`/${tool.slug}`}
              title={tool.title}
              className="group flex flex-col rounded-2xl border border-line-soft bg-surface p-5 no-underline transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.10)]"
            >
              <img src={tool.icon} alt="" aria-hidden="true" className="mb-3 h-12 w-12" />
              <h3 className="mb-1 text-[17px] font-semibold text-ink-2 group-hover:text-brand">
                {tool.title}
              </h3>
              <p className="text-sm leading-[21px] text-muted">{tool.desc}</p>
            </Link>
          ))}
        </div>

        <section className="mt-16 grid gap-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="rounded-2xl border border-line-soft bg-surface p-6">
              <h3 className="mb-2 text-[17px] font-semibold text-ink-2">{f.title}</h3>
              <p className="text-sm leading-[22px] text-muted">{f.body}</p>
            </article>
          ))}
        </section>

        {/* Inverted promo panel: a fixed dark surface in light mode, a slightly
            raised panel in dark mode (bg-ink would turn near-white there). */}
        <section className="mt-14 rounded-2xl bg-[#161616] px-6 py-12 text-center dark:bg-[#1c1c23]">
          <h2 className="text-[26px] leading-9 font-semibold text-white">
            A PDF workbench that never phones home
          </h2>
          <p className="mx-auto mt-3 max-w-[620px] text-[15px] leading-6 text-white/70">
            Pick a tool and drop a file. Everything you do — merging, splitting, compressing,
            converting, protecting — happens right here in the tab.
          </p>
          <Link
            to="/merge-pdf"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white no-underline hover:bg-brand-dark"
          >
            Start with Merge PDF
          </Link>
        </section>
      </div>
    </div>
  );
}
