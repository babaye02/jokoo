#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# scripts/db_restore.sh — restore MongoDB dans la base Jokoo
# Usage : ./scripts/db_restore.sh <DUMP_DIR>
# Ex.   : ./scripts/db_restore.sh ./dumps/2026-06-15-1030
# Env   : MONGO_URL (défaut : mongodb://localhost:27017)
#         DB_NAME   (défaut : jokoo_db)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <DUMP_DIR>"
  echo "Le dossier doit contenir un sous-dossier jokoo_db/ avec les .bson."
  exit 1
fi

DUMP_DIR="$1"
MONGO_URL="${MONGO_URL:-mongodb://localhost:27017}"
DB_NAME="${DB_NAME:-jokoo_db}"

if [ ! -d "${DUMP_DIR}/${DB_NAME}" ]; then
  echo "❌ ${DUMP_DIR}/${DB_NAME}/ introuvable."
  exit 1
fi

echo "→ Restore ${DB_NAME} into ${MONGO_URL}"
echo "→ Source : ${DUMP_DIR}/${DB_NAME}/"

mongorestore --uri "${MONGO_URL}" --db "${DB_NAME}" --drop "${DUMP_DIR}/${DB_NAME}"

echo "✅ Restore terminé."
