/**
 * "Install app" support.
 *
 * Browsers fire `beforeinstallprompt` when a site qualifies as installable and
 * the visitor has not already installed it. We capture that event, hold it, and
 * replay it from a header button — the standard way to offer an in-app install
 * affordance instead of relying on the browser's own menu.
 *
 * iOS Safari never fires the event, so there we surface a short hint telling the
 * visitor to use Share → Add to Home Screen.
 */
import { useCallback, useEffect, useState } from 'react';

/** The non-standard event Chrome/Edge dispatch. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    /* iOS Safari exposes its own flag. */
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

export function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      /* Prevent the default mini-infobar; we present our own control. */
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (installed) return;
    if (!event) {
      /* No prompt available: on iOS this is expected, elsewhere the browser
         already decided the app is not installable. */
      if (isIos()) setIosHint(true);
      return;
    }
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    /* A prompt can only be used once. */
    setEvent(null);
  }, [event, installed]);

  /* Show the control when an install is genuinely possible, or on iOS where the
     hint is the only route. */
  const available = !installed && (event !== null || isIos());

  return { available, installed, install, iosHint, dismissIosHint: () => setIosHint(false) };
}
