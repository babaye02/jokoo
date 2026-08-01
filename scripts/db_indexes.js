// ─────────────────────────────────────────────────────────────────────────────
// scripts/db_indexes.js — Création des index MongoDB recommandés pour Jokoo
// Usage : mongosh "mongodb://localhost:27017/jokoo_db" scripts/db_indexes.js
// ─────────────────────────────────────────────────────────────────────────────

db = db.getSiblingDB("jokoo_db");

print("→ Creating indexes on users...");
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ apple_sub: 1 }, { sparse: true });
db.users.createIndex({ staff_role: 1 }, { sparse: true });

print("→ Creating indexes on providers...");
db.providers.createIndex({ service_key: 1, city: 1 });
db.providers.createIndex({ sponsored_until: 1 });
db.providers.createIndex({ rating: -1 });

print("→ Creating indexes on services...");
db.services.createIndex({ provider_id: 1, active: 1 });

print("→ Creating indexes on bookings...");
db.bookings.createIndex({ client_id: 1, created_at: -1 });
db.bookings.createIndex({ provider_id: 1, created_at: -1 });
db.bookings.createIndex({ status: 1 });

print("→ Creating indexes on reviews...");
db.reviews.createIndex({ provider_id: 1, created_at: -1 });
db.reviews.createIndex({ booking_id: 1 }, { sparse: true });

print("→ Creating indexes on messages...");
db.messages.createIndex({ conv_id: 1, created_at: 1 });
db.messages.createIndex({ to_id: 1, read: 1 });

print("→ Creating indexes on notifications...");
db.notifications.createIndex({ user_id: 1, created_at: -1 });
db.notifications.createIndex({ user_id: 1, read: 1 });

print("→ Creating indexes on blocked_users...");
db.blocked_users.createIndex({ user_id: 1, blocked_id: 1 }, { unique: true });
db.blocked_users.createIndex({ blocked_id: 1 });

print("→ Creating indexes on rides + ride_bookings...");
db.rides.createIndex({ status: 1, date: 1 });
db.rides.createIndex({ driver_id: 1 });
db.rides.createIndex({ from_city: 1, to_city: 1, date: 1 });
db.ride_bookings.createIndex({ passenger_id: 1 });
db.ride_bookings.createIndex({ ride_id: 1 });

print("→ Creating indexes on parcels...");
db.parcels.createIndex({ sender_id: 1 });
db.parcels.createIndex({ driver_id: 1 });
db.parcels.createIndex({ status: 1 });

print("→ Creating indexes on Family...");
db.babysitters.createIndex({ status: 1, city: 1 });
db.babysitters.createIndex({ user_id: 1 }, { unique: true });
db.babysitting_bookings.createIndex({ parent_id: 1, created_at: -1 });
db.babysitting_bookings.createIndex({ babysitter_user_id: 1, created_at: -1 });
db.babysitting_bookings.createIndex({ status: 1 });
db.babysitting_reports.createIndex({ booking_id: 1 }, { unique: true });

print("→ Creating indexes on legal...");
db.legal_documents.createIndex({ slug: 1 }, { unique: true });
db.legal_versions.createIndex({ doc_slug: 1, version: -1 });
db.legal_acceptances.createIndex({ user_id: 1 });

print("→ Creating indexes on ads / partners / promos / sponsorships...");
db.ads.createIndex({ placement: 1, audience: 1, suspended: 1 });
db.ad_campaigns.createIndex({ provider_id: 1 });
db.promos.createIndex({ slug: 1 }, { unique: true });
db.sponsorships.createIndex({ provider_id: 1, status: 1 });

print("→ Creating indexes on wallet & payments...");
db.wallets.createIndex({ user_id: 1 }, { unique: true });
db.wallet_transactions.createIndex({ user_id: 1, created_at: -1 });

print("→ Creating indexes on auth helpers...");
db.otps.createIndex({ phone: 1 });
db.otps.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
db.password_resets.createIndex({ token: 1 }, { unique: true });
db.password_resets.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });

print("→ Creating indexes on push / prefs / reports / contact_flags...");
db.push_tokens.createIndex({ user_id: 1 });
db.push_tokens.createIndex({ expo_token: 1 }, { unique: true });
db.notification_prefs.createIndex({ user_id: 1 }, { unique: true });
db.reports.createIndex({ status: 1, created_at: -1 });
db.reports.createIndex({ target_id: 1 });
db.contact_flags.createIndex({ user_id: 1, created_at: -1 });

print("");
print("✅ Tous les index Jokoo créés.");
print("");
db.getCollectionNames().forEach((c) => {
  print("  " + c + " → " + db[c].getIndexes().length + " index(es)");
});
