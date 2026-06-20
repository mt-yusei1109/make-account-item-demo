import { GoogleGenAI, mcpToTool } from "@google/genai/web";
import type {
  Content,
  GenerateContentConfig,
  GenerateContentResponseUsageMetadata,
} from "@google/genai/web";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createInferenceMcp } from "./mcp";
import {
  getExtractSystemPrompt,
  getExtractUserPrompt,
  EXTRACT_SCHEMA,
  getCategorizeSystemPrompt,
  getCategorizeUserPrompt,
  type AccountCategory,
  type Receipt,
} from "./prompt";
import { calculateCostByMetadata } from "./cost";

const MAX_ATTEMPTS = 3;

export type InferData = {
  data: Array<{ accountCategoryId: number; accountCategoryName: string }>;
  requiredHumanReview: boolean;
};

export type TraceStep =
  | { kind: "tool_call"; tool: string; args: unknown }
  | { kind: "tool_result"; tool: string; result: unknown };

// レシート 1 枚分の推論結果。
export type ReceiptResult = {
  receipt: Receipt;
  inferred: InferData | null; // validate-infer を通れば値、ダメなら null
  ok: boolean;
  attempt: number;
  trace: TraceStep[];
  costYen: number | null;
  finishReason?: string;
};

export type InferResult = {
  ok: boolean; // 全レシートが ok か
  receiptsCount: number;
  results: ReceiptResult[];
  extractCostYen: number | null;
  totalCostYen: number | null;
};

// 試行ごとの温度エスカレーション（本番 getInferAccountingCategoryConfig と同一）。
function categorizeConfig(
  client: Client,
  attempt: number
): GenerateContentConfig {
  let temperature: number;
  let topP: number;
  let topK: number;
  switch (attempt) {
    case 1:
      temperature = 0.2;
      topP = 0.9;
      topK = 40;
      break;
    case 2:
      temperature = 0.35;
      topP = 0.8;
      topK = 56;
      break;
    default:
      temperature = 0.7;
      topP = 0.95;
      topK = 64;
  }
  return {
    temperature,
    topP,
    topK,
    thinkingConfig: { thinkingBudget: 1024 },
    systemInstruction: getCategorizeSystemPrompt(),
    tools: [mcpToTool(client)],
    automaticFunctionCalling: { maximumRemoteCalls: 15 },
  };
}

function parseToolTexts(response: unknown): unknown[] {
  const out: unknown[] = [];
  if (
    typeof response === "object" &&
    response !== null &&
    Array.isArray((response as { content?: unknown }).content)
  ) {
    for (const item of (response as { content: unknown[] }).content) {
      const text = (item as { text?: unknown }).text;
      if (typeof text === "string") {
        try {
          out.push(JSON.parse(text));
        } catch {
          out.push(text);
        }
      }
    }
  }
  return out;
}

function extractFromHistory(history: Content[] | undefined): {
  trace: TraceStep[];
  validated: InferData | null;
} {
  const trace: TraceStep[] = [];
  let validated: InferData | null = null;
  for (const entry of history ?? []) {
    for (const part of entry.parts ?? []) {
      if (part.functionCall?.name) {
        trace.push({
          kind: "tool_call",
          tool: part.functionCall.name,
          args: part.functionCall.args ?? null,
        });
      }
      if (part.functionResponse?.name) {
        const parsed = parseToolTexts(part.functionResponse.response);
        trace.push({
          kind: "tool_result",
          tool: part.functionResponse.name,
          result: parsed.length === 1 ? parsed[0] : parsed,
        });
        if (part.functionResponse.name === "validate-infer") {
          for (const p of parsed) {
            if (
              typeof p === "object" &&
              p !== null &&
              (p as { success?: unknown }).success === true &&
              "data" in (p as object)
            ) {
              validated = (p as { data: InferData }).data;
            }
          }
        }
      }
    }
  }
  return { trace, validated };
}

