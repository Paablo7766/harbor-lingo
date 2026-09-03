import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveKid } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { lookupWord } from "@/lib/subtitles/dictionary";

/** Extra bottom offset (px) when player chrome is visible — tune if subtitles still overlap controls. */
const CHROME_LIFT_PX = 80;

type Props = {
  text: string;
  startSec: number;
  scale?: number;
  liftForChrome?: boolean;
};

export const SubtitleOverlay = memo(function SubtitleOverlay({
  text,
  startSec,
  scale = 1,
  liftForChrome = false,
}: Props) {
  const { settings } = useSettings();
  const kid = useActiveKid();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [boxH, setBoxH] = useState(0);
  useEffect(() => {
    const measure = () => {
      const host = wrapRef.current?.offsetParent as HTMLElement | null;
      if (host && host.clientHeight > 0) setBoxH(host.clientHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text]);

  const responsive = useMemo(
    () => (boxH > 0 ? Math.max(0.3, Math.min(2.5, boxH / 1080)) : scale),
    [boxH, scale],
  );
  const baseFont = useMemo(
    () =>
      kid
        ? Math.max(54, clamp(settings.subFontSize, 16, 120))
        : clamp(settings.subFontSize, 16, 120),
    [kid, settings.subFontSize],
  );
  const fontSize = useMemo(() => Math.round(baseFont * responsive), [baseFont, responsive]);
  const marginY = useMemo(() => clamp(settings.subMarginY, 0, 100), [settings.subMarginY]);
  const fontColor = settings.subFontColor || "#FFFFFF";
  const align = settings.subAlignX || "center";
  const family = useMemo(() => fontFamilyFor(settings.subFontFamily), [settings.subFontFamily]);
  const style = kid ? "shadow" : (settings.subStyle ?? "shadow");
  const lines = useMemo(() => text.split("\n"), [text]);

  const justify =
    align === "left" ? "justify-start" : align === "right" ? "justify-end" : "justify-center";

  const borderSize = useMemo(
    () => Math.max(1, Math.round((clamp(settings.subBorderSize, 1, 6) || 2) * responsive)),
    [settings.subBorderSize, responsive],
  );
  const borderColor = settings.subBorderColor || "#000000";

  const textShadow = useMemo(() => {
    if (style === "outline") {
      return buildOutline(borderColor, borderSize);
    } else if (style === "shadow") {
      return "0 1px 2px rgba(0,0,0,0.95), 0 2px 6px rgba(0,0,0,0.85), 0 0 18px rgba(0,0,0,0.55)";
    }
    return undefined;
  }, [style, borderColor, borderSize]);

  const baseTextStyle: React.CSSProperties = useMemo(
    () => ({
      color: fontColor,
      fontFamily: family,
      fontWeight: kid || settings.subBold ? 700 : 400,
      fontSize: `${fontSize}px`,
      lineHeight: 1.2,
      letterSpacing: `${(-0.005 + (settings.subLineSpacing ?? 0) * 0.06).toFixed(3)}em`,
      whiteSpace: "pre-wrap",
      textAlign: align as "left" | "center" | "right",
      ...(textShadow ? { textShadow } : {}),
    }),
    [
      fontColor,
      family,
      kid,
      settings.subBold,
      fontSize,
      settings.subLineSpacing,
      align,
      textShadow,
    ],
  );

  const boxOpacity = useMemo(() => clamp(settings.subBoxOpacity, 0, 1), [settings.subBoxOpacity]);
  const boxRgb = useMemo(() => hexToRgb(settings.subBoxColor || "#000000"), [settings.subBoxColor]);
  const boxStyle: React.CSSProperties | undefined = useMemo(
    () =>
      style === "box"
        ? {
            backgroundColor: `rgba(${boxRgb.r}, ${boxRgb.g}, ${boxRgb.b}, ${boxOpacity})`,
            padding: `${Math.round(fontSize * 0.18)}px ${Math.round(fontSize * 0.5)}px`,
            borderRadius: `${Math.round(fontSize * 0.25)}px`,
            backdropFilter: "blur(2px)",
          }
        : undefined,
    [style, boxRgb, boxOpacity, fontSize],
  );

  const opacity = useMemo(() => clamp(settings.subOpacity ?? 1, 0.1, 1), [settings.subOpacity]);

  const [tooltip, setTooltip] = useState<{ id: string; translation: string } | null>(null);

  const handleWordMouseEnter = useCallback((words: string[], index: number, id: string) => {
    let translation: string | null = null;

    if (index < words.length - 1) {
      translation = lookupWord(`${words[index]} ${words[index + 1]}`);
    }

    if (!translation) {
      translation = lookupWord(words[index]);
    }

    if (translation) {
      setTooltip({ id, translation });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleWordMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (!text) return null;

  return (
    <div
      key={startSec}
      ref={wrapRef}
      className={`pointer-events-none absolute inset-x-0 z-10 flex ${justify} px-[6%]`}
      style={{
        bottom: `calc(${marginY}% + ${liftForChrome ? CHROME_LIFT_PX : 0}px)`,
        opacity,
        transition: "bottom 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms ease",
      }}
    >
      <div className="max-w-[80%]" style={boxStyle}>
        <div style={baseTextStyle}>
          {lines.map((line, i) => {
            if (!line.trim()) return <div key={i} />;
            const words = line.split(/\s+/);
            return (
              <div key={i}>
                {words.map((word, wordIndex) => {
                  const id = `${i}-${wordIndex}`;
                  return (
                    <span key={id} className="relative inline">
                      <span
                        className="pointer-events-auto"
                        onMouseEnter={() => handleWordMouseEnter(words, wordIndex, id)}
                        onMouseLeave={handleWordMouseLeave}
                      >
                        {word}
                      </span>
                      {tooltip?.id === id && (
                        <span
                          style={{
                            position: "absolute",
                            bottom: "100%",
                            left: "50%",
                            transform: "translateX(-50%)",
                            marginBottom: "4px",
                            padding: "4px 8px",
                            background: "#1a1a1a",
                            color: "#fff",
                            fontSize: "12px",
                            borderRadius: "4px",
                            whiteSpace: "nowrap",
                            zIndex: 10,
                          }}
                        >
                          {tooltip.translation}
                        </span>
                      )}
                      {wordIndex < words.length - 1 ? " " : ""}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

function fontFamilyFor(family: string | undefined): string {
  if (family?.startsWith("custom:")) {
    return `"harbor-font-${family.slice("custom:".length)}", "Inter", system-ui, sans-serif`;
  }
  switch (family) {
    case "system":
      return '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    case "serif":
      return '"Fraunces", Georgia, "Times New Roman", serif';
    case "rounded":
      return '"SF Pro Rounded", "Nunito", "Quicksand", system-ui, sans-serif';
    case "inter":
    default:
      return '"Inter", -apple-system, system-ui, sans-serif';
  }
}

function buildOutline(color: string, size: number): string {
  const offsets: [number, number][] = [];
  for (let dx = -size; dx <= size; dx++) {
    for (let dy = -size; dy <= size; dy++) {
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > size + 0.1 || r < 0.1) continue;
      offsets.push([dx, dy]);
    }
  }
  return offsets.map(([dx, dy]) => `${dx}px ${dy}px 0 ${color}`).join(", ");
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = (hex || "").replace(/^#/, "");
  if (m.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m.slice(0, 2), 16) || 0,
    g: parseInt(m.slice(2, 4), 16) || 0,
    b: parseInt(m.slice(4, 6), 16) || 0,
  };
}
