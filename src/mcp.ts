import { z } from "zod";
import { GoogleGenAI } from "@google/genai/web";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildEmbeddingText } from "./embedding";

// query-index / validate-infer の MCP サーバ。
// 本番は別 Worker に分離（DESIGN.md §3.2）。デモは同一 Worker 内・InMemoryTransport 接続。

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

// ---- query-index（RAG: per-client Vectorize namespace）-----------------------

const QueryIndexInput = z.object({
  vendor: z.string().describe("The vendor name"),
  context: z.array(
    z.object({
      amount: z.number().describe("The amount"),
      taxRate: z.enum(["10%", "8%", "0%"]).describe("The tax rate"),
      description: z.string().describe("The description"),
      hints: z.array(z.string()).describe("The hints"),
    })
  ),
});
function registerQueryIndexTool(
  mcp: McpServer,
  env: CloudflareBindings,
  clientId: string
) {
  mcp.tool(
    "query-index",
    "Query the index of past journal entries for this client.",
    QueryIndexInput.shape,
    async ({ vendor, context }) => {
      const runQuery = async (): Promise<Result<VectorizeMatches>> => {
        try {
          const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
          const response = await ai.models.embedContent({
            model: env.EMBEDDING_MODEL,
            contents: [buildEmbeddingText(vendor, context)],
            config: {
              taskType: "RETRIEVAL_QUERY",
              outputDimensionality: 768,
            },
          });
          const values = response.embeddings?.[0]?.values;
          if (!values) {
            throw new Error("Failed to get embeddings");
          }
          const matches = await env.VECTORIZE.query(values, {
            topK: 3,
            returnValues: false,
            returnMetadata: "all",
            namespace: clientId,
          });
          return { success: true, data: matches };
        } catch (e) {
          console.error(e);
          return {
            success: false,
            error: "unknown error occurred. please try again.",
          };
        }
      };
      const result = await runQuery();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}

// ---- validate-infer（型 ＋ 有効勘定科目の検証）-------

type InferData = {
  data: Array<{ accountCategoryId: number; accountCategoryName: string }>;
  requiredHumanReview: boolean;
};
type AccountCategory = { id: number; name: string };

const ValidateInferInput = z
  .object({
    data: z
      .object({
        accountCategoryId: z
          .number()
          .describe("The inferred account category ID"),
        accountCategoryName: z
          .string()
          .describe("The inferred account category name"),
      })
      .array(),
    requiredHumanReview: z
      .boolean()
      .describe("Whether human review is required"),
  })
  .describe("Array of inferred account categories");

async function getActiveCategories(
  db: D1Database,
  clientId: string
): Promise<Result<AccountCategory[]>> {
  try {
    const result = await db
      .prepare(
        `SELECT id, name FROM account_categories
         WHERE client_id = ? AND is_active = 1`
      )
      .bind(clientId)
      .all<AccountCategory>();
    if (!result.success) {
      throw new Error("Failed to query account categories");
    }
    return { success: true, data: result.results };
  } catch (error) {
    console.error("Failed to get account categories:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function validateInfer(
  db: D1Database,
  clientId: string,
  v: unknown
): Promise<Result<InferData>> {
  if (!isObject(v)) return { success: false, error: "Data is not an object" };
  const { data, requiredHumanReview } = v;
  if (typeof requiredHumanReview !== "boolean")
    return { success: false, error: "requiredHumanReview is not a boolean" };
  if (!Array.isArray(data))
    return { success: false, error: "Data is not an array" };
  if (data.length === 0)
    return { success: false, error: "Data array is empty" };

  const categories = await getActiveCategories(db, clientId);
  if (!categories.success) {
    return {
      success: false,
      error: "Failed to get account categories. Please try again.",
    };
  }

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (!isObject(item))
      return { success: false, error: `Data[${i}] is not an object` };
    const { accountCategoryId, accountCategoryName } = item;
    if (!isFiniteNumber(accountCategoryId))
      return {
        success: false,
        error: `Data[${i}].accountCategoryId is not a number`,
      };
    if (!isNonEmptyString(accountCategoryName))
      return {
        success: false,
        error: `Data[${i}].accountCategoryName is not a non-empty string`,
      };
    const match = categories.data.find(
      (c) => c.id === accountCategoryId && c.name === accountCategoryName
    );
    if (!match) {
      return {
        success: false,
        error: `Data[${i}] does not match any active account category`,
      };
    }
  }
  return { success: true, data: v as InferData };
}

function registerInferValidatorTool(
  mcp: McpServer,
  env: CloudflareBindings,
  clientId: string
) {
  mcp.tool(
    "validate-infer",
    "Validate inferred transaction data. Returns success:true with the validated data if valid, or success:false with a detailed error message if invalid.",
    ValidateInferInput.shape,
    async (input) => {
      const result = await validateInfer(env.DB, clientId, input as unknown);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}

// inference 用 MCP サーバを構築（query-index ＋ validate-infer）。
export function createInferenceMcp(
  env: CloudflareBindings,
  clientId: string
): McpServer {
  const mcp = new McpServer({ name: "mcp-infer-server", version: "0.0.1" });
  registerQueryIndexTool(mcp, env, clientId);
  registerInferValidatorTool(mcp, env, clientId);
  return mcp;
}
