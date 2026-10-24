import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-[42px] leading-[52px] font-semibold text-ink-2">Page not found</h1>
      <p className="text-body">That tool does not exist — pick one from the full list instead.</p>
      <Link
        to="/"
        className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white no-underline hover:bg-brand-dark"
      >
        Browse all tools
      </Link>
    </div>
  );
}
