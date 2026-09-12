import { useEffect, useState } from "react";

export function PwaRuntime() {
  const [offline, setOffline] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => {
          if (registration.waiting) {
            setWaitingWorker(registration.waiting);
            setUpdateReady(true);
          }
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                setWaitingWorker(registration.waiting ?? worker);
                setUpdateReady(true);
              }
            });
          });
        })
        .catch(() => {
          // PWA é opcional; a aplicação continua funcionando normalmente.
        });
    }

    const onControllerChange = () => {
      setWaitingWorker(null);
      setUpdateReady(false);
    };
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!offline && !updateReady) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm text-card-foreground shadow-lg">
        <span>
          {offline
            ? "Você está offline. Alterações só serão confirmadas após reconectar."
            : "Nova versão disponível."}
        </span>
        {updateReady ? (
          <button
            type="button"
            className="shrink-0 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground"
            onClick={() => {
              setUpdateReady(false);
              waitingWorker?.postMessage({ type: "SKIP_WAITING" });
              const reload = () => window.location.reload();
              navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
              window.setTimeout(reload, 1500);
            }}
          >
            Atualizar agora
          </button>
        ) : null}
      </div>
    </div>
  );
}
