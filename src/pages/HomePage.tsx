/**
 * Landing page: hero, family switch, category filter and the tool grid.
 *
 * The app now has two families — PDF and image — and the reference puts each
 * on its own site. Rather than split PaperSnap in two, the hero carries a
 * switch so the grid can show one family or both, and the filter chips below
 * narrow it further.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ALL_FILTERS, ALL_TOOLS } from '@/content/tools';
import { Footer } from '@/components/Footer';

const FEATURES = [
  {
    title: 'Files stay on your device',
    body: 'Every conversion runs inside your browser tab. Nothing is uploaded, nothing is stored, and no account is needed.',
  },
  {
    title: 'Real tooling, not a wrapper',
    body: 'Paging, merging, encryption, text extraction, rendering, cropping and filtering are all done by engines bundled with this site.',
  },
  {
    title: 'Works offline',
    body: 'Once the page has loaded you can keep working with the network switched off. Add it to your home screen and it stays available.',
  },
] as const;

type Family = 'all' | 'pdf' | 'image';

const FAMILIES: Array<{ id: Family; label: string }> = [
  { id: 'all', label: 'All tools' },
  { id: 'pdf', label: 'PDF tools' },
  { id: 'image', label: 'Image tools' },
];

export function HomePage() {
  const [filter, setFilter] = useState('all');
  const [family, setFamily] = useState<Family>('all');

  /*
   * The two families are concatenated once and then filtered in a single
   * pass, so a chip that belongs to the other family cannot leave the grid
   * mysteriously empty: switching family resets the chip.
   */
  const visible = useMemo(() => {
    /*
     * ALL_TOOLS is already filtered, so a hidden tool can never reach the grid;
     * this only has to split the two families apart.
     */
    const pool =
      family === 'all'
        ? ALL_TOOLS
        : ALL_TOOLS.filter((t) =>
            family === 'image'
              ? t.category.startsWith('image-')
              : !t.category.startsWith('image-'),
          );
    return filter === 'all' ? pool : pool.filter((t) => t.category === filter);
  }, [filter, family]);

  const chips = useMemo(() => {
    if (family === 'all') return ALL_FILTERS;
    const prefix = family === 'pdf' ? '' : 'image-';
    return ALL_FILTERS.filter((f) => f.id === 'all' || (family === 'image' ? f.id.startsWith('image-') : !f.id.startsWith('image-') && prefix === ''));
  }, [family]);

  const chooseFamily = (next: Family) => {
    setFamily(next);
    setFilter('all');
  };

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-[1240px] px-6 pt-10 pb-20">
        <div className="mx-auto mb-7 max-w-[880px] text-center">
          <h1 className="text-[34px] leading-[42px] font-semibold text-ink-2 md:text-[42px] md:leading-[52px]">
            Every tool you need to work with PDFs and images in one place
          </h1>
          <p className="mx-auto mt-4 max-w-[820px] text-[17px] leading-7 text-body">
            Merge, split, compress, convert, rotate, unlock and watermark PDFs — or crop,
            resize, compress, convert and retouch images. All of it runs inside your
            browser, all of it is free, and nothing is ever uploaded.
          </p>
        </div>

        {/* Family switch: the reference keeps its two sites apart; here it is a
            single control so the same grid can serve both. */}
        <div
          className="mb-5 flex justify-center"
          role="tablist"
          aria-label="Tool family"
        >
          {/* `whitespace-nowrap` plus tighter padding on the narrowest phones:
              "All tools" otherwise broke onto two lines below 375px, which made
              the switch change height between breakpoints. */}
          <div className="inline-flex rounded-full border border-line bg-surface p-1">
            {FAMILIES.map((f) => {
              const active = family === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => chooseFamily(f.id)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors sm:px-5 sm:text-[14px] ${
                    active
                      ? f.id === 'image'
                        ? 'bg-img text-white shadow-btn'
                        : f.id === 'pdf'
                          ? 'bg-brand text-white shadow-btn'
                          : 'bg-ink-2 text-surface shadow-btn'
                      : 'text-muted hover:text-ink-2'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-7 flex flex-wrap justify-center gap-2">
          {chips.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              /*
               * The active chip carries its family's accent colour: red for the
               * PDF categories, blue for the image ones, and plain ink for
               * "All". A neutral grey read as a disabled button rather than a
               * selected one, which is why the current filter was hard to spot.
               */
              className={`rounded-full border-2 px-4 py-1.5 text-sm font-semibold transition-colors ${
                filter === f.id
                  ? f.id.startsWith('image-')
                    ? 'border-img bg-img text-white shadow-btn'
                    : f.id.startsWith('image') || f.id === 'all'
                      ? 'border-ink-2 bg-ink-2 text-surface shadow-btn'
                      : 'border-brand bg-brand text-white shadow-btn'
                  : 'border-line bg-surface text-ink-2 hover:border-muted hover:text-ink'
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
              {/* h2, not h3: the grid follows the page's h1 directly, and a
                  skipped level is an axe violation. */}
              <h2 className="mb-1 text-[17px] font-semibold text-ink-2 group-hover:text-brand">
                {tool.title}
              </h2>
              <p className="text-sm leading-[21px] text-muted">{tool.desc}</p>
            </Link>
          ))}
        </div>

        <section className="mt-16 grid gap-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="rounded-2xl border border-line-soft bg-surface p-6">
              <h2 className="mb-2 text-[17px] font-semibold text-ink-2">{f.title}</h2>
              <p className="text-sm leading-[22px] text-muted">{f.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-14 rounded-2xl bg-[#161616] px-6 py-12 text-center dark:bg-[#1c1c23]">
          <h2 className="text-[26px] leading-9 font-semibold text-white">
            A workbench that never phones home
          </h2>
          <p className="mx-auto mt-3 max-w-[620px] text-[15px] leading-6 text-white/70">
            Pick a tool and drop a file. Everything you do — merging, splitting,
            compressing, converting, protecting, cropping, retouching — happens right
            here in the tab.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/merge-pdf"
              className="inline-flex items-center justify-center rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white no-underline hover:bg-brand-dark"
            >
              Start with Merge PDF
            </Link>
            <Link
              to="/compress-image"
              className="inline-flex items-center justify-center rounded-xl bg-img px-6 py-3 text-sm font-semibold text-white no-underline hover:bg-img-dark"
            >
              Or compress an image
            </Link>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
}