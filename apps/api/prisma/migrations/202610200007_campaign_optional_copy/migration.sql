ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_title_check";
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_body_check";
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_title_check" CHECK(length(title) <= 120);
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_body_check" CHECK(length(body) <= 1000);
ALTER TABLE "Campaign" ADD CONSTRAINT campaign_content_present CHECK(length(trim(title)) > 0 OR length(trim(body)) > 0 OR "imageId" IS NOT NULL);
