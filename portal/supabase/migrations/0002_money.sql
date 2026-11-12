-- 自己管理ポータル: お金の機能のための追加（フェーズ4）
-- 0001_init.sql を実行済みのデータベースに、SQL Editor で実行する。既存のデータは消えない。

-- 貸しの回収を記録の種類に加える（回収は収入には数えない）
alter table transactions drop constraint transactions_type_check;
alter table transactions add constraint transactions_type_check
  check (type in ('expense', 'income', 'transfer', 'adjustment', 'loan_collection'));

-- 支出は正の金額だけ。調整は増減どちらもあるので符号付き
alter table transactions add constraint transactions_amount_check
  check (type = 'adjustment' or amount >= 0);

-- クレカ: 明細と照合する日（毎月この日に照合する）
alter table card_settings add column check_day smallint check (check_day between 1 and 31);

-- クレカ: 引き落としとして記録した振替
alter table card_statements add column payment_transaction_id uuid
  references transactions (id) on delete set null;
