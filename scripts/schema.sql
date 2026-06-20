-- 勘定科目マスタ（合成データ）。本番 make-account-item の account_categories を抽出。
-- validate-infer ツールが「client_id ＋ is_active=1」で照合する照合元。
CREATE TABLE IF NOT EXISTS account_categories (
  id        INTEGER PRIMARY KEY,
  client_id TEXT    NOT NULL,
  name      TEXT    NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_account_categories_client
  ON account_categories (client_id, is_active);
