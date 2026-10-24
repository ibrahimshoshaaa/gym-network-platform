-- Retain historic stock accounts, requests and immutable postings. Never burn balances.
CREATE TABLE "WelcomePointsPolicy" (
 id text PRIMARY KEY CHECK(id='default'),version integer NOT NULL CHECK(version>0),
 enabled boolean NOT NULL DEFAULT false,points integer NOT NULL DEFAULT 0 CHECK(points BETWEEN 0 AND 100000),
 "createdById" uuid NOT NULL REFERENCES "User"(id),"updatedAt" timestamp(3) NOT NULL,
 CHECK(NOT enabled OR points>0)
);
CREATE TABLE "WelcomePointsGrant" (
 "userId" uuid PRIMARY KEY REFERENCES "User"(id),points integer NOT NULL CHECK(points>0),
 "policyVersion" integer NOT NULL CHECK("policyVersion">0),
 "pointTransactionId" uuid NOT NULL UNIQUE REFERENCES "PointTransaction"(id),
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION protect_welcome_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Welcome grant history is immutable'; END $$;
CREATE TRIGGER welcome_grant_immutable BEFORE UPDATE OR DELETE ON "WelcomePointsGrant" FOR EACH ROW EXECUTE FUNCTION protect_welcome_grant();
CREATE FUNCTION reject_retired_stock_posting() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM "PointAccount" a JOIN "PointTransaction" t ON t.id=NEW."transactionId"
 WHERE a.id=NEW."accountId" AND a.type IN ('GYM_INVENTORY','BRANCH_INVENTORY') AND t.kind IN ('ISSUE','TRANSFER'))
 THEN RAISE EXCEPTION 'Gym point purchasing, selling and stock transfers are retired'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER retired_stock_posting BEFORE INSERT ON "PointPosting" FOR EACH ROW EXECUTE FUNCTION reject_retired_stock_posting();
DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['gym_api_service','gym_api_runtime'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON "WelcomePointsPolicy" TO %I',r);
 EXECUTE format('GRANT SELECT,INSERT ON "WelcomePointsGrant" TO %I',r);
 END IF;
END LOOP; END $$;
