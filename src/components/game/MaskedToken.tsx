"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

type Props = {
  raw: string;
  revealed: boolean;
  isWord: boolean;
  highlight?: boolean;
  isTitle?: boolean;
  flash?: boolean;
  similarityHint?: {
    level: "red" | "orange" | "yellow" | "green";
    score: number;
    guess: string;
  };
};

export function MaskedToken({
  raw,
  revealed,
  isWord,
  highlight,
  isTitle,
  flash,
  similarityHint,
}: Props) {
  if (!isWord) {
    if (raw === "\n\n") return <span className="block h-3" />;
    if (raw.includes("\n"))
      return raw.split("\n").map((p, i, a) => (
        <span key={i}>
          {p}
          {i < a.length - 1 ? <br /> : null}
        </span>
      ));
    return <span>{raw}</span>;
  }

  if (revealed) {
    return (
      <span
        className={cn(
          "token-revealed",
          highlight && "token-just-guessed",
          flash && "token-revealed-new",
          isTitle && "font-display",
        )}
      >
        {raw}
      </span>
    );
  }

  const letterCount = raw.replace(/\s/g, "").length;
  const [showLetterCount, setShowLetterCount] = useState(false);
  const [hintPosition, setHintPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null)
        window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleClick = (event: MouseEvent<HTMLSpanElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHintPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 6,
    });
    setShowLetterCount(true);
    if (hideTimerRef.current !== null)
      window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      setShowLetterCount(false);
    }, 1200);
  };

  const hintGuessLabel = similarityHint ? similarityHint.guess : "";
  const maskWidthCh = Math.max(letterCount, hintGuessLabel.length);

  return (
    <span className="relative inline-block align-baseline">
      {showLetterCount && hintPosition && (
        <span
          className="pointer-events-none fixed -translate-x-1/2 -translate-y-full z-[70] text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-soft)] whitespace-nowrap"
          style={{ left: hintPosition.x, top: hintPosition.y }}
        >
          {letterCount} lettre{letterCount > 1 ? "s" : ""}
        </span>
      )}
      <span
        aria-hidden
        className={cn(
          "token-mask relative",
          similarityHint?.level === "green" && "!bg-emerald-600/85",
          similarityHint?.level === "yellow" && "!bg-yellow-500/85",
          similarityHint?.level === "orange" && "!bg-orange-500/85",
          similarityHint?.level === "red" && "!bg-rose-600/85",
        )}
        style={{
          display: similarityHint ? "inline-flex" : undefined,
          width: similarityHint ? `${maskWidthCh + 1}ch` : undefined,
          height: similarityHint ? "21.75px" : undefined,
          alignItems: similarityHint ? "center" : undefined,
          justifyContent: similarityHint ? "center" : undefined,
          verticalAlign: similarityHint ? "baseline" : undefined,
        }}
        onClick={handleClick}
        title={`${letterCount} lettres`}
      >
        {raw}
        {similarityHint && (
          <span
            className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] leading-none font-mono text-white/95 px-1 text-center whitespace-nowrap"
            title={`Mot proche : ${similarityHint.guess} (${Math.round(similarityHint.score * 100)}%)`}
          >
            {hintGuessLabel}
          </span>
        )}
      </span>
    </span>
  );
}
