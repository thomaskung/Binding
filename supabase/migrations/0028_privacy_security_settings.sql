-- Phase 6: Security + Privacy settings (DESIGN.md §13e base + §14j deepening).
-- No new tables, so no new RLS surface to design — only new columns on
-- `profiles` plus one new security-definer RPC. Per the migrations gotcha in
-- CLAUDE.md this is a NEW forward migration; 0001/0017/etc. are untouched.

-- ---------------------------------------------------------------------------
-- Recruiter-owned opt-out: when true, this recruiter's identity is withheld
-- (shown as "A recruiter") on a seeker Pro-tier "who accessed my data" view,
-- even though Pro would otherwise show name + date. Scoped strictly to that
-- ledger view — it does NOT touch the reveal/messaging path, where recruiter
-- identity stays visible to the candidate by design (0004's
-- profiles_recruiter_identity_select: candidates must always be able to see
-- who is contacting them — a trust requirement, not something this toggle
-- reverses).
-- ---------------------------------------------------------------------------
alter table profiles
  add column hide_name_on_reveal boolean not null default false;

-- ---------------------------------------------------------------------------
-- Notification preferences (§14j: "separate transactional ... from marketing
-- communications, so a marketing opt-out doesn't accidentally silence
-- account-security or match notifications"). Minimal real split matching what
-- the app actually has notification-worthy events for today (new surfaced
-- matches, reveal/override activity on a seeker's own profile) plus one
-- marketing-style category, defaulted OFF. No delivery mechanism (email/push)
-- exists yet anywhere in the codebase — these columns are the preference
-- store a future notifier would read, not a claim that notifications are
-- currently sent.
-- ---------------------------------------------------------------------------
alter table profiles
  add column notify_new_matches boolean not null default true,
  add column notify_reveal_activity boolean not null default true,
  add column notify_product_updates boolean not null default false;

-- ---------------------------------------------------------------------------
-- DSAR export rate-limit anchor (§14j: "self-service data export ... rate-
-- limited (once/30 days ... existing rate-limit discipline)"). A real cooldown
-- needs a persisted "last exported at" timestamp somewhere; adding it here
-- (rather than a new table) keeps this migration's "no new tables" shape —
-- same posture as any other profiles column, no new RLS/grants needed. Read
-- by src/lib/dsar.ts's pure guard, written by the exportMyData server action.
-- ---------------------------------------------------------------------------
alter table profiles
  add column dsar_last_exported_at timestamptz;

-- ---------------------------------------------------------------------------
-- get_my_access_log(): re-enables SELF-access to pii_access_log (migration
-- 0017 deliberately excluded owner self-access from that table's charter —
-- "it would drown the accountability signal in routine noise" — this RPC is
-- the scoped, audited re-enablement promised by CLAUDE.md/§14j's "who
-- accessed my data" ledger).
--
-- Security posture (real boundary, not cosmetic):
--   - SECURITY DEFINER + `set search_path = public`, same pattern as every
--     other definer RPC in this schema (match_candidates, etc.).
--   - Takes NO parameters. A `p_profile_id` argument "for whoever the caller
--     asks about" would BE the cross-user leak this function exists to
--     close — the only subject it can ever return rows for is
--     `auth.uid()`, hard-coded into the WHERE clause below, never passed in.
--   - `auth.uid()` is NULL for the service-role/anon context, and
--     `subject_id = NULL` matches no rows (SQL NULL comparison), so a
--     non-authenticated caller gets an empty result, never another user's
--     rows.
--   - The seeker-tier / hide_name_on_reveal gating that decides whether a
--     recruiter's identity is shown happens INSIDE this function, not in
--     app code: returning `accessor_id`/`recruiter_display_name`
--     unconditionally and only masking them in the client would leak the
--     linkage ("this specific recruider accessed me") straight off the
--     network payload even when the UI renders "A recruiter" — the same
--     class of leak `match_candidates` (0018) already guards against for
--     `credentials_summary` via `field_visibility`. Gating in SQL means a
--     free-tier seeker's client never receives the accessor's identity at
--     all when it shouldn't be shown.
--   - `company_name` is always returned ungated: the company is already
--     visible on the job posting pre-reveal, so this is not a new
--     disclosure (§14j).
--   - Both joins are LEFT, not INNER (defense in depth, per an advisor
--     review catch): `pii_access_log.accessor_role` also allows "support"/
--     "ta_service" (src/lib/pii-audit.ts) for a future break-glass path whose
--     accessor_id might not always be a `profiles` row, and `caller` should
--     never be able to make a real log row silently vanish just because its
--     own profile lookup fails for some unforeseen reason. An accountability
--     ledger that drops rows on a join miss is worse than one that shows them
--     ungated-safe defaults — an inner join here would fail exactly that way.
-- ---------------------------------------------------------------------------
create or replace function get_my_access_log()
returns table (
  id uuid,
  created_at timestamptz,
  resource pii_resource_type,
  action text,
  company_name text,
  accessor_id uuid,
  recruiter_display_name text
)
language sql
security definer
set search_path = public
as $$
  select
    log.id,
    log.created_at,
    log.resource,
    log.action,
    accessor.company_name,
    case
      when coalesce(caller.seeker_tier, 'free') = 'pro' and not coalesce(accessor.hide_name_on_reveal, false)
        then accessor.id
      else null
    end as accessor_id,
    case
      when coalesce(caller.seeker_tier, 'free') = 'pro' and not coalesce(accessor.hide_name_on_reveal, false)
        then accessor.display_name
      else null
    end as recruiter_display_name
  from pii_access_log log
  left join profiles accessor on accessor.id = log.accessor_id
  left join profiles caller on caller.id = auth.uid()
  where log.subject_id = auth.uid()
  order by log.created_at desc;
$$;

-- Explicit grant (0002's blanket grants were point-in-time — new function
-- surface gets its own explicit grant, same discipline as the table-grant
-- gotcha in CLAUDE.md). authenticated only: no anon/service_role execute.
grant execute on function get_my_access_log() to authenticated;
