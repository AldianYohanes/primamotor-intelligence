-- 0007_product_relations.sql — §3.5, §3.6

create table product_model_compatibility (
  product_id uuid references products(id) on delete cascade,
  car_model_id uuid references car_models(id) on delete cascade,
  primary key (product_id, car_model_id)
);

create table product_aliases (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  alias text not null,
  source text,
  created_at timestamptz not null default now()
);

create index idx_aliases_trgm on product_aliases using gin (alias gin_trgm_ops);
