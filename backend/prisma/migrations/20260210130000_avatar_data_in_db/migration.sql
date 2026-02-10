-- Store avatar image data directly in the database (base64)
-- This ensures avatars survive ephemeral filesystem redeployments (Railway, etc.)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatar_data" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatar_mime" VARCHAR(100);
