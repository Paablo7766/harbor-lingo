import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { StartupSplash } from "@/components/startup-loader";
import { isLinuxDesktop, isMacDesktop, isWindowsDesktop } from "@/lib/platform";
import { ModalOverlayApp } from "@/views/modal-overlay-app";
import { HdrOverlayApp } from "@/views/hdr-overlay-app";
import { PipApp } from "@/views/pip";
import { RemoteApp } from "@/views/remote-app";
import "@/index.css";

const MIN_SPLASH_MS = 600;
const MAX_SPLASH_MS = 4000;
const FADE_MS = 300;

function detectRemoteMode(): boolean {
  try {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (path === "/remote" || path.endsWith("/remote")) return true;
    if (new URLSearchParams(window.location.search).get("remote") === "1") return true;
  } catch {}
  return false;
}

function detectPipMode(): boolean {
  if (new URLSearchParams(window.location.search).get("pip") === "1") return true;
  try {
    const w = getCurrentWindow();
    if (w.label === "harbor-pip") return true;
  } catch {}
  return false;
}

function detectModalOverlay(): boolean {
  if (new URLSearchParams(window.location.search).get("harbor-modal") === "1") return true;
  try {
    const w = getCurrentWindow();
    if (w.label === "harbor-modal-overlay") return true;
  } catch {}
  return false;
}

function detectHdrOverlay(): boolean {
  if (new URLSearchParams(window.location.search).get("harbor-overlay") === "1") return true;
  try {
    const w = getCurrentWindow();
    if (w.label === "harbor-hdr-overlay") return true;
  } catch {}
  return false;
}

const isPip = detectPipMode();
const isModal = detectModalOverlay();
const isHdrOverlay = detectHdrOverlay();
const isRemote = detectRemoteMode();
if (isModal || isHdrOverlay) {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  document.body.style.backgroundColor = "transparent";
  const root = document.getElementById("root");
  if (root) {
    root.style.background = "transparent";
    root.style.backgroundColor = "transparent";
  }
}
if (isRemote) {
  document.documentElement.style.overflow = "auto";
  document.body.style.overflow = "auto";
  document.body.style.userSelect = "auto";
  document.body.style.cursor = "auto";
}
if (!isPip && !isModal && !isHdrOverlay) {
  document.documentElement.dataset.os = isLinuxDesktop()
    ? "linux"
    : isMacDesktop()
      ? "macos"
      : isWindowsDesktop()
        ? "windows"
        : "web";
}
if (import.meta.env.DEV)
  console.log(
    "[harbor] entry: pip =",
    isPip,
    "modal =",
    isModal,
    "hdr =",
    isHdrOverlay,
    "remote =",
    isRemote,
    "label =",
    (() => {
      try {
        return getCurrentWindow().label;
      } catch {
        return "?";
      }
    })(),
  );
if (import.meta.env.DEV && !isPip && !isModal && !isHdrOverlay && !isRemote) {
  void import("./lib/streams/__fixtures__/verify").then((m) => m.logVerificationReport());
}

function MainRoot() {
  const [showSplash, setShowSplash] = useState(true);
  const [prefetchDone, setPrefetchDone] = useState(false);
  const mountTimeRef = useRef(Date.now());
  const closedRef = useRef(false);
  const minTimerRef = useRef<number | null>(null);

  const markPrefetchDone = useCallback(() => {
    console.log("[harbor:splash] prefetchDone", new Date().toISOString());
    setPrefetchDone(true);
  }, []);

  const closeSplash = useCallback((reason: string) => {
    if (closedRef.current) return;
    closedRef.current = true;
    console.log("[harbor:splash] showSplash=false", new Date().toISOString(), reason);
    setShowSplash(false);
    if ("__TAURI_INTERNALS__" in window) {
      window.setTimeout(() => {
        void import("@tauri-apps/api/core").then(({ invoke }) =>
          invoke("harbor_startup_ready").catch(() => {}),
        );
      }, FADE_MS);
    }
  }, []);

  const tryCloseSplash = useCallback(() => {
    if (closedRef.current || !prefetchDone) return;
    const elapsed = Date.now() - mountTimeRef.current;
    if (elapsed < MIN_SPLASH_MS) {
      if (minTimerRef.current != null) window.clearTimeout(minTimerRef.current);
      minTimerRef.current = window.setTimeout(() => tryCloseSplash(), MIN_SPLASH_MS - elapsed);
      return;
    }
    closeSplash("prefetch-complete-and-min-elapsed");
  }, [closeSplash, prefetchDone]);

  useEffect(() => {
    tryCloseSplash();
  }, [tryCloseSplash]);

  useEffect(() => {
    const maxTimer = window.setTimeout(() => {
      if (closedRef.current) return;
      console.warn("[harbor:splash] max-timeout-4s forcing prefetchDone + close");
      setPrefetchDone(true);
      closeSplash("max-timeout-4s");
    }, MAX_SPLASH_MS);
    return () => {
      window.clearTimeout(maxTimer);
      if (minTimerRef.current != null) window.clearTimeout(minTimerRef.current);
    };
  }, [closeSplash]);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div
        className="h-full w-full"
        style={{
          opacity: showSplash ? 0 : 1,
          transition: `opacity ${FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        }}
        aria-hidden={showSplash}
      >
        <App onReady={markPrefetchDone} />
      </div>
      <div
        className="absolute inset-0 z-10"
        style={{
          opacity: showSplash ? 1 : 0,
          transition: `opacity ${FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          pointerEvents: showSplash ? "auto" : "none",
        }}
        aria-hidden={!showSplash}
      >
        <StartupSplash />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isHdrOverlay ? (
      <HdrOverlayApp />
    ) : isModal ? (
      <ModalOverlayApp />
    ) : isPip ? (
      <PipApp />
    ) : isRemote ? (
      <RemoteApp />
    ) : (
      <MainRoot />
    )}
  </StrictMode>,
);
