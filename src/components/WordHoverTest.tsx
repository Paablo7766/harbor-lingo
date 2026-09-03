import { useState } from "react";
import { lookupWord } from "@/lib/subtitles/dictionary";

const EXAMPLE_SENTENCE = "Hello my friend, don't give up watching this movie";

export function WordHoverTest() {
  const words = EXAMPLE_SENTENCE.split(/\s+/);
  const [tooltip, setTooltip] = useState<{ word: string; translation: string } | null>(null);

  const handleMouseEnter = (word: string, index: number) => {
    let translation: string | null = null;

    if (index < words.length - 1) {
      translation = lookupWord(`${word} ${words[index + 1]}`);
    }

    if (!translation) {
      translation = lookupWord(word);
    }

    if (translation) {
      setTooltip({ word, translation });
    } else {
      setTooltip(null);
    }
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  return (
    <div className="rounded-2xl border border-edge-soft/60 bg-surface/50 p-8">
      <p className="mb-4 text-sm text-ink-muted">Prueba de traducción al pasar el ratón:</p>
      <p className="text-lg leading-relaxed text-ink">
        {words.map((word, index) => (
          <span key={`${word}-${index}`} className="relative inline">
            <span
              className="cursor-default hover:underline"
              onMouseEnter={() => handleMouseEnter(word, index)}
              onMouseLeave={handleMouseLeave}
            >
              {word}
            </span>
            {tooltip?.word === word && (
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
            {index < words.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
    </div>
  );
}
