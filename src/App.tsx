/**
 * Route table. Every tool lives at /#/<slug>.
 *
 * Unknown slugs fall through to the home page rather than a 404, which keeps
 * stale bookmarks useful on a static host.
 */
import { Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { HomePage } from './pages/HomePage';
import { ToolPage } from './components/ToolPage';
import { ALL_TOOL_BY_SLUG } from './content/tools';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <>
      <Header />
      {/*
        * The single scroll container for the whole app. The body is locked
        * (see index.css) so there is exactly one scrollbar, and every page —
        * landing, tool, result — scrolls this element rather than itself.
        */}
      <main className="h-[calc(100vh-60px)] overflow-y-auto overflow-x-hidden">
        <Routes>
          <Route path="/" element={<HomePage />} />
          {/* Every catalogued slug gets a route, including the hidden ones, so
              an old bookmark still opens its tool. Only the navigation hides
              them (see ToolDef.hidden). */}
          {Object.values(ALL_TOOL_BY_SLUG).map((tool) => (
            <Route key={tool.slug} path={`/${tool.slug}`} element={<ToolPage slug={tool.slug} />} />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </>
  );
}