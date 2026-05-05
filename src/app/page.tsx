"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Header } from "@/components/game/Header";
import { StatsBar } from "@/components/game/StatsBar";
import { GuessHistory } from "@/components/game/GuessHistory";
import { MaskedToken } from "@/components/game/MaskedToken";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  applyGuess,
  buildTokens,
  isAutoRevealed,
  type GuessRecord,
  type Token,
} from "@/lib/game";
import { normalize } from "@/lib/normalize";
import {
  cosineSimilarity,
  embedWords,
  MIN_SEMANTIC_HINT,
  semanticLevel,
  type SemanticHintLevel,
} from "@/lib/semantic";
import { cn } from "@/lib/utils";

type WikiArticle = {
  pageid: number;
  title: string;
  extract: string;
  url: string;
};

type CoreState = {
  tokens: Token[];
  revealed: Set<string>;
  guesses: GuessRecord[];
  guessesByNorm: Map<string, number>;
  lastGuessNorm: string | null;
  lastGuessIndex: number | null;
};

type GameState = CoreState & {
  article: WikiArticle;
  finished: boolean;
  givenUp: boolean;
  startedAt: number;
};

type SimilarityHint = {
  score: number;
  level: SemanticHintLevel;
  guess: string;
};

type CandidateToken = {
  norm: string;
  vec: Float32Array;
};

const LS_CURRENT = "pedantix-current";
const LS_PREFIX = "pedantix-v1-";
const SEMANTIC_STOPWORDS = new Set([
  "a", "ai", "ainsi", "alors", "au", "aucun", "aussi", "autre", "aux",
  "avec", "avoir", "bien", "car", "ce", "cela", "ces", "cet", "cette",
  "chaque", "chez", "comme", "comment", "dans", "de", "des", "du", "donc",
  "dont", "elle", "elles", "en", "encore", "entre", "est", "et", "eux",
  "fait", "font", "il", "ils", "je", "la", "le", "les", "leur", "leurs",
  "lui", "ma", "mais", "me", "meme", "mes", "mon", "ne", "nos", "notre",
  "nous", "on", "ou", "par", "pas", "pour", "plus", "que", "qui", "quoi",
  "sa", "se", "ses", "si", "son", "sont", "sur", "ta", "te", "tes", "toi",
  "ton", "tous", "tout", "tres", "tu", "un", "une", "vos", "votre", "vous",
  "partie", "ensemble", "niveau", "genre", "type", "forme", "terme"
]);

function isSemanticHintCandidate(word: string): boolean {
  return word.length >= 4 && !SEMANTIC_STOPWORDS.has(word);
}

type SavedSession = {
  article: WikiArticle;
  guesses: string[];
  givenUp: boolean;
};

function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(LS_CURRENT);
    if (!raw) return null;
    return JSON.parse(raw) as SavedSession;
  } catch {
    return null;
  }
}

function saveSession(
  article: WikiArticle,
  guesses: GuessRecord[],
  givenUp: boolean,
) {
  try {
    const session: SavedSession = {
      article,
      guesses: guesses.map((g) => g.raw),
      givenUp,
    };
    localStorage.setItem(LS_CURRENT, JSON.stringify(session));
    // also keep per-article backup
    localStorage.setItem(
      `${LS_PREFIX}${article.pageid}`,
      JSON.stringify(guesses.map((g) => g.raw)),
    );
  } catch {}
}

function clearSession() {
  try {
    localStorage.removeItem(LS_CURRENT);
  } catch {}
}

function buildInitCore(tokens: Token[]): CoreState {
  const revealed = new Set<string>();
  for (const t of tokens) {
    if (isAutoRevealed(t)) revealed.add(t.norm);
  }
  return {
    tokens,
    revealed,
    guesses: [],
    guessesByNorm: new Map(),
    lastGuessNorm: null,
    lastGuessIndex: null,
  };
}

function replayGuesses(core: CoreState, saved: string[]): CoreState {
  let state = core;
  for (const raw of saved) {
    const norm = normalize(raw.trim());
    if (!norm) continue;
    const result = applyGuess(state, raw);
    state = result.state;
  }
  return state;
}

function checkTitleFound(state: GameState): boolean {
  return state.tokens
    .filter((t) => t.inTitle && t.isWord && t.norm)
    .every((t) => state.revealed.has(t.norm));
}

