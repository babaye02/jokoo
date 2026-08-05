import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api, Booking } from "@/src/api";
import { Avatar, Card, Txt, Badge } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";
import { useAmbassadorStatus } from "@/src/hooks/useAmbassadorStatus";

/** RoleSwitcher — Bouton pour basculer ou activer le second profil. */
function RoleSwitcher() {
  const { user, switchRole, activateRole } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const roles = user.roles || [user.role];
  const active = user.active_role || user.role;
  const hasBoth = roles.includes("client") && roles.includes("prestataire");
  const other = active === "client" ? "prestataire" : "client";

  const onSwitch = async () => {
    try {
      setBusy(true);
      const u = await switchRole();
      // Si on bascule vers prestataire pour la 1re fois, direction provider-profile.
      if (u.active_role === "prestataire") {
        router.push("/provider-profile");
      }
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible de basculer.");
    } finally {
      setBusy(false);
    }
  };

  const onActivate = async () => {
    try {
      setBusy(true);
      const u = await activateRole("prestataire");
      if (u.roles?.includes("prestataire")) {
        // Puis on bascule directement + on ouvre le hub profil pro
        await switchRole();
        router.push("/provider-profile");
      }
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible d'activer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginTop: spacing.md, width: "100%", paddingHorizontal: spacing.xl }}>
      {hasBoth ? (
        <Pressable
          onPress={onSwitch}
          disabled={busy}
          style={roleSwitcherStyles.btn}
          testID="role-switch"
        >
          {busy ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <>
              <Ionicons name="swap-horizontal" size={16} color={colors.white} />
              <Txt weight="700" color={colors.white} style={{ marginLeft: 8 }}>
                Basculer vers {other === "prestataire" ? "Prestataire" : "Client"}
              </Txt>
            </>
          )}
        </Pressable>
      ) : active === "client" ? (
        <Pressable
          onPress={onActivate}
          disabled={busy}
          style={roleSwitcherStyles.ctaProvider}
          testID="role-activate-provider"
        >
          {busy ? (
            <ActivityIndicator color={colors.midnight} size="small" />
          ) : (
            <>
              <Ionicons name="briefcase" size={16} color={colors.midnight} />
              <Txt weight="700" color={colors.midnight} style={{ marginLeft: 8 }}>
                Devenir prestataire sur Jokoo
              </Txt>
              <Ionicons name="chevron-forward" size={14} color={colors.midnight} style={{ marginLeft: 6 }} />
            </>
          )}
        </Pressable>
      ) : (
        <Pressable
          onPress={async () => {
            try {
              setBusy(true);
              await activateRole("client");
              await switchRole();
            } finally { setBusy(false); }
          }}
          style={roleSwitcherStyles.ctaClient}
          disabled={busy}
          testID="role-activate-client"
        >
          {busy ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <>
              <Ionicons name="person" size={16} color={colors.white} />
              <Txt weight="700" color={colors.white} style={{ marginLeft: 8 }}>
                Activer le profil Client
              </Txt>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const roleSwitcherStyles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.turquoise,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    ...shadow.soft,
  },
  ctaProvider: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FDE68A",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  ctaClient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.midnight,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
});

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
  completed: "Terminée",
  cancelled: "Annulée",
};
const STATUS_TONE: Record<string, "warning" | "verified" | "danger" | "success" | "neutral"> = {
  pending: "warning",
  accepted: "verified",
  rejected: "danger",
  completed: "success",
  cancelled: "neutral",
};
const STATUS_ICON: Record<string, any> = {
  pending: "hourglass-outline",
  accepted: "checkmark-circle-outline",
  rejected: "close-circle-outline",
  completed: "checkmark-done-outline",
  cancelled: "ban-outline",
};

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const { isAmbassador, data: ambData } = useAmbassadorStatus();

  const [refreshing, setRefreshing] = useState(false);
  // Le rôle "actif" prime sur `user.role` legacy (le client peut avoir
  // roles=[client,prestataire] mais être en mode client actuellement).
  const activeRole = (user as any)?.active_role || user?.role || "client";
  const isProvider = activeRole === "prestataire";

  const load = useCallback(async () => {
    try {
      // Envoi explicite du rôle actif — force le backend à filtrer côté
      // client_id (perspective client) OU provider_id (perspective pro).
      const list = await api.get<Booking[]>(`/bookings?as=${encodeURIComponent(activeRole)}`);
      setBookings(list.slice(0, 8));
    } catch {}
  }, [activeRole]);

  // useFocusEffect : ré-exécute load() chaque fois que le tab redevient actif.
  // Résout le bug où l'acceptation par le prestataire n'apparaissait pas côté
  // client tant que le tab n'était pas quitté et rouvert.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const logout = async () => { await signOut(); router.replace("/login"); };

  if (!user) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.turquoise} />}
      >
        {/* Header */}
        <SafeAreaView edges={["top"]} style={styles.header}>
          <View style={{ alignItems: "center" }}>
            <Avatar uri={user.avatar} name={user.name} size={92} />
            <Txt size="xl" weight="700" style={{ marginTop: spacing.md }}>{user.name}</Txt>
            <Txt size="sm" color={colors.textMuted}>{user.email}</Txt>
            <View style={{ marginTop: spacing.sm }}>
              <Badge
                icon={user.role === "prestataire" ? "briefcase" : "person"}
                label={user.role === "prestataire" ? "Prestataire" : "Client"}
                tone={user.role === "prestataire" ? "top" : "info"}
              />
            </View>
            {/* v2.2 — Bouton bascule / activation second profil */}
            <RoleSwitcher />
          </View>
        </SafeAreaView>

        {/* Dashboard shortcut for prestataire */}
        {user.role === "prestataire" ? (
          <View style={{ padding: spacing.xl }}>
            <Pressable onPress={() => router.push("/dashboard")} style={styles.dashCta} testID="open-dashboard">
              <View>
                <Txt size="lg" weight="700" color={colors.white}>Tableau de bord</Txt>
                <Txt size="sm" color="rgba(255,255,255,0.8)" style={{ marginTop: 2 }}>Revenus, calendrier, demandes</Txt>
              </View>
              <Ionicons name="arrow-forward-circle" size={32} color={colors.white} />            </Pressable>
          </View>
        ) : (
          <View style={{ height: spacing.xl }} />
        )}

        {/* Jokoo Partners card — visible seulement pour les ambassadeurs */}
        {isAmbassador && ambData?.ambassador ? (
          <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.xl }}>
            <Pressable
              onPress={() => router.push("/ambassador/dashboard")}
              style={styles.partnersCta}
              testID="open-jokoo-partners"
            >
              <View style={styles.partnersIcon}>
                <Txt size="xxl">🤝</Txt>
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Txt size="lg" weight="800" color={colors.white}>Jokoo Partners</Txt>
                <Txt size="xs" color="rgba(255,255,255,0.85)" style={{ marginTop: 2 }}>
                  {ambData.ambassador.badge} · Code {ambData.ambassador.code}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.white} />
            </Pressable>
          </View>
        ) : null}

        {/* Recent bookings */}
        <View style={{ paddingHorizontal: spacing.xl }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
            <Txt size="lg" weight="700">{user.role === "prestataire" ? "Demandes récentes" : "Vos réservations"}</Txt>
          </View>
          {bookings.length === 0 ? (
            <Card><Txt color={colors.textMuted}>Aucune réservation pour le moment.</Txt></Card>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {bookings.map((b) => (
                <Card key={b.id} style={{ padding: spacing.md }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Txt weight="700">{user.role === "prestataire" ? b.client_name : b.provider_name}</Txt>
                      <Txt size="xs" color={colors.textMuted}>{b.provider_service} · {b.date} {b.time}</Txt>
                    </View>
                    <Badge
                      icon={STATUS_ICON[b.status]}
                      label={STATUS_LABEL[b.status]}
                      tone={STATUS_TONE[b.status]}
                      size="sm"
                    />
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>

        {/* Menu */}
        <View style={{ padding: spacing.xl, gap: spacing.sm }}>
          <MenuRow icon="heart-outline" title="Favoris" onPress={() => router.push("/favorites")} testID="menu-favorites" />
          <MenuRow icon="car-sport-outline" title="Mobilité · Covoiturage" onPress={() => router.push("/mobility")} testID="menu-mobility" />
          <MenuRow icon="ticket-outline" title="Mes trajets" onPress={() => router.push("/mobility/rides/mine")} testID="menu-rides" />
          <MenuRow icon="cube-outline" title="Mes colis · Livraison" onPress={() => router.push("/mobility/delivery/mine")} testID="menu-parcels" />
          <MenuRow icon="people-outline" title="Jokoo Family · Baby-sitting" onPress={() => router.push("/family")} testID="menu-family" />
          <MenuRow icon="school-outline" title="Mes réservations Family" onPress={() => router.push("/family/mine")} testID="menu-family-mine" />
          <MenuRow icon="document-text-outline" title="Centre juridique" onPress={() => router.push("/legal")} testID="menu-legal" />
          {user.role === "prestataire" ? (
            <>
              <MenuRow icon="pricetags-outline" title="Mes prestations" onPress={() => router.push("/my-services")} testID="menu-my-services" />
              <MenuRow icon="shield-checkmark-outline" title="Vérification d'identité" onPress={() => router.push("/provider/verification")} testID="menu-provider-kyc" />
              <MenuRow icon="rocket-outline" title="Sponsoriser mon profil" onPress={() => router.push("/sponsor")} testID="menu-sponsor" />
              <MenuRow icon="person-circle-outline" title="Profil prestataire" onPress={() => router.push("/provider-profile")} testID="menu-provider-profile" />
            </>
          ) : null}
          {user.is_admin || user.staff_role ? (
            <MenuRow icon="shield-outline" title="Espace administrateur" onPress={() => router.push("/admin")} testID="menu-admin" />
          ) : null}
          <MenuRow icon="card-outline" title="Paiements" onPress={() => router.push("/profile/payments")} testID="menu-payments" />
          <MenuRow icon="settings-outline" title="Paramètres" onPress={() => router.push("/profile/settings")} testID="menu-settings" />
          <MenuRow icon="shield-checkmark-outline" title="Sécurité & confidentialité" onPress={() => router.push("/profile/security")} testID="menu-security" />
          <MenuRow icon="help-circle-outline" title="Aide" onPress={() => router.push("/profile/help")} testID="menu-help" />
          <Pressable onPress={logout} style={[styles.row, { marginTop: spacing.md }]} testID="menu-logout">
            <View style={[styles.iconWrap, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            </View>
            <Txt weight="600" color={colors.danger} style={{ flex: 1, marginLeft: 12 }}>Se déconnecter</Txt>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: "/profile/security", params: { focus: "delete" } })}
            style={styles.row}
            testID="menu-delete-account"
          >
            <View style={[styles.iconWrap, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </View>
            <Txt weight="600" color={colors.danger} style={{ flex: 1, marginLeft: 12 }}>Supprimer mon compte</Txt>
            <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function MenuRow({ icon, title, onPress, testID }: { icon: any; title: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable style={styles.row} onPress={onPress} testID={testID}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={colors.midnight} />
      </View>
      <Txt weight="600" style={{ flex: 1, marginLeft: 12 }}>{title}</Txt>
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.surface, paddingTop: spacing.lg, paddingBottom: spacing.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, ...shadow.soft },
  roleBadge: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.midnight, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.pill, marginTop: spacing.sm,
  },
  dashCta: {
    backgroundColor: colors.midnight, borderRadius: radius.lg, padding: spacing.lg,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    ...shadow.card,
  },
  partnersCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#7C3AED",
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  partnersIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14,
    flexDirection: "row", alignItems: "center", ...shadow.soft,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
});
