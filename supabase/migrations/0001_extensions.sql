-- 0001_extensions.sql
-- Ekstensi yang dibutuhkan seluruh skema (lihat desain-database §2)

create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;   -- fuzzy search nama part & alias
create extension if not exists pgcrypto;  -- hashing sisi DB bila diperlukan
