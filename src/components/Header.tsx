/**
 * Site header.
 *
 * Desktop: brand, the three primary tool links, a Convert dropdown and the
 * "All PDF tools" mega-menu, exactly as the reference lays them out.
 *
 * Mobile: the bar collapses to brand + menu button, and navigation moves into
 * a full-height sheet so nothing is cramped or clipped on a phone.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAV_GROUPS, NAV_PRIMARY, TOOL_BY_SLUG } from '@/content/tools';
import brandMark from '@/assets/img/brand.svg';
import { useTheme } from '@/hooks/useTheme';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { ICONS } from './Icons';

const CONVERT_TO = ['jpg-to-pdf', 'word-to-pdf', 'powerpoint-to-pdf', 'excel-to-pdf', 'html-to-pdf'];
const CONVERT_FROM = ['pdf-to-jpg', 'pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'convert-pdf-to-pdfa'];

/** One row inside a dropdown: small tool icon plus its label. */
function MenuItem({ slug, onNavigate }: { slug: string; onNavigate: () => void }) {
  const tool = TOOL_BY_SLUG[slug];
  if (!tool) return null;
  return (
    <li>
      <Link
        to={`/${slug}`}
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-ink-2 no-underline whitespace-nowrap hover:bg-canvas hover:text-brand"
      >
        <img src={tool.icon} alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
        <span className="truncate">{tool.title}</span>
      </Link>
    </li>
  );
}

/** A titled column of tools inside a dropdown. */
function MenuColumn({
  title,
  slugs,
  onNavigate,
}: {
  title: string;
  slugs: string[];
  onNavigate: () => void;
}) {
  return (
    <div>
      <div className="px-2 pb-2 text-[11.5px] font-semibold tracking-[0.04em] text-muted uppercase">
        {title}
      </div>
      <ul className="m-0 list-none p-0">
        {slugs.map((s) => (
          <MenuItem key={s} slug={s} onNavigate={onNavigate} />
        ))}
      </ul>
    </div>
  );
}

