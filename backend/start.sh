#!/bin/sh
set -e

# Use DATABASE_PUBLIC_URL when railway.internal fails (P1001)
# Add variable in Railway: DATABASE_PUBLIC_URL = ${{Postgres.DATABASE_PUBLIC_URL}}
if [ -n "$DATABASE_PUBLIC_URL" ]; then
  export DATABASE_URL="$DATABASE_PUBLIC_URL"
fi

# Give Railway's private network time to initialize
sleep 5

# Resolve failed migration (P3009) - mark as rolled-back so deploy can retry
# Ignores errors if migration is not in failed state
npx prisma migrate resolve --rolled-back 20260129000000_add_installment_fields || true
npx prisma migrate resolve --rolled-back 20260129100000_fix_installment_amounts || true

npx prisma migrate deploy
exec npm run start
