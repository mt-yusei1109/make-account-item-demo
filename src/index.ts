import { Hono } from "hono";
import { GoogleGenAI } from "@google/genai/web";
import { inferReceipt } from "./infer";
import { buildEmbeddingText } from "./embedding";
import { PAST_ENTRIES } from "./seed-data";

const CLIENT_ID = "demo-client-001";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/", (c) =>
  c.json({
    name: "make-account-item-demo",
    endpoints: {
      "POST /infer-receipt": "multipart field 'file' にレシートPDF/画像を入れて叩く",
      "POST /seed/vectors": "合成過去仕訳を Vectorize へ投入（namespace=demo-client-001）",
    },
  })
);

// レシートPDF/画像 → agent（抽出＋RAG＋検証）→ トレースJSON。
app.post("/infer-receipt", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) {
    return c.json(
      { error: "multipart field 'file' (a receipt PDF/image) is required" },
      400
    );
  }
  const buf = await file.arrayBuffer();
  const mimeType = file.type || "application/pdf";
  const dataBase64 = arrayBufferToBase64(buf);

  const result = await inferReceipt(c.env, CLIENT_ID, { mimeType, dataBase64 });
  // 常に 200。成否は result.ok / 各 result の ok で表す。
  return c.json(result);
});

// 合成の過去仕訳を埋め込んで Vectorize へ投入（取り込み時 RETRIEVAL_DOCUMENT・768 次元）。
app.post("/seed/vectors", async (c) => {
  const ai = new GoogleGenAI({ apiKey: c.env.GEMINI_API_KEY });
  const vectors: VectorizeVector[] = [];
  for (const e of PAST_ENTRIES) {
    const text = buildEmbeddingText(e.vendor, e.context);
    const resp = await ai.models.embedContent({
      model: c.env.EMBEDDING_MODEL,
      contents: [text],
      config: { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: 768 },
    });
    const values = resp.embeddings?.[0]?.values;
    if (!values) {
      return c.json({ error: `failed to embed ${e.id}` }, 500);
    }
    vectors.push({
      id: e.id,
      values,
      namespace: CLIENT_ID,
      metadata: e.metadata,
    });
  }
  const mutation = await c.env.VECTORIZE.upsert(vectors);
  return c.json({ seeded: vectors.length, namespace: CLIENT_ID, mutation });
});

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export default app;
