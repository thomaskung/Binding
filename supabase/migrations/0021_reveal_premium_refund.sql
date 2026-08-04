-- Match-quality override pricing (DESIGN §4a): with a match-scaled override
-- cost, the engagement-premium refund must scale by the SAME factor, or a
-- premium-priced override that's declined would refund the wrong amount. Store
-- the scaled refund at charge time so both refund paths (candidate decline /
-- 7-day expiry) return exactly what was charged for the premium — no score
-- re-derivation, no drift. NULL for pre-existing rows → callers fall back to
-- the flat OVERRIDE_PREMIUM_REFUND.
alter table reveal_requests
  add column premium_refund integer;
