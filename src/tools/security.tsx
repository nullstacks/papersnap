/**
 * PDF security tools: unlock, protect and repair.
 *
 * All three are structural rewrites done by pdf-lib in the tab — unlocking
 * strips the /Encrypt dictionary, protecting adds an AES-256 one, and repair
 * re-serialises every object into a fresh document.
 */
import { useState } from 'react';
import {
  PDFDocument,
  baseName,
  bytesFor,
  loadToolPdf,
  loadPdfStrict,
  pdfResult,
  rebuildWithoutEncryption,
} from '@/lib/pdf';
import type { FieldValues, PanelProps, ResultFile, ToolImpl } from '@/types';

/* ------------------------------------------------------------------ helpers */

/** Panel values arrive untyped; read them defensively and fall back. */
function text(values: FieldValues, name: string, fallback = ''): string {
  const v = values[name];
  return typeof v === 'string' ? v : fallback;
}

function flag(values: FieldValues, name: string, fallback: boolean): boolean {
  const v = values[name];
  return typeof v === 'boolean' ? v : fallback;
}

/* ------------------------------------------------------------------ controls */

function PasswordField({
  id,
  placeholder,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  placeholder: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flex">
      <input
        id={id}
        type={revealed ? 'text' : 'password'}
        className="h-10 flex-1 rounded-l border border-r-0 border-muted px-3 text-sm"
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="flex h-10 w-11 items-center justify-center rounded-r bg-brand text-white hover:bg-brand-dark"
        onClick={() => setRevealed((on) => !on)}
        aria-label={revealed ? 'Hide password' : 'Show password'}
        title={revealed ? 'Hide password' : 'Show password'}
      >
        <svg width="18" height="18" viewBox="0 0 22 19" fill="currentColor" aria-hidden="true">
          <path d="M11 4c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92A11.82 11.82 0 0 0 21.99 9c-1.73-4.4-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C9.74 4.13 10.35 4 11 4zM1 1.27L3.74 4A11.8 11.8 0 0 0 0 9c1.73 4.4 6 7.5 11 7.5a11.78 11.78 0 0 0 4.38-.84l.42.42L18.73 19 20 17.73 2.27 0 1 1.27z" />
        </svg>
      </button>
    </div>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer text-[15px] text-ink-2">
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={
          checked
            ? 'h-6 w-6 shrink-0 rounded border border-success bg-surface'
            : 'h-6 w-6 shrink-0 rounded border border-muted bg-surface'
        }
      >
        {checked ? (
          <svg
            viewBox="0 0 24 24"
            className="h-full w-full p-0.5 text-success-dark"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 12.5l5 5L20 6.5" />
          </svg>
        ) : null}
      </span>
      <span>{label}</span>
    </label>
  );
}

/* ============================ UNLOCK ============================ */

async function unlockedBytes(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  /*
   * Unlocking is a REBUILD, never a re-save.
   *
   * pdf-lib's `save()` re-emits the parsed trailer, so saving a document that
   * was opened with a password still writes the original /Encrypt dictionary
   * back out: the "unlocked" file was byte-identical in protection to the
   * input and any viewer still demanded the password. Copying the pages into a
   * fresh document drops /Encrypt along with every other inherited object.
   *
   * The strict load stays as the gate: with `ignoreEncryption` a WRONG
   * password loads happily and keeps its /Encrypt dictionary, so the rejection
   * would never surface. Here pdf-lib throws "Password incorrect" instead.
   */
  try {
    const doc = await loadPdfStrict(bytes, password || undefined);
    if (!doc.isEncrypted) {
      /* Not protected at all: hand back the original bytes untouched rather
       * than a re-serialised copy that could shift the layout. */
      return bytes;
    }
    /* Opened with the password: when the user password was empty pdf-lib can
     * decrypt, but the /Encrypt dict is still present in the parsed document.
     * Always rebuild so the output genuinely has no encryption dictionary. */
    return rebuildWithoutEncryption(bytes, password || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/password|encrypt|decrypt/i.test(message)) {
      throw new Error(
        password
          ? 'That password is not correct for this PDF.'
          : 'This PDF is password protected. Enter its password to unlock it.',
      );
    }
    /* An unrelated parse failure: fall back to the structural rebuild. */
    return rebuildWithoutEncryption(bytes, password || undefined);
  }
}

