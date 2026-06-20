// 2 段構成：抽出（OCR/抽出）→ レシートごとに推論（勘定科目）。

export type AccountCategory = {
  accountCategoryId: number;
  accountCategoryName: string;
};

export type LineItem = {
  description: string;
  amount: number;
  taxRate: "10%" | "8%" | "0%";
};

export type Receipt = {
  vendor: string;
  date?: string;
  lineItems: LineItem[];
};

// ---- 抽出段（structured output・tools 無し）-----------------------------------

export function getExtractSystemPrompt(): string {
  return `You extract structured data from attached receipt images/PDFs. The attachment may contain MULTIPLE separate receipts. For EACH receipt, extract its vendor, date (YYYY-MM-DD if present), and line items (description, amount in JPY, tax rate). Output strictly as the requested JSON schema. Do not infer accounting categories here — only extract what is printed.`;
}

export function getExtractUserPrompt(): string {
  return `Extract every receipt in the attached file. For each line item, give its description, amount (number, JPY), and taxRate (one of "10%", "8%", "0%"). If a receipt has a single total only, represent it as one line item.`;
}

// 抽出段の responseJsonSchema（複数レシート対応）。
export const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    receipts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          vendor: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          lineItems: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                amount: { type: "number" },
                taxRate: { type: "string", enum: ["10%", "8%", "0%"] },
              },
              required: ["description", "amount", "taxRate"],
            },
          },
        },
        required: ["vendor", "lineItems"],
      },
    },
  },
  required: ["receipts"],
} as const;

// ---- 推論段（AFC: query-index + validate-infer）------

export function getCategorizeSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `(System date: ${today})
You are an "Accounting Category Inference Agent" highly versed in Japanese accounting practice. For the given receipt (already extracted into line items), select an accounting category for EACH line item ONLY from the provided list. Your final output MUST be a JSON object that passes validation.

1. Objective
   - Infer the most appropriate accounting category for each line item and finally return JSON: { "data": [...], "requiredHumanReview": <boolean> }.
   - To ensure consistency with this client's historical journal entries, you MUST use QueryIndexTool for every single line item (at least once per line item).
   - Validate the final output using InferValidatorTool. Continue retrying (adjusting) until success=true. The LAST thing you do MUST be a successful InferValidatorTool call.

2. Input Information
   - Transaction Data: the receipt's vendor and line items (description, amount, taxRate) are provided as text.
   - Usable Accounting Category List: enumerated accountCategoryId and accountCategoryName (DO NOT use anything outside this list; no invented names, no variants).

3. Tools and Usage
   - QueryIndexTool (MANDATORY): retrieve similar past records for THIS client to ground each categorization. Call at least once per line item.
   - InferValidatorTool: validate your final JSON. content.text returns { success: boolean, data?, error? }. If success=false, analyze the error, correct, and revalidate until success=true.

4. Classification Rules (CRITICAL)
   - Dining/entertainment threshold (Japanese tax practice): dining < 10,000 JPY (tax-included) -> NOT entertainment (交際費); use another category (e.g. meeting-related). dining >= 10,000 JPY -> entertainment-related category.

5. Final Output Specification
   - Final answer MUST be exactly one pure JSON object with top-level keys "data" and "requiredHumanReview" ONLY.
   - "data": array with length EXACTLY equal to the number of line items. Each element: { "accountCategoryId": <ID from list>, "accountCategoryName": "<name from list>" }.
   - NO explanations, no extra keys.

6. requiredHumanReview
   - true if ANY line item has: no/sparse QueryIndex results, conflicting past categories with no clear majority, or an unknown/new vendor with ambiguous use.
   - false only if QueryIndex returned sufficient, consistent past records aligning with the current vendor/amount/tax/use.
   - Global OR: if any line item needs review -> true.

7. Constraints
   - NEVER output an accountCategoryId/name not in the provided list. No abbreviations, no variants, no inventions.
   - data.length MUST equal the number of line items (one-to-one, index-aligned).
   - If unsure and a generic category (e.g. "雑費") exists, use it as a last resort AND set requiredHumanReview = true.

Output must always be valid JSON and must pass InferValidatorTool (success=true) before final emission.`;
}

export function getCategorizeUserPrompt(
  accountCategories: AccountCategory[],
  receipt: Receipt,
  attempt: number
): string {
  const attemptMessage =
    attempt > 1 ? `This is retry attempt #${attempt}. ` : "";
  const list = accountCategories
    .map(
      (c) =>
        `- accountCategoryId: ${c.accountCategoryId}, accountCategoryName: ${c.accountCategoryName}`
    )
    .join("\n");
  const lines = receipt.lineItems
    .map(
      (li, i) =>
        `  ${i + 1}. description: ${li.description} / amount: ${li.amount} / taxRate: ${li.taxRate}`
    )
    .join("\n");
  return `${attemptMessage}Infer the accounting category for each line item of this receipt.

Receipt vendor: ${receipt.vendor}${receipt.date ? ` (date: ${receipt.date})` : ""}
Line items:
${lines}

Usable Accounting Category List:
${list}`;
}
