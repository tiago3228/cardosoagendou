import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "agendou:install-prompt-dismissed";

export type InstallPlatform = "android" | "ios" | "desktop";

export function detectPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function manualInstallHint(platform: InstallPlatform): string {
  if (platform === "ios")
    return 'No Safari, toque no botão Compartilhar e escolha "Adicionar à Tela de Início".';
  if (platform === "android")
    return 'No menu do navegador (⋮), toque em "Instalar aplicativo" ou "Adicionar à tela inicial".';
  return 'No navegador, abra o menu (⋮) e escolha "Instalar Agendou Pro" ou clique no ícone de instalar na barra de endereço.';
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function useInstallApp() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const platform = typeof window === "undefined" ? "desktop" : detectPlatform();

  useEffect(() => {
    setInstalled(isStandalone());
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /** Triggers the native install flow. Returns the outcome for UI feedback. */
  const install = useCallback(async (): Promise<"accepted" | "dismissed" | "unsupported"> => {
    if (!promptEvent) return "unsupported";
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") setPromptEvent(null);
    return outcome;
  }, [promptEvent]);

  return {
    platform,
    installed,
    canInstall: promptEvent !== null,
    install,
    manualHint: manualInstallHint(platform),
  };
}

export function installPromptDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return true;
  }
}

export function dismissInstallPrompt() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}
