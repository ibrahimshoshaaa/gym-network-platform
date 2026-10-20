CREATE TABLE "StaffDelegation" (
 id UUID PRIMARY KEY,"userId" UUID NOT NULL REFERENCES "User"(id),"gymId" UUID NOT NULL REFERENCES "Gym"(id),
 "branchId" UUID,permissions TEXT[] NOT NULL DEFAULT '{}',"fullAccess" BOOLEAN NOT NULL DEFAULT false,active BOOLEAN NOT NULL DEFAULT true,
 version INTEGER NOT NULL DEFAULT 1,"grantedById" UUID NOT NULL REFERENCES "User"(id),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY ("branchId","gymId") REFERENCES "Branch"(id,"gymId"),
 CHECK(version>0 AND permissions <@ ARRAY['MANAGE_CASHIERS','EDIT_BRANCH','REQUEST_PRICING','REQUEST_WITHDRAWAL','TRANSFER_STOCK']::text[])
);
CREATE INDEX "StaffDelegation_userId_gymId_active_idx" ON "StaffDelegation"("userId","gymId",active);
CREATE UNIQUE INDEX delegation_scope ON "StaffDelegation"("userId","gymId",coalesce("branchId",'00000000-0000-0000-0000-000000000000'::uuid));

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gym_api_service') THEN GRANT SELECT,INSERT,UPDATE ON "StaffDelegation" TO gym_api_service; END IF; END $$;
