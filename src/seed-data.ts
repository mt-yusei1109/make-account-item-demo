import type { EmbeddingContext } from "./embedding";

// 合成の過去仕訳（namespace = demo-client-001）。実顧客データではない。
// サンプルレシートの vendor に対応付けてある。サンプルを差し替えたら調整する。

export type PastEntry = {
  id: string;
  vendor: string;
  context: EmbeddingContext[];
  metadata: Record<string, string | number>;
};

export const PAST_ENTRIES: PastEntry[] = [
  // --- サンプルレシートに対応する過去仕訳 ---
  {
    id: "past-001",
    vendor: "タイムズ24",
    context: [
      { amount: 660, taxRate: "0%", description: "駐車料金 コインパーキング", hints: ["駐車場", "駐車代", "交通"] },
    ],
    metadata: { vendor: "タイムズ24", accountCategoryName: "旅費交通費", description: "コインパーキング駐車料金", amount: 660, taxRate: "0%", date: "2025-04-08" },
  },
  {
    id: "past-002",
    vendor: "三井のリパーク",
    context: [
      { amount: 400, taxRate: "10%", description: "駐車料金", hints: ["駐車場", "駐車代", "交通"] },
    ],
    metadata: { vendor: "三井のリパーク", accountCategoryName: "旅費交通費", description: "コインパーキング駐車料金", amount: 400, taxRate: "10%", date: "2025-04-25" },
  },
  {
    id: "past-003",
    vendor: "セブン-イレブン",
    context: [
      { amount: 150, taxRate: "10%", description: "FAX送信・コピー", hints: ["FAX", "コピー", "通信"] },
    ],
    metadata: { vendor: "セブン-イレブン", accountCategoryName: "通信費", description: "コンビニFAX/コピー", amount: 150, taxRate: "10%", date: "2025-05-02" },
  },
  {
    id: "past-004",
    vendor: "千住チャーシュー軒",
    context: [
      { amount: 4200, taxRate: "0%", description: "ご飲食代 打合せ", hints: ["飲食代", "夕食", "1万円未満", "会議"] },
    ],
    metadata: { vendor: "千住チャーシュー軒", accountCategoryName: "会議費", description: "打合せ飲食(1万円未満)", amount: 4200, taxRate: "0%", date: "2025-05-14" },
  },
  {
    id: "past-005",
    vendor: "田奈加",
    context: [
      { amount: 1300, taxRate: "0%", description: "昼食 そば・丼", hints: ["飲食代", "昼食", "1万円未満"] },
    ],
    metadata: { vendor: "田奈加", accountCategoryName: "会議費", description: "打合せ昼食(1万円未満)", amount: 1300, taxRate: "0%", date: "2025-05-19" },
  },
  // --- 一般的な過去仕訳 ---
  {
    id: "past-006",
    vendor: "JR東日本",
    context: [
      { amount: 980, taxRate: "10%", description: "乗車券 移動", hints: ["交通", "電車"] },
    ],
    metadata: { vendor: "JR東日本", accountCategoryName: "旅費交通費", description: "電車運賃", amount: 980, taxRate: "10%", date: "2025-04-22" },
  },
  {
    id: "past-007",
    vendor: "Amazon.co.jp",
    context: [
      { amount: 2640, taxRate: "10%", description: "技術書 書籍", hints: ["書籍", "参考資料"] },
    ],
    metadata: { vendor: "Amazon.co.jp", accountCategoryName: "新聞図書費", description: "業務参考書籍", amount: 2640, taxRate: "10%", date: "2025-05-01" },
  },
  {
    id: "past-008",
    vendor: "NTTドコモ",
    context: [
      { amount: 7700, taxRate: "10%", description: "携帯電話 通信料", hints: ["通信", "携帯"] },
    ],
    metadata: { vendor: "NTTドコモ", accountCategoryName: "通信費", description: "携帯通信料", amount: 7700, taxRate: "10%", date: "2025-05-10" },
  },
  {
    id: "past-009",
    vendor: "大戸屋",
    context: [
      { amount: 3300, taxRate: "8%", description: "昼食 打合せ 3名", hints: ["飲食", "1万円未満", "会議"] },
    ],
    metadata: { vendor: "大戸屋", accountCategoryName: "会議費", description: "打合せ昼食(1万円未満)", amount: 3300, taxRate: "8%", date: "2025-05-15" },
  },
  {
    id: "past-010",
    vendor: "居酒屋 北海道",
    context: [
      { amount: 18700, taxRate: "10%", description: "懇親会 取引先接待", hints: ["飲食", "1万円以上", "接待"] },
    ],
    metadata: { vendor: "居酒屋 北海道", accountCategoryName: "交際費", description: "取引先接待(1万円以上)", amount: 18700, taxRate: "10%", date: "2025-05-22" },
  },
  {
    id: "past-011",
    vendor: "ヨドバシカメラ",
    context: [
      { amount: 1480, taxRate: "10%", description: "USBメモリ", hints: ["事務用品", "備品"] },
    ],
    metadata: { vendor: "ヨドバシカメラ", accountCategoryName: "消耗品費", description: "PC周辺消耗品", amount: 1480, taxRate: "10%", date: "2025-05-20" },
  },
  {
    id: "past-012",
    vendor: "クロネコヤマト",
    context: [
      { amount: 1200, taxRate: "10%", description: "宅配便 発送", hints: ["配送", "荷造"] },
    ],
    metadata: { vendor: "クロネコヤマト", accountCategoryName: "荷造運賃", description: "商品発送費", amount: 1200, taxRate: "10%", date: "2025-05-25" },
  },
  // 洋菓子の「手土産→交際費」前例。HARBS が会議費／交際費で割れる材料。
  {
    id: "past-013",
    vendor: "シャトレーゼ",
    context: [
      { amount: 2800, taxRate: "8%", description: "菓子折り 手土産 洋菓子", hints: ["手土産", "贈答", "接待", "お菓子"] },
    ],
    metadata: { vendor: "シャトレーゼ", accountCategoryName: "交際費", description: "取引先への手土産(菓子折り)", amount: 2800, taxRate: "8%", date: "2025-05-18" },
  },
];