function UnlockPanel({ values, setValue }: PanelProps) {
  return (
    <>
      <div className="info-box">
        Removes password protection and permission restrictions. Files protected with a
        user password need that password once to open them here.
      </div>
      <div>
        <label className="option-title" htmlFor="unlock-pw">
          Password (only if required)
        </label>
        <PasswordField
          id="unlock-pw"
          placeholder="Leave empty if the file opens"
          autoComplete="off"
          value={text(values, 'unlock_pw')}
          onChange={(v) => setValue('unlock_pw', v)}
        />
      </div>
    </>
  );
}

export const unlockTool: ToolImpl = {
  Panel: UnlockPanel,

  run: async ({ files, values, setProgress, setStatus }) => {
    const password = text(values, 'unlock_pw').trim();
    const results: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setStatus(`Unlocking ${f.name}…`);
      const bytes = await bytesFor(f);
      const out = await unlockedBytes(bytes, password);
      results.push(pdfResult(out, `${baseName(f.name)}_unlocked.pdf`));
      setProgress(((i + 1) / files.length) * 100);
    }

    return results;
  },
};

/* ============================ PROTECT ============================ */

function ProtectPanel({ values, setValue }: PanelProps) {
  return (
    <>
      <div>
        <div className="option-title">Set a password to protect your PDF file</div>
        <div className="flex flex-col gap-2">
          <PasswordField
            id="protect-pw"
            placeholder="Type password"
            autoComplete="new-password"
            value={text(values, 'protect_pw')}
            onChange={(v) => setValue('protect_pw', v)}
          />
          <PasswordField
            id="protect-pw2"
            placeholder="Repeat password"
            autoComplete="new-password"
            value={text(values, 'protect_pw2')}
            onChange={(v) => setValue('protect_pw2', v)}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <div className="option-title">Permissions</div>
        <CheckRow
          label="Allow printing"
          checked={flag(values, 'protect_print', true)}
          onChange={(v) => setValue('protect_print', v)}
        />
        <CheckRow
          label="Allow copying text"
          checked={flag(values, 'protect_copy', true)}
          onChange={(v) => setValue('protect_copy', v)}
        />
      </div>
    </>
  );
}

export const protectTool: ToolImpl = {
  Panel: ProtectPanel,

  /* Protecting without a password would silently produce an unprotected file. */
  isReady: ({ values }) => text(values, 'protect_pw').trim().length > 0,

  run: async ({ files, values, setProgress, setStatus }) => {
    const pw = text(values, 'protect_pw');
    const pw2 = text(values, 'protect_pw2');
    if (!pw) throw new Error('Enter a password to protect the document with.');
    if (pw !== pw2) throw new Error('The two passwords do not match.');

    const allowPrint = flag(values, 'protect_print', true);
    const allowCopy = flag(values, 'protect_copy', true);
    const results: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setStatus(`Encrypting ${f.name}…`);
      const doc = await loadToolPdf(await bytesFor(f), f.name);
      doc.encrypt({
        algorithm: 'AES-256',
        userPassword: pw,
        /* A distinct owner password keeps the permission bits enforceable.
           The suffix is only a salt, so it stays stable across rebrands. */
        ownerPassword: `${pw}#${f.name || 'document'}`,
        permissions: {
          printing: allowPrint ? 'highResolution' : undefined,
          copying: allowCopy,
          modifying: false,
          annotating: false,
          fillingForms: false,
          contentAccessibility: allowCopy,
          documentAssembly: false,
        },
      });
      const out = await doc.save();
      results.push(pdfResult(out, `${baseName(f.name)}_protected.pdf`));
      setProgress(((i + 1) / files.length) * 100);
    }

    return results;
  },
};

/* ============================ REPAIR ============================ */

function RepairPanel() {
  return (
    <div className="info-box">
      Rebuilds the cross-reference table and drops broken objects. Useful for files
      that will not open or render partially.
    </div>
  );
}

export const repairTool: ToolImpl = {
  Panel: RepairPanel,

  run: async ({ files, setProgress, setStatus }) => {
    const results: ResultFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setStatus(`Rebuilding ${f.name}…`);
      const src = await loadToolPdf(await bytesFor(f), f.name);
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const page of pages) out.addPage(page);
      /* Object streams hide the xref table from naive parsers, which is the
       * opposite of what a repair is for. */
      const saved = await out.save({ useObjectStreams: false });
      results.push(pdfResult(saved, `${baseName(f.name)}_repaired.pdf`));
      setProgress(((i + 1) / files.length) * 100);
    }

    return results;
  },
};
