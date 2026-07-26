#!/bin/sh
# Applies the schema, then starts the API.
#
# This exists as a script rather than a chained `a && b` start command because
# hosts differ in how they hand that command to a shell. Render quotes it into
# a single word, so `sh -c "a && b"` came back as
# "sh: 1: <the entire string>: not found" — exit 127, before Node ever ran.
# A path with no spaces, quotes or operators cannot be misparsed by any of them.
set -e

# No checked-in migrations, so the schema is pushed on boot. The prisma binary
# is under packages/db: pnpm only links a workspace's own dependencies into
# its .bin, so it is not at the repository root.
packages/db/node_modules/.bin/prisma db push \
  --schema packages/db/prisma/schema.prisma \
  --skip-generate \
  --accept-data-loss

# exec so the API becomes PID 1 and receives SIGTERM directly — the graceful
# shutdown in index.ts depends on that signal arriving.
exec node apps/backend/dist/index.js
