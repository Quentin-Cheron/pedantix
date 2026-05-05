"use client";

type Props = {
  guesses: number;
  found: number;
  total: number;
  finished: boolean;
};

export function StatsBar({ guesses, found, total, finished }: Props) {
  const pct = total > 0 ? Math.round((found / total) * 100) : 0;
  return (
    <div className="paper-deep rounded-none px-4 sm:px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 relative">
      <div
        className="absolute bottom-0 left-0 h-[2px] bg-[var(--oxblood)] transition-all duration-700"
        style={{ width: `${pct}%` }}
        aria-hidden
      />
      <Stat label="Essais" value={guesses} />
      <Stat label="Mots dévoilés" value={`${found} / ${total}`} />
      <Stat label="Progression" value={`${pct}%`} />
      <Stat
        label="Statut"
        value={finished ? "TROUVÉ" : "EN COURS"}
        accent={finished}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 leading-none">
      <span className="smallcaps text-[10px] text-[var(--ink-soft)]">
        {label}
      </span>
      <span
        className={`font-display text-xl sm:text-2xl tabular-nums ${
          accent ? "text-[var(--oxblood)] italic" : "text-[var(--ink)]"
        }`}
        style={{ fontVariationSettings: '"opsz" 144, "WONK" 1' }}
      >
        {value}
      </span>
    </div>
  );
}
