"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw, Eye } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  onNew: () => void;
  onGiveUp: () => void;
  loading: boolean;
  finished: boolean;
  articleNumber?: number;
};

export function Header({ onNew, onGiveUp, loading, finished, articleNumber }: Props) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-[oklch(0.955_0.018_85_/_0.85)] border-b border-[var(--rule)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex flex-col leading-none shrink-0">
            <span className="smallcaps text-[10px] text-[var(--ink-soft)]">
              Édition continue · MMXXVI
            </span>
            <h1 className="font-display italic text-2xl sm:text-3xl tracking-tight text-[var(--ink)]">
              Pédantix<span className="text-[var(--oxblood)]">·</span>Libre
            </h1>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <span className="seal">
              {articleNumber !== undefined ? `№ ${articleNumber}` : "№ —"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onGiveUp}
                  disabled={loading || finished}
                  className="smallcaps text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--ink)]/5 rounded-none text-[10px]"
                >
                  <Eye className="size-3.5 sm:mr-2" strokeWidth={1.5} />
                  <span className="hidden sm:inline">Abandonner</span>
                </Button>
              }
            />
            <TooltipContent>Révèle l&apos;article et termine la partie</TooltipContent>
          </Tooltip>
          <Button
            size="sm"
            onClick={onNew}
            disabled={loading}
            className="smallcaps text-[10px] rounded-none border border-[var(--ink)] bg-[var(--ink)] hover:bg-[var(--oxblood)] hover:border-[var(--oxblood)] text-[var(--paper)] transition-colors"
          >
            <RefreshCw
              className={`size-3.5 sm:mr-2 ${loading ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
            <span className="hidden sm:inline">Nouvel Article</span>
          </Button>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-8 pb-2 -mt-1">
        <div className="h-[3px] bg-[var(--ink)]" />
        <div className="h-[1px] bg-[var(--ink)] mt-[2px]" />
      </div>
    </header>
  );
}
