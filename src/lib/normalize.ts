export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

const SUFFIXES = [
  "issements",
  "issement",
  "ications",
  "ication",
  "ateurs",
  "ateur",
  "atrices",
  "atrice",
  "ations",
  "ation",
  "ables",
  "able",
  "iste",
  "istes",
  "ismes",
  "isme",
  "ements",
  "ement",
  "ments",
  "ment",
  "ique",
  "iques",
  "euses",
  "euse",
  "eurs",
  "eur",
  "trices",
  "trice",
  "ailles",
  "aille",
  "elles",
  "elle",
  "issant",
  "issants",
  "issante",
  "issantes",
  "aient",
  "ions",
  "iez",
  "ant",
  "ent",
  "ait",
  "ais",
  "ees",
  "ee",
  "es",
  "er",
  "ir",
  "re",
  "ons",
  "ez",
  "ont",
  "s",
  "x",
  "e",
];

export function stem(word: string): string {
  let w = word;
  for (const suf of SUFFIXES) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return w;
}
