/**
 * File-card helpers: cover rendering and reordering.
 *
 * Kept out of the components so the ToolPage stays focused on layout/state and
 * the same logic is reusable by any tool that shows file previews.
 */
import { renderCover, renderImageCover, isPdf, isImage, bytesFor } from '@/lib/pdf';
import { decodeBlob } from '@/lib/image';
import { loadPdf } from '@/lib/pdf';
import type { WorkFile } from '@/types';

/** Read a file's metadata (page count, title, cover) once. */
export async function describeFile(file: File, id: number): Promise<WorkFile> {
  const entry: WorkFile = {
    id,
    file,
    name: file.name || 'document',
    size: file.size,
    rotation: 0,
    pages: null,
  };

  try {
    if (isPdf(file)) {
      const bytes = await bytesFor(entry);
      const doc = await loadPdf(bytes);
      entry.pages = doc.getPageCount();
      entry.title = doc.getTitle() || undefined;
      entry.thumb = (await renderCover(bytes)) ?? undefined;
    } else if (isImage(file)) {
      entry.thumb = (await renderImageCover(file)) ?? undefined;
      entry.pages = 1;
      /* Image tools show the pixel size on the card ("1600 x 1200"), so read it
         once here rather than opening the file again in every panel. */
      const size = await imageSize(file);
      entry.width = size.width;
      entry.height = size.height;
    }
  } catch (err) {
    entry.error = err instanceof Error ? err.message : String(err);
  }

  return entry;
}

/** Pixel dimensions of an image file, or 0x0 when it cannot be decoded. */
async function imageSize(file: File): Promise<{ width: number; height: number }> {
  try {
    const { width, height } = await decodeBlob(file);
    return { width, height };
  } catch {
    return { width: 0, height: 0 };
  }
}

/** Does a tool accept this file? */
export function fileAccepted(file: File, accept: string): boolean {
  if (!accept) return false; // form-driven tool: no file input at all
  if (accept === 'image/*') return isImage(file);
  if (accept === 'application/pdf') return isPdf(file);
  const exts = accept.split(',').filter((x) => x.startsWith('.'));
  return exts.some((ext) => file.name.toLowerCase().endsWith(ext.toLowerCase()));
}

/** Move an item from one index to another, returning a new array. */
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