export function Header() {
  const { pathname } = useLocation();
  const activeSlug = pathname.replace(/^\//, '');
  const [open, setOpen] = useState<'convert' | 'all' | 'company' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();
  const install = useInstallPrompt();

  /* Close any open menu on outside click or Escape. */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null);
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  /* Route changes dismiss everything. */
  useEffect(() => {
    setOpen(null);
    setMenuOpen(false);
  }, [pathname]);

  /* A sheet menu should not let the page scroll behind it. */
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const toggle = (which: 'convert' | 'all' | 'company') =>
    setOpen((cur) => (cur === which ? null : which));

  const trigger =
    'flex h-[60px] cursor-pointer items-center gap-1 px-3 text-[14px] font-medium uppercase text-ink bg-transparent border-0 hover:text-brand';

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-[60px] border-b border-line bg-surface px-3 sm:px-6">
      <nav ref={navRef} className="flex h-[60px] items-center gap-1 sm:gap-2">
        <Link
          to="/"
          className="mr-1 flex shrink-0 items-center gap-2 no-underline sm:mr-3.5"
          aria-label="PDFDock home"
        >
          <img src={brandMark} alt="" width={34} height={32} className="block h-7 w-auto sm:h-8" />
          <span className="text-[19px] leading-none font-bold tracking-[-0.4px] whitespace-nowrap text-ink sm:text-[22px]">
            PDF<span className="font-medium text-brand">Dock</span>
          </span>
        </Link>

        {/* ---------- desktop navigation ---------- */}
        <div className="hidden h-[60px] items-center lg:flex">
          <ul className="m-0 flex h-full list-none items-center p-0">
            {NAV_PRIMARY.map(({ slug, label }) => (
              <li key={slug} className="flex h-full items-center">
                <Link
                  to={`/${slug}`}
                  className={`flex h-[60px] items-center px-3 text-[14px] font-medium uppercase no-underline hover:text-brand ${
                    activeSlug === slug ? 'text-brand' : 'text-ink'
                  }`}
                >
                  {label}
                </Link>
              </li>
            ))}

            <li className="relative flex h-full items-center">
              <button
                type="button"
                className={trigger}
                aria-expanded={open === 'convert'}
                onClick={() => toggle('convert')}
              >
                Convert PDF
                <img src={ICONS.chevronDown} alt="" aria-hidden="true" className="h-4 w-4 opacity-60" />
              </button>
              {open === 'convert' && (
                <div className="absolute top-[58px] left-1/2 z-50 w-[520px] -translate-x-1/2 rounded-2xl bg-surface p-5 shadow-[0_12px_40px_rgba(0,0,0,0.16)]">
                  <div className="grid grid-cols-2 gap-x-5 gap-y-1">
                    <MenuColumn title="Convert to PDF" slugs={CONVERT_TO} onNavigate={() => setOpen(null)} />
                    <MenuColumn title="Convert from PDF" slugs={CONVERT_FROM} onNavigate={() => setOpen(null)} />
                  </div>
                </div>
              )}
            </li>
          </ul>

          <ul className="m-0 ml-1 flex h-full list-none items-center p-0">
            <li className="relative flex h-full items-center">
              <button
                type="button"
                className={trigger}
                aria-expanded={open === 'all'}
                onClick={() => toggle('all')}
              >
                All PDF tools
                <img src={ICONS.chevronDown} alt="" aria-hidden="true" className="h-4 w-4 opacity-60" />
              </button>
              {open === 'all' && (
                <div className="fixed inset-x-0 top-[60px] z-50 mx-auto w-full max-w-[1180px] rounded-2xl bg-surface p-6 shadow-[0_12px_40px_rgba(0,0,0,0.16)]">
                  <div className="grid grid-cols-3 gap-x-5 gap-y-4 xl:grid-cols-6">
                    {NAV_GROUPS.map((g) => (
                      <MenuColumn key={g.title} title={g.title} slugs={g.tools} onNavigate={() => setOpen(null)} />
                    ))}
                  </div>
                </div>
              )}
            </li>
          </ul>
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {install.available && (
            <button
              type="button"
              onClick={install.install}
              title="Install PDFDock as an app"
              className="hidden h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 hover:border-muted md:flex"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12" />
                <path d="m7 12 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              Install
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent text-ink hover:bg-canvas"
          >
            {theme === 'dark' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M21 12.8A8.6 8.6 0 1 1 11.2 3a6.9 6.9 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>

          <div className="relative hidden sm:block">
            <button
              type="button"
              aria-label="More"
              aria-expanded={open === 'company'}
              onClick={() => toggle('company')}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-ink hover:bg-canvas"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {open === 'company' && (
              <div className="absolute top-11 right-0 z-50 w-[300px] rounded-2xl bg-surface p-3 shadow-[0_12px_40px_rgba(0,0,0,0.16)]">
                <ul className="m-0 list-none p-0">
                  <li>
                    <Link
                      to="/protect-pdf"
                      onClick={() => setOpen(null)}
                      className="flex items-start gap-3 rounded-lg p-2 no-underline hover:bg-canvas"
                    >
                      <span className="mt-0.5 text-brand">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          <path d="M9.5 12.2 11.4 14l3.4-3.6" />
                        </svg>
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-ink">Privacy first</span>
                        <span className="block text-xs text-muted">Files never leave your device</span>
                      </span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/repair-pdf"
                      onClick={() => setOpen(null)}
                      className="flex items-start gap-3 rounded-lg p-2 no-underline hover:bg-canvas"
                    >
                      <span className="mt-0.5 text-brand">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M24 14.187V9.813c-2.148-.766-2.726-.802-3.027-1.53s.083-1.17 1.06-3.223L18.94 1.968c-2.026.963-2.488 1.364-3.224 1.06-.727-.302-.768-.89-1.527-3.027H9.813c-.764 2.144-.8 2.725-1.53 3.027-.752.313-1.203-.1-3.223-1.06L1.968 5.06c.977 2.055 1.362 2.493 1.06 3.224S2.146 9.05 0 9.813v4.375c2.14.76 2.725.8 3.027 1.528.304.734-.08 1.167-1.06 3.223l3.093 3.093c2-.95 2.47-1.373 3.223-1.06.728.302.764.88 1.53 3.027h4.374c.758-2.13.8-2.723 1.537-3.03.745-.308 1.186.1 3.215 1.062l3.093-3.093c-.975-2.05-1.362-2.492-1.06-3.223.3-.726.88-.763 3.027-1.528zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
                        </svg>
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-ink">Works offline</span>
                        <span className="block text-xs text-muted">Install it and take it anywhere</span>
                      </span>
                    </Link>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* ---------- mobile menu button ---------- */}
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent text-ink hover:bg-canvas lg:hidden"
          >
            {menuOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile sheet */}
      {menuOpen && (
        <div className="fixed inset-x-0 top-[60px] bottom-0 z-50 overflow-y-auto border-t border-line bg-surface px-4 pt-4 pb-10 lg:hidden">
          {install.available && (
            <button
              type="button"
              onClick={install.install}
              className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-[15px] font-semibold text-white"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12" />
                <path d="m7 12 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              Install app
            </button>
          )}
          <div className="mb-5">
            <div className="mb-2 text-[11.5px] font-semibold tracking-[0.04em] text-muted uppercase">
              Main tools
            </div>
            <ul className="m-0 list-none p-0">
              {NAV_PRIMARY.map(({ slug, label }) => (
                <li key={slug}>
                  <Link
                    to={`/${slug}`}
                    className={`block rounded-lg px-2 py-2.5 text-[15px] no-underline ${
                      activeSlug === slug ? 'bg-canvas font-medium text-brand' : 'text-ink-2'
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {NAV_GROUPS.map((g) => (
            <div key={g.title} className="mb-5">
              <div className="mb-2 text-[11.5px] font-semibold tracking-[0.04em] text-muted uppercase">
                {g.title}
              </div>
              <ul className="m-0 list-none p-0">
                {g.tools.map((s) => {
                  const tool = TOOL_BY_SLUG[s];
                  if (!tool) return null;
                  return (
                    <li key={s}>
                      <Link
                        to={`/${s}`}
                        className={`flex items-center gap-3 rounded-lg px-2 py-2.5 text-[15px] no-underline ${
                          activeSlug === s ? 'bg-canvas font-medium text-brand' : 'text-ink-2'
                        }`}
                      >
                        <img src={tool.icon} alt="" aria-hidden="true" className="h-6 w-6 shrink-0" />
                        <span className="truncate">{tool.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
