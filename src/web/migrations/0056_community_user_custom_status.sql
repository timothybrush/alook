-- Custom status (emoji + short term) shown on the profile card and the
-- member/friends lists. Both nullable so existing rows read as "no status
-- set" with no backfill needed.
ALTER TABLE community_user_profile ADD COLUMN status_emoji TEXT;
ALTER TABLE community_user_profile ADD COLUMN status_text TEXT DEFAULT '';