export default function GamePage() {
  const [article, setArticle] = useState<WikiArticle | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [input, setInput] = useState("");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [winOpen, setWinOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [sortMode, setSortMode] = useState<"recent" | "hits">("recent");
  const inputRef = useRef<HTMLInputElement>(null);
  const flashRef = useRef<Set<string>>(new Set());
  const tokenVectorsRef = useRef<Map<string, Float32Array>>(new Map());
  const guessVectorsRef = useRef<Map<string, Float32Array>>(new Map());
  const [semanticHintsByNorm, setSemanticHintsByNorm] = useState<
    Map<string, SimilarityHint>
  >(new Map());
  const [semanticReady, setSemanticReady] = useState(false);

  const loadArticle = useCallback(
    (data: WikiArticle, savedGuesses: string[], savedGivenUp = false) => {
      const tokens = buildTokens(data.title, data.extract);
      const core = buildInitCore(tokens);
      const restored =
        savedGuesses.length > 0 ? replayGuesses(core, savedGuesses) : core;

      const gs: GameState = {
        ...restored,
        article: data,
        finished: false,
        givenUp: savedGivenUp,
        startedAt: Date.now(),
      };
      if (savedGivenUp) {
        const allRevealed = new Set(gs.revealed);
        for (const t of gs.tokens) if (t.isWord) allRevealed.add(t.norm);
        gs.revealed = allRevealed;
        gs.finished = true;
      } else {
        gs.finished = checkTitleFound(gs);
      }

      setArticle(data);
      setGameState(gs);
      saveSession(data, gs.guesses, gs.givenUp);
      setRound((n) => n + 1);
      flashRef.current.clear();

      if (gs.finished) setWinOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [],
  );

  const { mutate: requestArticle, isPending: isArticlePending } = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/article", { cache: "no-store" });
      if (!r.ok) throw new Error("Échec du chargement de l'article");
      return (await r.json()) as WikiArticle;
    },
    onSuccess: (data) => {
      setError(null);
      loadArticle(data, [], false);
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    },
    onSettled: () => {
      setIsBootstrapping(false);
    },
  });

  const loading = isBootstrapping || isArticlePending;

  const fetchNew = useCallback(() => {
    setError(null);
    setInput("");
    setWinOpen(false);
    setHoverIndex(null);
    clearSession();
    requestArticle();
  }, [requestArticle]);

  // On first mount: restore saved session or fetch a new article
  useEffect(() => {
    const session = loadSession();
    if (session) {
      loadArticle(session.article, session.guesses, session.givenUp ?? false);
      setIsBootstrapping(false);
    } else {
      requestArticle();
    }
  }, [loadArticle, requestArticle]);

  useEffect(() => {
    let active = true;
    tokenVectorsRef.current = new Map();
    guessVectorsRef.current = new Map();
    setSemanticHintsByNorm(new Map());
    setSemanticReady(false);

    if (!gameState) return () => void 0;

    const words = [...new Set(
      gameState.tokens
        .filter((t) => t.isWord && isSemanticHintCandidate(t.norm))
        .map((t) => t.norm)
    )];

    void (async () => {
      try {
        const vectors = await embedWords(words);
        if (!active) return;
        tokenVectorsRef.current = vectors;
        setSemanticReady(true);
      } catch {
        if (!active) return;
        setSemanticReady(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [gameState?.article.pageid]);

  useEffect(() => {
    if (!gameState || !semanticReady || gameState.guesses.length === 0) {
      setSemanticHintsByNorm(new Map());
      return;
    }

    let active = true;
    const guesses = gameState.guesses
      .map((g) => ({ raw: g.raw, norm: g.norm }))
      .filter((g) => isSemanticHintCandidate(g.norm));
    if (guesses.length === 0) {
      setSemanticHintsByNorm(new Map());
      return;
    }

    void (async () => {
      try {
        const missingNorms = guesses
          .map((g) => g.norm)
          .filter((norm) => !guessVectorsRef.current.has(norm));

        if (missingNorms.length > 0) {
          const missingVectors = await embedWords(missingNorms);
          if (!active) return;
          for (const [norm, vec] of missingVectors) {
            guessVectorsRef.current.set(norm, vec);
          }
        }

        const hints = new Map<string, SimilarityHint>();
        const candidates: CandidateToken[] = [];
        const seen = new Set<string>();
        const guessVecs = guesses
          .map((g) => ({ ...g, vec: guessVectorsRef.current.get(g.norm) }))
          .filter((g): g is { raw: string; norm: string; vec: Float32Array } => Boolean(g.vec));

        for (const token of gameState.tokens) {
          if (!token.isWord || !token.norm) continue;
          if (!isSemanticHintCandidate(token.norm)) continue;
          if (gameState.revealed.has(token.norm)) continue;
          if (seen.has(token.norm)) continue;
          seen.add(token.norm);

          const vec = tokenVectorsRef.current.get(token.norm);
          if (!vec) continue;
          candidates.push({ norm: token.norm, vec });
        }

        const tokenBestGuess = new Map<
          string,
          { guessNorm: string; bestScore: number; margin: number }
        >();
        for (const token of candidates) {
          let bestScore = -1;
          let secondScore = -1;
          let bestGuessNorm = "";

          for (const guess of guessVecs) {
            const score = cosineSimilarity(token.vec, guess.vec);
            if (score > bestScore) {
              secondScore = bestScore;
              bestScore = score;
              bestGuessNorm = guess.norm;
            } else if (score > secondScore) {
              secondScore = score;
            }
          }

          const margin = bestScore - Math.max(0, secondScore);
          if (bestGuessNorm && bestScore >= MIN_SEMANTIC_HINT && margin >= 0.04) {
            tokenBestGuess.set(token.norm, { guessNorm: bestGuessNorm, bestScore, margin });
          }
        }

        for (const guess of guessVecs) {
          const guessVec = guess.vec;

          const scored = candidates
            .map((token) => ({
              norm: token.norm,
              score: cosineSimilarity(token.vec, guessVec),
            }))
            .sort((a, b) => b.score - a.score);

          if (scored.length === 0) continue;

          const top1 = scored[0].score;
          const top5 = scored[Math.min(4, scored.length - 1)].score;
          const sharpEnough = top1 - top5 >= 0.035;
          if (top1 < MIN_SEMANTIC_HINT || !sharpEnough) continue;

          const localFloor = Math.max(MIN_SEMANTIC_HINT, top1 - 0.045);
          const selected = scored
            .filter((item) => item.score >= localFloor)
            .slice(0, 2);

          for (const item of selected) {
            const best = tokenBestGuess.get(item.norm);
            if (!best || best.guessNorm !== guess.norm) continue;
            const prev = hints.get(item.norm);
            if (!prev || item.score > prev.score) {
              hints.set(item.norm, {
                score: best.bestScore,
                level: semanticLevel(best.bestScore),
                guess: guess.raw,
              });
            }
          }
        }

        if (active) setSemanticHintsByNorm(hints);
      } catch {
        if (active) setSemanticHintsByNorm(new Map());
      }
    })();

    return () => {
      active = false;
    };
  }, [gameState, semanticReady]);

  const allWordTokens = useMemo(
    () => gameState?.tokens.filter((t) => t.isWord && t.norm.length > 0) ?? [],
    [gameState],
  );
  const uniqueWords = useMemo(() => {
    const s = new Set<string>();
    for (const t of allWordTokens) s.add(t.norm);
    return s;
  }, [allWordTokens]);

  const foundCount = useMemo(() => {
    if (!gameState) return 0;
    let n = 0;
    for (const w of uniqueWords) if (gameState.revealed.has(w)) n++;
    return n;
  }, [gameState, uniqueWords]);

  const submitGuess = useCallback(
    (raw: string) => {
      if (!gameState || !article || gameState.finished) return;
      const trimmed = raw.trim();
      if (!trimmed) return;
      const norm = normalize(trimmed);
      if (!norm) {
        toast.error("Mot invalide");
        return;
      }
      if (gameState.guessesByNorm.has(norm)) {
        const idx = gameState.guessesByNorm.get(norm)!;
        setHoverIndex(idx);
        toast.info("Déjà proposé.");
        return;
      }

      const result = applyGuess(gameState, raw);
      flashRef.current = result.flash;

      const newGs: GameState = {
        ...result.state,
        article,
        finished: gameState.finished,
        givenUp: gameState.givenUp,
        startedAt: gameState.startedAt,
      };
      newGs.finished = checkTitleFound(newGs);

      setGameState(newGs);
      saveSession(article, newGs.guesses, newGs.givenUp);
      setInput("");
      requestAnimationFrame(() => inputRef.current?.focus());

      if (newGs.finished && !gameState.finished) {
        setWinOpen(true);
        toast.success("Bravo ! Le titre est dévoilé.", { duration: 4000 });
        return;
      }

      if (result.hits === 0) {
        toast.error(`« ${trimmed} » introuvable`, { duration: 1500 });
      } else {
        const word = result.hits === 1 ? "occurrence" : "occurrences";
        toast.success(`+${result.hits} ${word}`, { duration: 1200 });
      }
    },
    [gameState, article],
  );

  const giveUp = useCallback(() => {
    if (!gameState || !article || gameState.finished) return;
    const newRevealed = new Set(gameState.revealed);
    for (const t of gameState.tokens) if (t.isWord) newRevealed.add(t.norm);
    const updated: GameState = {
      ...gameState,
      revealed: newRevealed,
      finished: true,
      givenUp: true,
    };
    setGameState(updated);
    saveSession(article, updated.guesses, updated.givenUp);
    toast(`Article : « ${article.title} »`, { duration: 5000 });
  }, [gameState, article]);

  const activeGuessNorm =
    hoverIndex !== null && gameState
      ? (gameState.guesses[hoverIndex]?.norm ?? null)
      : (gameState?.lastGuessNorm ?? null);

  const todayLabel = useMemo(() => {
    const d = new Date();
    return d
      .toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
      .replace(/^./, (c) => c.toUpperCase());
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <Header
        onNew={fetchNew}
        onGiveUp={giveUp}
        loading={loading}
        finished={gameState?.finished ?? false}
        articleNumber={round}
      />

      <main className="flex-1 min-h-0 overflow-hidden mx-auto max-w-10xl w-full px-4 sm:px-8 py-4 sm:py-5 grid lg:grid-cols-[1fr_300px] gap-5 sm:gap-6">
        <section className="flex flex-col gap-4 min-w-0 min-h-0">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="rule-fancy w-full max-w-md">
              <span className="font-display italic text-sm text-[var(--ink-soft)]">
                Recueil encyclopédique
              </span>
            </div>
            <span className="smallcaps text-[10px] text-[var(--ink-soft)]">
              {todayLabel}
            </span>
          </div>

          <StatsBar
            guesses={gameState?.guesses.length ?? 0}
            found={foundCount}
            total={uniqueWords.size}
            finished={gameState?.finished ?? false}
          />

          <article className="paper relative flex-1 min-h-0 overflow-auto scrollbar-thin">
            <div className="px-6 sm:px-12 py-8 sm:py-10">
              {loading && !gameState && (
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="flex flex-col items-center gap-3 text-[var(--ink-soft)]">
                    <Loader2 className="size-5 animate-spin text-[var(--oxblood)]" />
                    <span className="smallcaps text-[10px]">
                      Sélection d&apos;un article…
                    </span>
                  </div>
                </div>
              )}
              {error && (
                <div className="text-[var(--destructive)] text-sm font-body italic">
                  {error}
                </div>
              )}
              {gameState && article && (
                <ArticleBody
                  state={gameState}
                  activeGuessNorm={activeGuessNorm}
                  flashWords={flashRef.current}
                  similarityHintsByNorm={semanticHintsByNorm}
                  articleNumber={round}
                  articleUrl={article.url}
                />
              )}
            </div>
          </article>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitGuess(input);
            }}
            className="paper rounded-none flex items-stretch shrink-0 shadow-lg"
          >
            <div className="flex items-center px-4 border-r border-dotted border-[var(--rule)] shrink-0">
              <span className="font-display italic text-2xl text-[var(--oxblood)]">
                ¶
              </span>
            </div>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                gameState?.finished
                  ? "Partie terminée — passe à un nouvel article"
                  : "Proposez un mot…"
              }
              disabled={!gameState || gameState.finished || loading}
              className={cn(
                "flex-1 bg-transparent border-0 focus-visible:ring-0 focus-visible:border-0 shadow-none rounded-none text-base h-14 font-body italic placeholder:text-[var(--ink-soft)] placeholder:italic",
              )}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="off"
            />
            <Button
              type="submit"
              size="lg"
              disabled={
                !gameState || gameState.finished || !input.trim() || loading
              }
              className="smallcaps text-[10px] rounded-none border-l border-[var(--rule)] bg-[var(--ink)] hover:bg-[var(--oxblood)] text-[var(--paper)] h-14 px-6"
            >
              Inscrire
            </Button>
          </form>
        </section>

        <aside className="paper-deep rounded-none p-3 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <GuessHistory
            guesses={gameState?.guesses ?? []}
            activeIndex={hoverIndex ?? gameState?.lastGuessIndex ?? null}
            onHover={setHoverIndex}
            sortMode={sortMode}
            onSortChange={setSortMode}
          />
        </aside>
      </main>

      <Dialog open={winOpen} onOpenChange={setWinOpen}>
        <DialogContent className="paper rounded-none !max-w-fit">
          <DialogHeader>
            <div className="flex items-center justify-between mt-3">
              <span className="seal">
                {gameState?.givenUp ? "Abandon" : "Article découvert"}
              </span>
              <span className="font-mono text-[10px] text-[var(--ink-soft)]">
                №&nbsp;{round}
              </span>
            </div>
            <DialogTitle className="font-display italic text-2xl sm:text-3xl pt-2 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
              {article?.title}
            </DialogTitle>
            <DialogDescription className="font-body text-sm text-[var(--ink-soft)]">
              {gameState?.givenUp
                ? "Dommage — essaie le prochain !"
                : `Deviné en ${gameState?.guesses.length ?? 0} proposition${(gameState?.guesses.length ?? 0) > 1 ? "s" : ""}.`}
            </DialogDescription>
            {article && (
              <a
                href={article.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 smallcaps text-[10px] text-[var(--oxblood)] hover:underline w-fit pt-1"
              >
                Lire sur Wikipédia
                <ExternalLink className="size-3" />
              </a>
            )}
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2 pt-3 border-t border-dotted border-[var(--rule)]">
            <Button
              variant="ghost"
              onClick={() => setWinOpen(false)}
              className="smallcaps text-[10px] rounded-none hover:bg-[var(--ink)]/5"
            >
              Voir l&apos;article révélé
            </Button>
            <Button
              onClick={fetchNew}
              disabled={loading}
              className="smallcaps text-[10px] rounded-none bg-[var(--ink)] hover:bg-[var(--oxblood)] text-[var(--paper)]"
            >
              {loading ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : null}
              Article suivant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="border-t border-[var(--rule)] mt-auto">
        <div className="mx-auto max-w-6xl px-4 sm:px-8 py-5 flex items-center justify-between gap-3 flex-wrap">
          <span className="font-display italic text-sm text-[var(--ink-soft)]">
            «&nbsp;Tout est dans tout, et réciproquement.&nbsp;»
          </span>
          <span className="smallcaps text-[10px] text-[var(--ink-soft)]">
            Articles ·{" "}
            <a
              href="https://fr.wikipedia.org"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--oxblood)] underline-offset-4 hover:underline"
            >
              Wikipédia FR
            </a>{" "}
            · CC BY-SA · Inspiré de Pédantix
          </span>
        </div>
      </footer>
    </div>
  );
}

function ArticleBody({
  state,
  activeGuessNorm,
  flashWords,
  similarityHintsByNorm,
  articleNumber,
  articleUrl,
}: {
  state: GameState;
  activeGuessNorm: string | null;
  flashWords: Set<string>;
  similarityHintsByNorm: Map<string, SimilarityHint>;
  articleNumber: number;
  articleUrl: string;
}) {
  const titleNodes: React.ReactNode[] = [];
  const bodyNodes: React.ReactNode[] = [];

  state.tokens.forEach((t, i) => {
    const revealed = !t.isWord || state.revealed.has(t.norm);
    const highlight =
      t.isWord && activeGuessNorm !== null && t.norm === activeGuessNorm;
    const flash = t.isWord && flashWords.has(t.norm);
    const node = (
      <MaskedToken
        key={i}
        raw={t.raw}
        revealed={revealed}
        isWord={t.isWord}
        highlight={highlight}
        isTitle={t.inTitle}
        flash={flash}
        similarityHint={!revealed ? similarityHintsByNorm.get(t.norm) : undefined}
      />
    );
    if (t.inTitle) {
      titleNodes.push(node);
    } else {
      bodyNodes.push(node);
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="smallcaps text-[10px] text-[var(--ink-soft)]">
          Article № {String(articleNumber).padStart(3, "0")}
        </span>
        <span className="font-mono text-[10px] text-[var(--ink-soft)]">
          ENCYCLOPÆDIA · ABRÉGÉ
        </span>
      </div>
      <h2 className="font-display text-3xl sm:text-5xl leading-[1.3] tracking-tight truncate max-w-full [word-spacing:0.15em]">
        {titleNodes}
      </h2>
      <div className="rule-fancy">
        <span className="font-display italic text-base">§</span>
      </div>
      <div className="font-body text-[17px] sm:text-[18px] leading-[2.1] text-[var(--ink)] [text-align:justify] [hyphens:auto] [word-spacing:0.18em]">
        {bodyNodes}
      </div>
      {state.finished && (
        <div className="pt-4 border-t border-dotted border-[var(--rule)] flex items-center justify-between">
          <a
            href={articleUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 smallcaps text-[10px] text-[var(--oxblood)] hover:underline"
          >
            Lire l&apos;article complet sur Wikipédia
            <ExternalLink className="size-3" />
          </a>
          {state.givenUp && (
            <span className="font-display italic text-xs text-[var(--ink-soft)]">
              — abandon —
            </span>
          )}
        </div>
      )}
    </div>
  );
}
