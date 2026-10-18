CREATE TABLE "GymApplication" (
 "id" uuid PRIMARY KEY,"ownerId" uuid NOT NULL UNIQUE REFERENCES "User"(id),
 "gymName" text NOT NULL,"description" text NOT NULL,"governorate" text NOT NULL,"city" text NOT NULL,"address" text NOT NULL,
 "status" text NOT NULL DEFAULT 'PENDING',"version" integer NOT NULL DEFAULT 1,
 "gymId" uuid UNIQUE REFERENCES "Gym"(id),"reviewedById" uuid REFERENCES "User"(id),"reviewReason" text,"reviewedAt" timestamp(3),
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" timestamp(3) NOT NULL,
 CONSTRAINT application_state CHECK(status IN ('PENDING','APPROVED','REJECTED') AND version>0 AND
 (status<>'APPROVED' OR "gymId" IS NOT NULL) AND (status<>'REJECTED' OR "gymId" IS NULL) AND
 (status='PENDING' OR ("reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "reviewReason" IS NOT NULL AND length(btrim("reviewReason"))>=5)))
);
CREATE INDEX "GymApplication_status_createdAt_id_idx" ON "GymApplication"(status,"createdAt",id);
CREATE FUNCTION protect_gym_application() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Application history must be retained'; END IF;
 IF NEW.id<>OLD.id OR NEW."ownerId"<>OLD."ownerId" OR NEW."createdAt"<>OLD."createdAt" OR OLD.status='APPROVED' THEN RAISE EXCEPTION 'Application identity or decision is immutable'; END IF;
 IF OLD.status='PENDING' AND (NEW.status NOT IN ('APPROVED','REJECTED') OR NEW.version<>OLD.version OR (NEW."gymName",NEW.description,NEW.governorate,NEW.city,NEW.address) IS DISTINCT FROM (OLD."gymName",OLD.description,OLD.governorate,OLD.city,OLD.address)) THEN RAISE EXCEPTION 'Invalid application review'; END IF;
 IF OLD.status='REJECTED' AND (NEW.status<>'PENDING' OR NEW.version<>OLD.version+1 OR NEW."gymId" IS NOT NULL OR NEW."reviewReason" IS NOT NULL OR NEW."reviewedAt" IS NOT NULL OR NEW."reviewedById" IS NOT NULL) THEN RAISE EXCEPTION 'Invalid application resubmission'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "GymApplication_protect" BEFORE UPDATE OR DELETE ON "GymApplication" FOR EACH ROW EXECUTE FUNCTION protect_gym_application();
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gym_api_service') THEN GRANT SELECT,INSERT,UPDATE ON "GymApplication" TO gym_api_service; END IF; END $$;
