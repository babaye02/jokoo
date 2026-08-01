#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# scripts/db_dump.sh — dump MongoDB de la base Jokoo
# Usage : ./scripts/db_dump.sh [OUTPUT_DIR]
# Env   : MONGO_URL (défaut : mongodb://localhost:27017)
#         DB_NAME   (défaut : jokoo_db)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

MONGO_URL="${MONGO_URL:-mongodb://localhost:27017}"
DB_NAME="${DB_NAME:-jokoo_db}"
STAMP="$(date +%Y-%m-%d-%H%M)"
OUTPUT_DIR="${1:-./dumps/${STAMP}}"

echo "→ Dump ${DB_NAME} from ${MONGO_URL}"
echo "→ Output: ${OUTPUT_DIR}"

mkdir -p "$(dirname "${OUTPUT_DIR}")"
mongodump --uri "${MONGO_URL}" --db "${DB_NAME}" --out "${OUTPUT_DIR}"

echo "✅ Dump terminé : ${OUTPUT_DIR}/${DB_NAME}/"
du -sh "${OUTPUT_DIR}"
