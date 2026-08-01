#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# scripts/seed.sh — lance POST /api/seed sur le backend Jokoo
# Usage : ./scripts/seed.sh [BACKEND_URL]
# Env   : BACKEND_URL (défaut : http://localhost:8001)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BACKEND_URL="${1:-${BACKEND_URL:-http://localhost:8001}}"
echo "→ Seed ${BACKEND_URL}/api/seed"
curl -fsS -X POST "${BACKEND_URL}/api/seed" | jq . || {
  echo "❌ Seed failed. Le backend est-il démarré ?"
  exit 1
}
echo "✅ Seed OK."
