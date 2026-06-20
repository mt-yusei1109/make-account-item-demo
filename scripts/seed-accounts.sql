-- 合成の勘定科目表（client_id = 'demo-client-001'）。実顧客データではない。
-- id=14「修繕費」は is_active=0 ＝ 無効科目。モデルがこれを選ぶと
-- validate-infer が「有効科目に一致しない」と弾き、再試行する画を見せられる。
DELETE FROM account_categories WHERE client_id = 'demo-client-001';

INSERT INTO account_categories (id, client_id, name, is_active) VALUES
  (1,  'demo-client-001', '消耗品費',     1),
  (2,  'demo-client-001', '会議費',       1),
  (3,  'demo-client-001', '交際費',       1),
  (4,  'demo-client-001', '旅費交通費',   1),
  (5,  'demo-client-001', '通信費',       1),
  (6,  'demo-client-001', '新聞図書費',   1),
  (7,  'demo-client-001', '支払手数料',   1),
  (8,  'demo-client-001', '地代家賃',     1),
  (9,  'demo-client-001', '水道光熱費',   1),
  (10, 'demo-client-001', '雑費',         1),
  (11, 'demo-client-001', '広告宣伝費',   1),
  (12, 'demo-client-001', '福利厚生費',   1),
  (13, 'demo-client-001', '荷造運賃',     1),
  (14, 'demo-client-001', '修繕費',       0);
