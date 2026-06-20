import type { GenerateContentResponseUsageMetadata } from "@google/genai/web";

// 本番 make-account-item の cost-calculator を移植（デモで使うモデルに絞る）。
// 1 枚あたりの実コストを推論レスポンスの usageMetadata から算出してトレースに載せる。

type GeminiModel =
  | "gemini-2.5-pro"
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite"
  | "gemini-embedding-001";

const YEN_RATE = 150;
// USD / 1 token（参照: https://ai.google.dev/gemini-api/docs/pricing）
const PRICES: Record<GeminiModel, { in: number; out: number; cached: number }> = {
  "gemini-2.5-pro": { in: 0.00000125, out: 0.00001, cached: 0.00000031 },
  "gemini-2.5-flash": { in: 0.0000003, out: 0.0000025, cached: 0.000000075 },
  "gemini-2.5-flash-lite": { in: 0.0000001, out: 0.0000004, cached: 0.000000025 },
  "gemini-embedding-001": { in: 0.00000015, out: 0, cached: 0 },
};

function calculateCost(
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
  p: { in: number; out: number; cached: number }
): number {
  return (
    inputTokens * YEN_RATE * p.in +
    outputTokens * YEN_RATE * p.out +
    cachedTokens * YEN_RATE * p.cached
  );
}

// 推論レスポンスの usageMetadata から 1 リクエストの円コストを算出。
export function calculateCostByMetadata(
  model: string,
  metadata: GenerateContentResponseUsageMetadata
): number {
  const p = PRICES[model as GeminiModel] ?? PRICES["gemini-2.5-flash"];
  const outputTokens = metadata.candidatesTokenCount ?? 0;
  const promptTokens = metadata.promptTokenCount ?? 0;
  const cachedTokens = metadata.cachedContentTokenCount ?? 0;
  const inputTokens = Math.max(0, promptTokens - cachedTokens);
  return calculateCost(inputTokens, outputTokens, cachedTokens, p);
}
