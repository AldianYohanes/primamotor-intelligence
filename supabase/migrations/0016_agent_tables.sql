-- 0016_agent_tables.sql — §5.1–5.4
-- agent_audit_log_id FK di-ALTER masuk ke stock_transactions di sini (dibuat di 0011 sebagai
-- kolom polos karena agent_audit_log belum ada saat itu).

create table agent_conversations (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  staff_id uuid references staff(id),
  channel text not null default 'chat_pwa',
  summary text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create type message_role as enum ('user', 'assistant', 'tool');

create table agent_messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references agent_conversations(id) on delete cascade,
  role message_role not null,
  agent_type text,
  content text,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

create index idx_messages_conv_time on agent_messages (conversation_id, created_at);

create type audit_status as enum ('pending', 'confirmed', 'rejected', 'executed', 'failed');

create table agent_audit_log (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid references agent_conversations(id),
  agent_type text not null,
  tool_name text not null,
  input_params jsonb not null,
  decision_reason text,
  requires_confirmation boolean not null default true,
  status audit_status not null default 'pending',
  confirmed_by uuid references staff(id),
  confirmed_at timestamptz,
  related_transaction_id uuid references stock_transactions(id),
  created_at timestamptz not null default now()
);

create index idx_audit_business_time on agent_audit_log (business_id, created_at desc);
create index idx_audit_status on agent_audit_log (status) where status = 'pending';

alter table stock_transactions
  add constraint fk_stock_txn_audit foreign key (agent_audit_log_id) references agent_audit_log(id);

create table agent_execution_metrics (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid references agent_conversations(id),
  agent_type text not null,
  model_name text,
  prompt_tokens int,
  completion_tokens int,
  context_length_at_call int,
  latency_ms int,
  succeeded boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_metrics_business_time on agent_execution_metrics (business_id, created_at desc);
