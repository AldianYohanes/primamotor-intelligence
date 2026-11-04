-- 0015_receipt_imports.sql — §4.4
-- Staging → review → commit, supaya hasil OCR/Excel yang tidak sempurna tidak
-- langsung mencemari stock_transactions.

create type import_source as enum ('ocr_photo', 'excel', 'manual');
create type import_status as enum ('pending', 'processing', 'needs_review', 'completed', 'failed');

create table receipt_imports (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  source import_source not null,
  file_url text,
  ocr_provider text,               -- 'gemini' (keputusan produk: Gemini API, ekstraksi JSON terstruktur)
  raw_ocr_text text,
  status import_status not null default 'pending',
  uploaded_by uuid references staff(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create type import_item_status as enum ('unmatched', 'matched', 'confirmed', 'rejected');

create table receipt_import_items (
  id uuid primary key default uuid_generate_v4(),
  import_id uuid not null references receipt_imports(id) on delete cascade,
  raw_line_text text,
  matched_product_id uuid references products(id),
  suggested_quantity int,
  suggested_transaction_type transaction_type,
  match_confidence numeric(4,3),
  status import_item_status not null default 'unmatched',
  reviewed_by uuid references staff(id),
  resulting_transaction_id uuid references stock_transactions(id),
  created_at timestamptz not null default now()
);

create index idx_import_items_import on receipt_import_items (import_id);
