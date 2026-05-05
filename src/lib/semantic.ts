export type SemanticHintLevel = "red" | "orange" | "yellow" | "green";

const MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const BATCH_SIZE = 24;
const TRANSFORMERS_CDN_URL =
  "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

export const MIN_SEMANTIC_HINT = 0.74;

let extractorPromise: Promise<unknown> | null = null;

async function getExtractor() {
  if (typeof window === "undefined") {
    throw new Error("Semantic extractor is client-only");
  }

  if (!extractorPromise) {
    const dynamicImport = new Function("u", "return import(u)") as (
      url: string
    ) => Promise<{
      pipeline: (task: string, model: string) => Promise<unknown>;
      env: {
        allowLocalModels: boolean;
        allowRemoteModels: boolean;
      };
    }>;

    extractorPromise = dynamicImport(TRANSFORMERS_CDN_URL).then(
      ({ pipeline, env }) => {
        env.allowLocalModels = false;
        env.allowRemoteModels = true;
        return pipeline("feature-extraction", MODEL_ID);
      }
    );
  }
  return extractorPromise as Promise<
    (input: string | string[], options?: Record<string, unknown>) => Promise<unknown>
  >;
}

function toVectors(output: unknown, expectedRows: number): Float32Array[] {
  const tensor = output as {
    tolist?: () => unknown;
    data?: ArrayLike<number>;
    dims?: number[];
  };

  if (typeof tensor.tolist === "function") {
    const listed = tensor.tolist();
    if (Array.isArray(listed) && Array.isArray(listed[0])) {
      return (listed as number[][]).map((row) => Float32Array.from(row));
    }
  }

  if (!tensor.data || !tensor.dims || tensor.dims.length < 2) {
    throw new Error("Invalid embedding output format");
  }

  const rows = tensor.dims[0];
  const cols = tensor.dims[1];
  if (rows !== expectedRows) {
    throw new Error("Unexpected embedding row count");
  }

  const vectors: Float32Array[] = [];
  for (let r = 0; r < rows; r++) {
    const start = r * cols;
    const row = new Float32Array(cols);
    for (let c = 0; c < cols; c++) row[c] = tensor.data[start + c];
    vectors.push(row);
  }
  return vectors;
}

export async function embedWords(words: string[]): Promise<Map<string, Float32Array>> {
  const unique = [...new Set(words.map((w) => w.trim()).filter(Boolean))];
  const vectors = new Map<string, Float32Array>();
  if (unique.length === 0) return vectors;

  const extractor = await getExtractor();

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const output = await extractor(batch, { pooling: "mean", normalize: true });
    const rows = toVectors(output, batch.length);
    for (let j = 0; j < batch.length; j++) {
      vectors.set(batch[j], rows[j]);
    }
  }

  return vectors;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function semanticLevel(score: number): SemanticHintLevel {
  if (score >= 0.91) return "green";
  if (score >= 0.84) return "yellow";
  if (score >= MIN_SEMANTIC_HINT) return "orange";
  return "red";
}
