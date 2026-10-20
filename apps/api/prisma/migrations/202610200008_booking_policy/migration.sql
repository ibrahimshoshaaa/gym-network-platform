CREATE TABLE "BookingPolicy" (
  "id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "configuration" JSONB NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingPolicy_version_positive" CHECK ("version" > 0),
  CONSTRAINT "BookingPolicy_creator_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "BookingPolicy_version_key" ON "BookingPolicy"("version");
-- Published policies are immutable, like snapshots kept by future bookings.
CREATE FUNCTION protect_booking_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published booking policies cannot be changed or deleted';
END;
$$;
CREATE TRIGGER booking_policy_immutable BEFORE UPDATE OR DELETE ON "BookingPolicy"
FOR EACH ROW EXECUTE FUNCTION protect_booking_policy();
