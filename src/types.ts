/**
 * Shared domain types for the whole app.
 *
 * A "tool" is fully described by `ToolDef`; its behaviour is a `ToolImpl`.
 * Keeping these in one place lets the router, sidebar and engine stay decoupled.
 */

export type ToolCategory = 'organize' | 'optimize' | 'convert' | 'edit' | 'security';

/** A file the visitor added, plus everything the UI derived from it. */
export interface WorkFile {
  /** Stable id used as a React key and for reordering. */
  id: number;
  file: File;
  name: string;
  size: number;
  /** Clockwise rotation queued from the file card, in degrees. */
  rotation: number;
  /** Page count, once the bytes have been parsed. */
  pages: number | null;
  /** Cached bytes so tools do not re-read the File on every run. */
  bytes?: Uint8Array;
  /** Rendered first-page cover, as a data URL. */
  thumb?: string;
  /** Parsed document title, when present. */
  title?: string;
  /** Set when the file could not be parsed. */
  error?: string;
}

/** One produced file, ready to download. */
export interface ResultFile {
  name: string;
  blob: Blob;
  size: number;
}

/** Progress reporting handed to every tool implementation. */
export interface RunContext {
  files: WorkFile[];
  setProgress: (percent: number) => void;
  setStatus: (text: string) => void;
}

/** Static description of a tool: label, copy, icon, accepted input. */
export interface ToolDef {
  slug: string;
  category: ToolCategory;
  group: string;
  title: string;
  /** Page heading. */
  h1: string;
  /** Page sub-heading. */
  sub: string;
  /** Short description for the home grid and meta tag. */
  desc: string;
  /** Label on the primary action button. */
  action: string;
  /** `accept` attribute for the file input; '' means form-driven. */
  accept: string;
  multiple: boolean;
  min: number;
  /** Icon markup, kept as a data URL for compactness. */
  icon: string;
  acceptLabel?: string;
  dropLabel?: string;
}

/** Values a tool reads back out of its sidebar panel. */
export type FieldValues = Record<string, string | boolean | null>;

/**
 * A tool's behaviour. Panels are React components, so a tool only declares
 * which panel to render and how to execute.
 */
export interface ToolImpl {
  /**
   * Options column (the sidebar). Renders controls only — never page
   * thumbnails: page picking belongs in the main work area, where there is
   * room for a readable grid.
   */
  Panel: React.ComponentType<PanelProps>;
  /**
   * Optional content for the main work area, rendered beneath the file cards.
   * Page-selection tools use this to show their page grid, matching the
   * reference where the pages occupy the canvas and the sidebar holds options.
   */
  Workarea?: React.ComponentType<WorkareaProps>;
  /**
   * Optional readiness gate beyond the file count — e.g. rotate needs a
   * queued rotation, protect needs a password.
   */
  isReady?: (ctx: { files: WorkFile[]; values: FieldValues }) => boolean;
  /** Produce the output files. Throw an Error with a user-facing message. */
  run: (ctx: RunContext & { values: FieldValues }) => Promise<ResultFile[]>;
}

export interface PanelProps {
  files: WorkFile[];
  values: FieldValues;
  setValue: (name: string, value: string | boolean | null) => void;
  /** Bump to re-evaluate readiness (e.g. after queueing a rotation). */
  requestUpdate: () => void;
}

/** Props for a tool's work-area content. */
export interface WorkareaProps {
  files: WorkFile[];
  values: FieldValues;
  setValue: (name: string, value: string | boolean | null) => void;
  requestUpdate: () => void;
}

/**
 * Per-page selection state, stored as a comma-separated list of one-based page
 * numbers in `FieldValues`. Kept as a string so it round-trips through the
 * same value bag as every other option.
 */
export const PAGE_SELECTION_KEY = 'pageSelection';
