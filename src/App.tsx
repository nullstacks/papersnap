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
import { TOOLS } from './content/tools';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <>
      <Header />
      <main className="h-[calc(100vh-60px)]">
        <Routes>
          <Route path="/" element={<HomePage />} />
          {TOOLS.map((tool) => (
            <Route key={tool.slug} path={`/${tool.slug}`} element={<ToolPage slug={tool.slug} />} />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </>
  );
}
