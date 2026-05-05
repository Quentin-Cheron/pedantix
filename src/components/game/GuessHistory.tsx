"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { GuessRecord } from "@/lib/game";

type Props = {
  guesses: GuessRecord[];
  activeIndex: number | null;
  onHover: (index: number | null) => void;
  sortMode: "recent" | "hits";
  onSortChange: (m: "recent" | "hits") => void;
};

export function GuessHistory({
  guesses,
  activeIndex,
  onHover,
  sortMode,
  onSortChange,
}: Props) {
  const list = [...guesses];
  if (sortMode === "hits") {
    list.sort((a, b) => b.hits - a.hits || a.index - b.index);
  } else {
    list.sort((a, b) => b.index - a.index);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="smallcaps text-[10px] text-[var(--ink-soft)]">
          Index des propositions
        </span>
        <div className="flex gap-1 text-[10px] smallcaps">
          <button
            onClick={() => onSortChange("recent")}
            className={cn(
              "px-1.5 py-0.5 transition-colors",
              sortMode === "recent"
                ? "text-[var(--ink)] underline underline-offset-4 decoration-[var(--oxblood)] decoration-2"
                : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
            )}
          >
            Récent
          </button>
          <button
            onClick={() => onSortChange("hits")}
            className={cn(
              "px-1.5 py-0.5 transition-colors",
              sortMode === "hits"
                ? "text-[var(--ink)] underline underline-offset-4 decoration-[var(--oxblood)] decoration-2"
                : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
            )}
          >
            Score
          </button>
        </div>
      </div>
      {guesses.length === 0 ? (
        <div className="text-sm text-[var(--ink-soft)] italic px-3 py-12 text-center font-body">
          <span className="font-display text-3xl text-[var(--oxblood)]">¶</span>
          <p className="mt-2">Aucune proposition.</p>
          <p className="text-xs mt-1 opacity-70">
            Tente « France », « siècle », « guerre »…
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0 pr-1 scrollbar-thin">
          <ul className="flex flex-col">
            {list.map((g) => {
              const active = activeIndex === g.index;
              const found = g.hits > 0;
              return (
                <li
                  key={g.index}
                  onMouseEnter={() => onHover(g.index)}
                  onMouseLeave={() => onHover(null)}
                  className={cn(
                    "group flex items-baseline justify-between px-2 py-1 cursor-default border-b border-dotted border-[var(--rule)] last:border-0 transition-colors",
                    active && "bg-[var(--accent)]"
                  )}
                >
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span
                      className={cn(
                        "font-mono text-[10px] w-6 shrink-0 text-right",
                        active
                          ? "text-[var(--oxblood)]"
                          : "text-[var(--ink-soft)]"
                      )}
                    >
                      {String(g.index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "font-body truncate text-[15px]",
                        found
                          ? "text-[var(--ink)] italic"
                          : "text-[var(--ink-soft)] line-through decoration-1 opacity-70"
                      )}
                    >
                      {g.raw}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums shrink-0 ml-2",
                      found ? "text-[var(--oxblood)] font-bold" : "text-[var(--ink-soft)]"
                    )}
                  >
                    {found ? `×${g.hits}` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}