async function getActiveCategories(
  db: D1Database,
  clientId: string
): Promise<AccountCategory[]> {
  const result = await db
    .prepare(
      `SELECT id, name FROM account_categories
       WHERE client_id = ? AND is_active = 1 ORDER BY id`
    )
    .bind(clientId)
    .all<{ id: number; name: string }>();
  return result.results.map((r) => ({
    accountCategoryId: r.id,
    accountCategoryName: r.name,
  }));
}

// ---- 抽出段：PDF/画像 → レシート配列（structured output・tools 無し）-----------
async function extractReceipts(
  ai: GoogleGenAI,
  env: CloudflareBindings,
  pdf: { mimeType: string; dataBase64: string }
): Promise<{ receipts: Receipt[]; costYen: number | null }> {
  const content: Content = {
    role: "user",
    parts: [
      { text: getExtractUserPrompt() },
      { inlineData: { mimeType: pdf.mimeType, data: pdf.dataBase64 } },
    ],
  };
  const res = await ai.models.generateContent({
    model: env.EXTRACT_MODEL,
    contents: [content],
    config: {
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
      systemInstruction: getExtractSystemPrompt(),
      responseMimeType: "application/json",
      responseJsonSchema: EXTRACT_SCHEMA,
    },
  });
  const costYen = res.usageMetadata
    ? calculateCostByMetadata(env.EXTRACT_MODEL, res.usageMetadata)
    : null;
  let receipts: Receipt[] = [];
  try {
    const parsed = JSON.parse(res.text ?? "{}");
    if (Array.isArray(parsed?.receipts)) receipts = parsed.receipts;
  } catch (e) {
    console.error("extract: failed to parse", e);
  }
  return { receipts, costYen };
}

// ---- 推論段：レシート 1 枚を AFC で分類（本番 per-page infer 相当）-------------
async function categorizeReceipt(
  ai: GoogleGenAI,
  env: CloudflareBindings,
  clientId: string,
  categories: AccountCategory[],
  receipt: Receipt
): Promise<ReceiptResult> {
  let lastTrace: TraceStep[] = [];
  let lastFinish: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const server = createInferenceMcp(env, clientId);
    const client = new Client({ name: "gemini-app", version: "0.1.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const content: Content = {
        role: "user",
        parts: [{ text: getCategorizeUserPrompt(categories, receipt, attempt) }],
      };
      const res = await ai.models.generateContent({
        model: env.INFER_MODEL,
        contents: [content],
        config: categorizeConfig(client, attempt),
      });
      const { trace, validated } = extractFromHistory(
        res.automaticFunctionCallingHistory
      );
      lastTrace = trace;
      lastFinish = res.candidates?.[0]?.finishReason;

      if (validated) {
        const costYen = res.usageMetadata
          ? calculateCostByMetadata(env.INFER_MODEL, res.usageMetadata)
          : null;
        return {
          receipt,
          inferred: validated,
          ok: true,
          attempt,
          trace,
          costYen,
          finishReason: lastFinish,
        };
      }
    } catch (e) {
      console.error(`categorize ${receipt.vendor} attempt ${attempt}:`, e);
    } finally {
      await client.close();
    }
  }
  return {
    receipt,
    inferred: null,
    ok: false,
    attempt: MAX_ATTEMPTS,
    trace: lastTrace,
    costYen: null,
    finishReason: lastFinish,
  };
}

export async function inferReceipt(
  env: CloudflareBindings,
  clientId: string,
  pdf: { mimeType: string; dataBase64: string }
): Promise<InferResult> {
  const categories = await getActiveCategories(env.DB, clientId);
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  const { receipts, costYen: extractCostYen } = await extractReceipts(
    ai,
    env,
    pdf
  );

  const results: ReceiptResult[] = [];
  for (const receipt of receipts) {
    results.push(
      await categorizeReceipt(ai, env, clientId, categories, receipt)
    );
  }

  const catCost = results.reduce((s, r) => s + (r.costYen ?? 0), 0);
  const totalCostYen =
    extractCostYen === null && results.every((r) => r.costYen === null)
      ? null
      : (extractCostYen ?? 0) + catCost;

  return {
    ok: results.length > 0 && results.every((r) => r.ok),
    receiptsCount: receipts.length,
    results,
    extractCostYen,
    totalCostYen,
  };
}
