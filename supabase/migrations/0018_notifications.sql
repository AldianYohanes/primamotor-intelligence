-- 0018_notifications.sql — §7

create table push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  staff_id uuid references staff(id) on delete cascade,
  endpoint text not null,
  keys jsonb not null,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index idx_push_endpoint on push_subscriptions (staff_id, endpoint);

create type notification_type as enum ('dead_stock', 'low_stock', 'reorder_suggestion', 'system');

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  staff_id uuid references staff(id),
  type notification_type not null,
  title text not null,
  body text,
  related_id uuid,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_business_time on notifications (business_id, created_at desc);
