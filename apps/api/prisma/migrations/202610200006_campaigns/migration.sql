CREATE TABLE "CampaignAsset" (id UUID PRIMARY KEY,"objectKey" TEXT NOT NULL UNIQUE,"assetId" TEXT NOT NULL UNIQUE,"publicUrl" TEXT NOT NULL CHECK("publicUrl" LIKE 'https://res.cloudinary.com/%'),"createdById" UUID NOT NULL REFERENCES "User"(id),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "Campaign" (
 id UUID PRIMARY KEY,title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 120),body TEXT NOT NULL CHECK(length(body) BETWEEN 2 AND 1000),
 audience TEXT NOT NULL CHECK(audience IN('TRAINEES','OWNERS','STAFF','ALL')),channel TEXT NOT NULL CHECK(channel IN('AD','NOTIFICATION','BOTH')),
 placement TEXT NOT NULL CHECK(placement IN('HOME','GYMS','WALLET')),status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','PUBLISHED','PAUSED')),
 destination TEXT NOT NULL DEFAULT 'NONE' CHECK(destination IN('NONE','GYMS','TOPUP','QR','SUPPORT','POINT_WALLET','WITHDRAWALS')),
 priority INTEGER NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 100),"userIds" UUID[] NOT NULL DEFAULT '{}',"gymIds" UUID[] NOT NULL DEFAULT '{}',
 "startsAt" TIMESTAMP(3) NOT NULL,"endsAt" TIMESTAMP(3) NOT NULL CHECK("endsAt">"startsAt"),"imageId" UUID REFERENCES "CampaignAsset"(id),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 "createdById" UUID NOT NULL REFERENCES "User"(id),"updatedById" UUID NOT NULL REFERENCES "User"(id),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Campaign_status_startsAt_endsAt_idx" ON "Campaign"(status,"startsAt","endsAt");
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gym_api_service') THEN
 GRANT SELECT,INSERT,UPDATE ON "StaffDelegation","Campaign" TO gym_api_service;
 GRANT SELECT,INSERT ON "WithdrawalAllocation","CampaignAsset" TO gym_api_service;
END IF; END $$;
