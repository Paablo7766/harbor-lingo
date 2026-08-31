import { Copy, Minus, Square, X } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { close, minimize, toggleMaximize, useMaximized } from "@/lib/window";

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function WindowControlButtons({ t }: { t: (key: string) => string }) {
  const { settings } = useSettings();
  const maxed = useMaximized();
  if (!IS_TAURI || settings.useNativeTitleBar) return null;
  const base =
    "flex h-6 w-6 items-center justify-center rounded-md text-white/55 transition-all duration-150 hover:bg-white/10 hover:text-white active:scale-90";
  return (
    <div className="pointer-events-auto flex items-center gap-0.5">
      <button onClick={minimize} aria-label={t("chrome.minimize")} className={base}>
        <Minus size={13} strokeWidth={2} />
      </button>
      <button
        onClick={toggleMaximize}
        aria-label={maxed ? t("chrome.restore") : t("chrome.maximize")}
        className={base}
      >
        {maxed ? <Copy size={10} strokeWidth={2} /> : <Square size={10} strokeWidth={2} />}
      </button>
      <button
        onClick={close}
        data-harbor-window-close
        aria-label={t("common.close")}
        className={`${base} hover:bg-danger/90`}
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
