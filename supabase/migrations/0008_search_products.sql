-- 0008_search_products.sql — §3.8 (butuh products + product_aliases)
-- Fondasi langsung untuk tool getStock. Fuzzy-match products.name + product_aliases.alias
-- sekaligus, supaya perilaku pencarian konsisten & bisa dites terpisah dari prompt LLM.

create or replace function search_products(
  p_business_id uuid,
  p_query text,
  p_limit int default 5
) returns table (
  product_id uuid,
  name text,
  part_number text,
  matched_via text,
  similarity_score real
) as $$
  select p.id, p.name, p.part_number,
         case when similarity(p.name, p_query) >= coalesce(max(similarity(pa.alias, p_query)), 0)
              then 'name' else 'alias:' || pa.alias end as matched_via,
         greatest(similarity(p.name, p_query), coalesce(max(similarity(pa.alias, p_query)), 0)) as similarity_score
  from products p
  left join product_aliases pa on pa.product_id = p.id
  where p.business_id = p_business_id
    and p.is_active = true
    and (p.name % p_query or pa.alias % p_query)
  group by p.id, p.name, p.part_number, pa.alias
  order by similarity_score desc
  limit p_limit;
$$ language sql stable;
