#!/usr/bin/env bash
set -euo pipefail

echo "=== Setting up Binding dev environment ==="

# Enable corepack and install pnpm
corepack enable
pnpm --version

# Install project dependencies
pnpm install

# Install Supabase CLI
npm install -g supabase

# Install Modal CLI
pip install -q modal

# Install Vercel CLI
npm install -g vercel

echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Copy .env.example to .env.local and fill in Supabase keys"
echo "  2. Run 'pnpm db:start' to start local Supabase"
echo "  3. Run 'pnpm db:reset' to apply migrations and seed data"
echo "  4. Run 'pnpm dev' to start the dev server"
