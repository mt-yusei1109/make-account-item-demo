// 埋め込み用テキスト生成。検索（RETRIEVAL_QUERY）と seed（RETRIEVAL_DOCUMENT）で
// 同じ形式を使う。

export type EmbeddingContext = {
  amount: number;
  taxRate: "10%" | "8%" | "0%";
  description: string;
  hints: string[];
};

export function buildEmbeddingText(
  vendor: string,
  context: EmbeddingContext[]
): string {
  const vendorPart = `vendor: ${vendor}`;
  const contextPart = context
    .map(
      (ctx, idx) =>
        `context${idx + 1}: taxRate: ${ctx.taxRate} / description: ${
          ctx.description
        } / hints: [${ctx.hints.join(", ")}]`
    )
    .join(" / ");
  return [vendorPart, contextPart].filter(Boolean).join(" / ");
}
