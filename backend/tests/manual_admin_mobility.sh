#!/bin/bash
# Test E2E : admin mobilité (dashboard + anti-ghost)
BASE="https://jokoo-mobile-dev.preview.emergentagent.com/api"
TA=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@jokoo.sn","password":"Admin1234!"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
TADMIN2=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin2@jokoo.sn","password":"Staff1234!"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
TCLIENT=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"email":"client@jokoo.sn","password":"Passw0rd!"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
echo "tokens: super=$([ -n "$TA" ] && echo ok) admin=$([ -n "$TADMIN2" ] && echo ok) client=$([ -n "$TCLIENT" ] && echo ok)"

echo "=== 1. Dashboard (super admin) ==="
curl -s "$BASE/admin/mobility/dashboard" -H "Authorization: Bearer $TA" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('kpis:',d['kpis'])
print('matching:',d['matching'])
print('top_request_routes:',len(d['top_request_routes']),'| requests_by_city:',len(d['requests_by_city']),'| unserved:',d['kpis']['unserved_requests'])
"
echo "=== 1b. Client -> 403 attendu ==="
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/admin/mobility/dashboard" -H "Authorization: Bearer $TCLIENT"

DATE=$(date -d "+2 days" +%Y-%m-%d)
echo "=== 2. Création unitaire (admin standard, perm mobility:manage) ==="
R=$(curl -s -X POST "$BASE/admin/mobility/ghost-rides" -H "Authorization: Bearer $TADMIN2" -H 'Content-Type: application/json' -d "{\"from_city\":\"Dakar\",\"to_city\":\"Thiès\",\"date\":\"$DATE\",\"time\":\"08:00\",\"seats_total\":4,\"price_xof\":2000}")
echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);print('id ok=',bool(d.get('id')),'| jokoo_verified=',d.get('jokoo_verified'),'| is_ghost=',d.get('is_ghost'),'| driver=',d.get('driver_name'),'| verified=',d.get('driver_verified'))"
GID=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")

echo "=== 2b. Client ne peut PAS créer -> 403 ==="
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/admin/mobility/ghost-rides" -H "Authorization: Bearer $TCLIENT" -H 'Content-Type: application/json' -d "{\"from_city\":\"Dakar\",\"to_city\":\"Thiès\",\"date\":\"$DATE\",\"time\":\"09:00\",\"price_xof\":2000}"

echo "=== 3. Bulk (2 routes x 3 jours x 2 horaires = 12) ==="
curl -s -X POST "$BASE/admin/mobility/ghost-rides/bulk" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"routes":[{"from_city":"Dakar","to_city":"Mbour","price_xof":2500},{"from_city":"Mbour","to_city":"Dakar","price_xof":2500}],"days":3,"times":["07:30","16:00"],"seats_total":4}'
echo ""
echo "=== 3b. Bulk relancé -> tout skipped (anti-doublon) ==="
curl -s -X POST "$BASE/admin/mobility/ghost-rides/bulk" -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d '{"routes":[{"from_city":"Dakar","to_city":"Mbour","price_xof":2500},{"from_city":"Mbour","to_city":"Dakar","price_xof":2500}],"days":3,"times":["07:30","16:00"],"seats_total":4}'
echo ""

echo "=== 4. Liste ghost rides ==="
curl -s "$BASE/admin/mobility/ghost-rides" -H "Authorization: Bearer $TA" | python3 -c "
import sys,json
rs=json.load(sys.stdin)
act=[r for r in rs if r['status']=='active']
print('total=',len(rs),'actifs=',len(act),'| bookings_count présent=',all('bookings_count' in r for r in rs))
"

echo "=== 5. Le trajet apparaît côté public avec badge ==="
curl -s "$BASE/rides?from_city=Dakar&to_city=Thi%C3%A8s" -H "Authorization: Bearer $TCLIENT" | python3 -c "
import sys,json
rs=json.load(sys.stdin)
ghost=[r for r in rs if r.get('jokoo_verified')]
print('trajets Dakar-Thiès=',len(rs),'| jokoo_verified visibles=',len(ghost))
if ghost: print('exemple:',ghost[0]['driver_name'],ghost[0]['date'],ghost[0]['time'])
"

echo "=== 6. Annulation ==="
curl -s -X DELETE "$BASE/admin/mobility/ghost-rides/$GID" -H "Authorization: Bearer $TA"
echo ""
echo "=== 7. Dashboard reflète les ghost actifs ==="
curl -s "$BASE/admin/mobility/dashboard" -H "Authorization: Bearer $TA" | python3 -c "import sys,json;d=json.load(sys.stdin);print('ghost_rides_active=',d['kpis']['ghost_rides_active'],'| rides_active=',d['kpis']['rides_active'])"
