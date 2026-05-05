export type WikiArticle = {
  pageid: number;
  title: string;
  extract: string;
  url: string;
};

type WikiPage = {
  pageid: number;
  title: string;
  extract?: string;
  fullurl?: string;
};

const MIN_TITLE_WORDS = 3;
const MIN_TITLE_CHARS = 16;
const GENERIC_LIST_TITLE_RE = /^Liste\b|^Discographie\b|^Filmographie\b|^Catégorie\b/i;
const TOO_SPECIFIC_TITLE_RE =
  /\b(1[89]\d{2}|20\d{2})\b|aux Jeux olympiques|Jeux olympiques d[’']été|Jeux olympiques d[’']hiver|Championnat|Coupe du monde|Saison \d{4}/i;

export async function fetchRandomArticle(): Promise<WikiArticle> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      generator: "random",
      grnnamespace: "0",
      grnlimit: "8",
      prop: "extracts|info",
      exsentences: "30",
      explaintext: "true",
      inprop: "url",
      origin: "*",
    });
    const r = await fetch(`https://fr.wikipedia.org/w/api.php?${params}`, {
      cache: "no-store",
      headers: {
        "User-Agent": "PedantixLibre/1.0 (https://example.com)",
      },
    });
    if (!r.ok) continue;
    const data = (await r.json()) as { query?: { pages?: WikiPage[] } };
    const pages = data.query?.pages ?? [];
    const candidates = pages.filter(
      (p) => {
        if (!p.extract || p.extract.length <= 600) return false;
        if (GENERIC_LIST_TITLE_RE.test(p.title) || TOO_SPECIFIC_TITLE_RE.test(p.title)) {
          return false;
        }

        const normalizedTitle = p.title.replace(/\s+/g, " ").trim();
        const titleWordCount = normalizedTitle
          .split(" ")
          .filter((word) => word.length > 0).length;
        const titleChars = normalizedTitle.replace(/\s/g, "").length;

        return titleWordCount >= MIN_TITLE_WORDS && titleChars >= MIN_TITLE_CHARS;
      }
    );
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => (b.extract!.length - a.extract!.length));
    const chosen = candidates[Math.min(2, candidates.length - 1)];
    return {
      pageid: chosen.pageid,
      title: chosen.title,
      extract: chosen.extract!,
      url: chosen.fullurl ?? `https://fr.wikipedia.org/?curid=${chosen.pageid}`,
    };
  }
  throw new Error("Impossible de récupérer un article Wikipédia");
}
