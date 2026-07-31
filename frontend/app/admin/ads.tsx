// Admin — CRUD publicités avec support image / bannière / vidéo / carrousel.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Switch, KeyboardAvoidingView, Platform, TextInput, Modal } from "react-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Ad, AdMedia, AdLinkType, Partner, Promo, Provider, ServiceItem } from "@/src/api";
import { describeDestination } from "@/src/navigation/adDestination";
import { Btn, Card, Input, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

type EditingAd = Partial<Ad> & { _new?: boolean };

const TYPES: { key: any; label: string; icon: any }[] = [
  { key: "image",    label: "Image",    icon: "image-outline" },
  { key: "banner",   label: "Bannière", icon: "tablet-landscape-outline" },
  { key: "video",    label: "Vidéo",    icon: "videocam-outline" },
  { key: "carousel", label: "Carrousel",icon: "images-outline" },
];

const PLACEMENTS = [
  { key: "home", label: "Accueil" },
  { key: "between_lists", label: "Entre listes" },
  { key: "category", label: "Catégorie" },
  { key: "search", label: "Recherche" },
  { key: "profile", label: "Profil" },
];

const AUDIENCES = [
  { key: "all",         label: "Tous les utilisateurs", icon: "people-outline" },
  { key: "client",      label: "Clients uniquement",    icon: "person-outline" },
  { key: "prestataire", label: "Prestataires uniquement", icon: "briefcase-outline" },
] as const;

const LINK_TYPES: { key: AdLinkType; label: string; icon: any; hint: string }[] = [
  { key: "none",      label: "Aucune destination",  icon: "close-circle-outline",  hint: "Bannière décorative, non cliquable" },
  { key: "provider",  label: "Fiche prestataire",   icon: "briefcase-outline",     hint: "Sélectionnez un prestataire" },
  { key: "category",  label: "Catégorie filtrée",   icon: "grid-outline",          hint: "Ouvre la recherche avec un filtre" },
  { key: "promo",     label: "Offre promo",         icon: "pricetag-outline",      hint: "Page /promo/{slug}" },
  { key: "partner",   label: "Partenaire",          icon: "business-outline",      hint: "Fiche partenaire Jokoo" },
  { key: "external",  label: "URL externe",         icon: "globe-outline",         hint: "Ouvre le lien dans le navigateur" },
  { key: "app_route", label: "Section de l'app",    icon: "apps-outline",          hint: "Route interne (ex : /mobility)" },
];

const APP_ROUTES = [
  { key: "/(tabs)",          label: "Accueil" },
  { key: "/(tabs)/search",   label: "Recherche" },
  { key: "/(tabs)/messages", label: "Messages" },
  { key: "/(tabs)/profile",  label: "Profil" },
  { key: "/mobility",        label: "Mobilité (Covoiturage & Livraison)" },
  { key: "/family",          label: "Jokoo Family" },
];

export default function AdminAds() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Ad[]>([]);
  const [cats, setCats] = useState<ServiceItem[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [editing, setEditing] = useState<EditingAd | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.get<Ad[]>("/admin/ads")); } catch (e: any) { Alert.alert("Erreur", e.message); }
  }, []);
  useFocusEffect(useCallback(() => {
    load();
    api.get<ServiceItem[]>("/services").then(setCats).catch(() => {});
    api.get<Provider[]>("/providers?limit=200").then(setProviders).catch(() => {});
    api.get<Promo[]>("/admin/promos").then(setPromos).catch(() => setPromos([]));
    api.get<Partner[]>("/admin/partners").then(setPartners).catch(() => setPartners([]));
  }, [load]));

  const openNew = () => setEditing({
    _new: true, type: "banner", title: "", description: "", button_label: "Voir",
    link: "",
    link_type: "none",
    link_target: null,
    link_label: null,
    media: [], placements: ["home"], category_key: null,
    target_audience: "all", display_mode: "single",
    start_at: "", end_at: "", active: true, suspended: false,
  });

  const suspend = async (a: Ad) => { await api.patch(`/admin/ads/${a.id}/suspend`); load(); };
  const resume  = async (a: Ad) => { await api.patch(`/admin/ads/${a.id}/resume`); load(); };
  const remove = (a: Ad) => {
    Alert.alert("Supprimer", `Supprimer "${a.title}" ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: async () => { await api.del(`/admin/ads/${a.id}`); load(); } },
    ]);
  };

  const pickMedia = async (kind: "image" | "video") => {
    if (!editing) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission requise", "Autorisez l'accès à la galerie pour importer un média.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === "image" ? "images" : "videos",
      quality: 0.7, base64: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const uri = kind === "image" && asset.base64
      ? `data:image/jpeg;base64,${asset.base64}`
      : asset.uri;
    const item: AdMedia = { kind, url: uri };
    setEditing({ ...editing, media: [...(editing.media || []), item] });
  };

  const addMediaByUrl = () => {
    if (!editing) return;
    setEditing({ ...editing, media: [...(editing.media || []), { kind: "image", url: "" }] });
  };

  const updateMedia = (i: number, patch: Partial<AdMedia>) => {
    if (!editing) return;
    const next = [...(editing.media || [])];
    next[i] = { ...next[i], ...patch };
    setEditing({ ...editing, media: next });
  };

  const removeMedia = (i: number) => {
    if (!editing) return;
    setEditing({ ...editing, media: (editing.media || []).filter((_, idx) => idx !== i) });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.title?.trim()) return Alert.alert("Titre requis");
    if (!editing.media || editing.media.length === 0 || !editing.media[0].url) {
      return Alert.alert("Média requis", "Ajoutez au moins un média.");
    }
    if (editing.start_at && editing.end_at && editing.end_at < editing.start_at) {
      return Alert.alert("Dates invalides", "La date de fin doit être après la date de début.");
    }
    setSaving(true);
    try {
      const payload = {
        type: editing.type || "banner",
        title: editing.title,
        description: editing.description || "",
        button_label: editing.button_label || "Voir",
        link: editing.link || null,
        link_type: editing.link_type || "none",
        link_target: editing.link_target || null,
        link_label: editing.link_label || null,
        media: (editing.media || []).filter((m) => m.url),
        placements: editing.placements || ["home"],
        category_key: editing.category_key || null,
        target_audience: editing.target_audience || "all",
        display_mode: editing.display_mode || "single",
        start_at: editing.start_at || null,
        end_at: editing.end_at || null,
        active: editing.active !== false,
        suspended: editing.suspended === true,
      };
      if (editing._new) await api.post("/admin/ads", payload);
      else await api.patch(`/admin/ads/${editing.id}`, payload);
      setEditing(null); load();
    } catch (e: any) { Alert.alert("Erreur", e.message); }
    finally { setSaving(false); }
  };

  const togglePlacement = (k: string) => {
    if (!editing) return;
    const cur = editing.placements || [];
    setEditing({ ...editing, placements: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="ads-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Publicités</Txt>
        <Pressable onPress={openNew} style={styles.addBtn} testID="ads-add">
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        {items.length === 0 ? (
          <Card>
            <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
              <Ionicons name="megaphone-outline" size={44} color={colors.textSubtle} />
              <Txt size="md" weight="600" style={{ marginTop: spacing.md }}>Aucune publicité</Txt>
              <Btn title="Créer une publicité" onPress={openNew} style={{ marginTop: spacing.md }} />
            </View>
          </Card>
        ) : items.map((a) => {
          const first = a.media?.[0];
          const suspended = !!a.suspended;
          const status = !a.active ? "INACTIVE" : suspended ? "SUSPENDUE" : "ACTIVE";
          const statusColor = !a.active ? colors.textMuted : suspended ? colors.warning : colors.success;
          return (
            <Card key={a.id} style={{ padding: 0, overflow: "hidden" }}>
              {first?.kind === "video" ? (
                <View style={{ width: "100%", height: 120, backgroundColor: colors.midnight, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="videocam" size={32} color={colors.white} />
                </View>
              ) : first?.url ? (
                <Image source={{ uri: first.url }} style={{ width: "100%", height: 120 }} contentFit="cover" />
              ) : null}
              <View style={{ padding: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Txt weight="700" numberOfLines={1} style={{ flex: 1 }}>{a.title}</Txt>
                  <View style={[styles.pill, { backgroundColor: `${statusColor}22` }]}>
                    <Txt size="xxs" weight="700" color={statusColor}>{status}</Txt>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <View style={styles.chipMini}><Txt size="xxs" weight="600">{a.type}</Txt></View>
                  <View style={styles.chipMini}><Txt size="xxs" weight="600">cible: {a.target_audience || "all"}</Txt></View>
                  {a.placements.map((p) => (
                    <View key={p} style={styles.chipMini}><Txt size="xxs" weight="600">{p}</Txt></View>
                  ))}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                  <Ionicons name="navigate-outline" size={12} color={colors.textMuted} />
                  <Txt size="xxs" color={colors.textMuted} style={{ marginLeft: 4, flex: 1 }} numberOfLines={1}>
                    {describeDestination({ link_type: a.link_type, link_target: a.link_target, link: a.link, link_label: a.link_label } as any)}
                  </Txt>
                </View>
                <View style={{ flexDirection: "row", marginTop: 12, gap: 16 }}>
                  <Metric icon="eye" value={a.impressions || 0} label="vues" />
                  <Metric icon="hand-left" value={a.clicks || 0} label="clics" />
                  <Metric icon="analytics" value={`${a.ctr || 0}%`} label="CTR" />
                </View>
              </View>
              <View style={styles.rowActions}>
                <Pressable onPress={() => suspended ? resume(a) : suspend(a)} style={styles.action} testID={`ad-${suspended ? "resume" : "suspend"}-${a.id}`}>
                  <Ionicons name={suspended ? "play" : "pause"} size={16} color={colors.midnight} />
                  <Txt size="xs" weight="600" style={{ marginLeft: 6 }}>{suspended ? "Réactiver" : "Suspendre"}</Txt>
                </Pressable>
                <View style={{ width: 1, backgroundColor: colors.divider }} />
                <Pressable onPress={() => setEditing({ ...a })} style={styles.action} testID={`ad-edit-${a.id}`}>
                  <Ionicons name="create-outline" size={16} color={colors.midnight} />
                  <Txt size="xs" weight="600" style={{ marginLeft: 6 }}>Modifier</Txt>
                </Pressable>
                <View style={{ width: 1, backgroundColor: colors.divider }} />
                <Pressable onPress={() => remove(a)} style={styles.action} testID={`ad-delete-${a.id}`}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <Txt size="xs" weight="600" color={colors.danger} style={{ marginLeft: 6 }}>Supprimer</Txt>
                </Pressable>
              </View>
            </Card>
          );
        })}
      </ScrollView>

      {editing ? <AdEditor
        editing={editing}
        setEditing={setEditing}
        save={save}
        saving={saving}
        cats={cats}
        providers={providers}
        promos={promos}
        partners={partners}
        pickMedia={pickMedia}
        addMediaByUrl={addMediaByUrl}
        updateMedia={updateMedia}
        removeMedia={removeMedia}
        togglePlacement={togglePlacement}
        insets={insets}
      /> : null}
    </View>
  );
}

function Metric({ icon, value, label }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Txt size="xs" weight="700" style={{ marginLeft: 4 }}>{value}</Txt>
      <Txt size="xxs" color={colors.textSubtle} style={{ marginLeft: 3 }}>{label}</Txt>
    </View>
  );
}

function AdEditor({ editing, setEditing, save, saving, cats, providers, promos, partners, pickMedia, addMediaByUrl, updateMedia, removeMedia, togglePlacement, insets }: any) {
  return (
    <View style={styles.overlay}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <SafeAreaView edges={["top"]} style={styles.header}>
          <Pressable onPress={() => setEditing(null)} style={styles.back}>
            <Ionicons name="close" size={22} color={colors.midnight} />
          </Pressable>
          <Txt size="lg" weight="700">{editing._new ? "Nouvelle publicité" : "Modifier"}</Txt>
          <View style={{ width: 40 }} />
        </SafeAreaView>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>Type</Txt>
          <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.md }}>
            {TYPES.map((f) => (
              <Pressable key={f.key} onPress={() => setEditing({ ...editing, type: f.key })} style={[styles.ptBtn, editing.type === f.key && styles.ptBtnActive]}>
                <Ionicons name={f.icon} size={18} color={editing.type === f.key ? colors.white : colors.midnight} />
                <Txt size="xxs" weight="700" color={editing.type === f.key ? colors.white : colors.midnight} style={{ marginTop: 4 }}>{f.label}</Txt>
              </Pressable>
            ))}
          </View>

          <Input label="Titre" icon="pricetag-outline" value={editing.title || ""} onChangeText={(v: string) => setEditing({ ...editing, title: v })} testID="ad-title" />
          <Input label="Description" icon="document-text-outline" value={editing.description || ""} onChangeText={(v: string) => setEditing({ ...editing, description: v })} multiline numberOfLines={3} style={{ height: 80, textAlignVertical: "top", paddingTop: 12 }} />
          <Input label="Texte du bouton" icon="link-outline" placeholder="Voir · Découvrir · Profiter" value={editing.button_label || ""} onChangeText={(v: string) => setEditing({ ...editing, button_label: v })} />

          {/* Destination (nouveau système de campagne) */}
          <DestinationPicker
            editing={editing}
            setEditing={setEditing}
            providers={providers}
            promos={promos}
            partners={partners}
            cats={cats}
          />

          {/* Médias */}
          <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>Médias</Txt>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: spacing.md }}>
            <Pressable onPress={() => pickMedia("image")} style={styles.upload} testID="ad-upload-image">
              <Ionicons name="image" size={18} color={colors.turquoise} />
              <Txt size="xs" weight="700" style={{ marginTop: 4 }}>Importer image</Txt>
            </Pressable>
            <Pressable onPress={() => pickMedia("video")} style={styles.upload} testID="ad-upload-video">
              <Ionicons name="videocam" size={18} color={colors.turquoise} />
              <Txt size="xs" weight="700" style={{ marginTop: 4 }}>Importer vidéo</Txt>
            </Pressable>
            <Pressable onPress={addMediaByUrl} style={styles.upload} testID="ad-upload-url">
              <Ionicons name="link" size={18} color={colors.turquoise} />
              <Txt size="xs" weight="700" style={{ marginTop: 4 }}>Par URL</Txt>
            </Pressable>
          </View>

          {(editing.media || []).map((m: AdMedia, i: number) => (
            <View key={i} style={styles.mediaRow}>
              {m.kind === "video" ? (
                m.url && !m.url.startsWith("data:") ? (
                  <MediaVideoPreview uri={m.url} />
                ) : (
                  <View style={styles.mediaPh}><Ionicons name="videocam" size={24} color={colors.textSubtle} /></View>
                )
              ) : (
                m.url ? <Image source={{ uri: m.url }} style={{ width: 56, height: 56, borderRadius: 10 }} contentFit="cover" /> : <View style={styles.mediaPh}><Ionicons name="image" size={24} color={colors.textSubtle} /></View>
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
                  <Pressable onPress={() => updateMedia(i, { kind: "image" })} style={[styles.miniTag, m.kind === "image" && styles.miniTagActive]}>
                    <Txt size="xxs" weight="700" color={m.kind === "image" ? colors.white : colors.midnight}>image</Txt>
                  </Pressable>
                  <Pressable onPress={() => updateMedia(i, { kind: "video" })} style={[styles.miniTag, m.kind === "video" && styles.miniTagActive]}>
                    <Txt size="xxs" weight="700" color={m.kind === "video" ? colors.white : colors.midnight}>vidéo</Txt>
                  </Pressable>
                </View>
                <TextInput
                  value={m.url}
                  onChangeText={(v) => updateMedia(i, { url: v })}
                  placeholder="URL ou base64"
                  placeholderTextColor={colors.textSubtle}
                  style={styles.mediaInput}
                  autoCapitalize="none"
                />
              </View>
              <Pressable onPress={() => removeMedia(i)} style={{ padding: 8 }}>
                <Ionicons name="close" size={18} color={colors.danger} />
              </Pressable>
            </View>
          ))}

          {/* Ciblage */}
          <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6, marginTop: spacing.md }}>Cible</Txt>
          <View style={{ gap: 6, marginBottom: spacing.md }}>
            {AUDIENCES.map((a) => (
              <Pressable key={a.key} onPress={() => setEditing({ ...editing, target_audience: a.key })} style={[styles.optRow, editing.target_audience === a.key && styles.optRowActive]}>
                <Ionicons name={a.icon as any} size={18} color={editing.target_audience === a.key ? colors.turquoise : colors.midnight} />
                <Txt weight="600" style={{ flex: 1, marginLeft: 10 }}>{a.label}</Txt>
                <View style={[styles.radio, editing.target_audience === a.key && styles.radioActive]}>
                  {editing.target_audience === a.key ? <View style={styles.radioDot} /> : null}
                </View>
              </Pressable>
            ))}
          </View>

          {/* Mode d'affichage */}
          <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>{"Mode d'affichage"}</Txt>
          <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.md }}>
            <Pressable onPress={() => setEditing({ ...editing, display_mode: "single" })} style={[styles.ptBtn, editing.display_mode === "single" && styles.ptBtnActive]}>
              <Ionicons name="square-outline" size={16} color={editing.display_mode === "single" ? colors.white : colors.midnight} />
              <Txt size="xxs" weight="700" color={editing.display_mode === "single" ? colors.white : colors.midnight} style={{ marginTop: 4 }}>Unique</Txt>
            </Pressable>
            <Pressable onPress={() => setEditing({ ...editing, display_mode: "carousel_queue" })} style={[styles.ptBtn, editing.display_mode === "carousel_queue" && styles.ptBtnActive]}>
              <Ionicons name="albums-outline" size={16} color={editing.display_mode === "carousel_queue" ? colors.white : colors.midnight} />
              <Txt size="xxs" weight="700" color={editing.display_mode === "carousel_queue" ? colors.white : colors.midnight} style={{ marginTop: 4 }}>Défilement</Txt>
            </Pressable>
          </View>

          {/* Emplacements */}
          <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>Emplacements</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md }}>
            {PLACEMENTS.map((p) => (
              <Pressable key={p.key} onPress={() => togglePlacement(p.key)} style={[styles.chip, editing.placements?.includes(p.key) && styles.chipActive]}>
                <Txt weight="600" color={editing.placements?.includes(p.key) ? colors.white : colors.midnight}>{p.label}</Txt>
              </Pressable>
            ))}
          </View>

          {editing.placements?.includes("category") ? (
            <>
              <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>Catégorie</Txt>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: spacing.md }}>
                {cats.map((c: ServiceItem) => (
                  <Pressable key={c.key} onPress={() => setEditing({ ...editing, category_key: c.key })} style={[styles.chip, editing.category_key === c.key && styles.chipActive]}>
                    <Txt weight="600" color={editing.category_key === c.key ? colors.white : colors.midnight}>{c.label}</Txt>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          <Input label="Début (ISO — ex: 2026-03-01T09:00)" icon="calendar-outline" autoCapitalize="none" value={editing.start_at || ""} onChangeText={(v: string) => setEditing({ ...editing, start_at: v })} />
          <Input label="Fin (ISO — ex: 2026-03-31T23:00)"   icon="calendar-outline" autoCapitalize="none" value={editing.end_at || ""} onChangeText={(v: string) => setEditing({ ...editing, end_at: v })} />

          <View style={styles.switchRow}>
            <Txt weight="600" style={{ flex: 1 }}>Publicité active</Txt>
            <Switch value={editing.active !== false} onValueChange={(v) => setEditing({ ...editing, active: v })} trackColor={{ true: colors.turquoise, false: colors.border }} />
          </View>

          {/* Aperçu */}
          {editing.media?.[0]?.url ? (
            <>
              <Txt size="sm" weight="700" color={colors.midnight} style={{ marginTop: spacing.md, marginBottom: 8 }}>Aperçu</Txt>
              <AdPreview ad={editing as any} />
            </>
          ) : null}
        </ScrollView>
        <View style={[styles.bottom, { paddingBottom: 12 + insets.bottom }]}>
          <Btn title="Enregistrer" onPress={save} loading={saving} fullWidth size="lg" testID="ad-save" />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function AdPreview({ ad }: { ad: Ad }) {
  const m = ad.media?.[0];
  return (
    <View style={{ height: 160, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.midnight }}>
      {m?.kind === "video" && m.url && !m.url.startsWith("data:") ? (
        <MediaVideoPreview uri={m.url} full />
      ) : m?.url ? (
        <Image source={{ uri: m.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(11,31,58,0.55)" }} />
      <View style={{ padding: spacing.lg, flex: 1, justifyContent: "flex-end" }}>
        <Txt size="lg" weight="700" color={colors.white}>{ad.title}</Txt>
        {ad.description ? <Txt size="xs" color="rgba(255,255,255,0.85)" style={{ marginTop: 4 }}>{ad.description}</Txt> : null}
      </View>
    </View>
  );
}

function MediaVideoPreview({ uri, full }: { uri: string; full?: boolean }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  return (
    <VideoView
      player={player}
      style={full ? StyleSheet.absoluteFill : ({ width: 56, height: 56, borderRadius: 10 } as any)}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center" },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipMini: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.brandTertiary },
  rowActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.divider },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface },
  chip: { flexDirection: "row", alignItems: "center", height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexShrink: 0 },
  chipActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  ptBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  ptBtnActive: { backgroundColor: colors.turquoise, borderColor: colors.turquoise },
  switchRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface2, marginBottom: spacing.md },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.xl, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  upload: { flex: 1, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", backgroundColor: colors.surface2, alignItems: "center" },
  mediaRow: { flexDirection: "row", alignItems: "center", padding: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  mediaPh: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  mediaInput: { height: 38, borderRadius: 8, backgroundColor: colors.surface2, paddingHorizontal: 10, fontSize: 13, color: colors.text },
  miniTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  miniTagActive: { backgroundColor: colors.midnight, borderColor: colors.midnight },
  optRow: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  optRowActive: { borderColor: colors.turquoise, backgroundColor: "#F0FBF8" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: colors.turquoise },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.turquoise },
  dpBlock: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  dpBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dpChoice: { flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  dpChoiceActive: { backgroundColor: "#F0FBF8" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "75%" },
});

/**
 * Destination picker (nouveau système de campagne publicitaire).
 * Permet à l'admin de choisir OÙ envoyer l'utilisateur lorsqu'il clique sur la bannière,
 * sans jamais toucher au code : fiche prestataire · catégorie · promo · partenaire · URL externe · section app · aucune.
 */
function DestinationPicker({ editing, setEditing, providers, promos, partners, cats }: any) {
  const [pickerOpen, setPickerOpen] = useState<null | "type" | "provider" | "category" | "promo" | "partner" | "app_route">(null);
  const currentType: AdLinkType = editing.link_type || "none";
  const typeMeta = LINK_TYPES.find((t) => t.key === currentType) || LINK_TYPES[0];

  const targetSummary = describeDestination({
    link_type: editing.link_type,
    link_target: editing.link_target,
    link: editing.link,
    link_label: editing.link_label,
  } as any);

  const setType = (t: AdLinkType) => {
    setEditing({ ...editing, link_type: t, link_target: null, link_label: null });
    setPickerOpen(null);
    // Si le type impose une saisie libre (external), on garde le sélecteur fermé.
  };

  const setTarget = (target: string, label?: string) => {
    setEditing({ ...editing, link_target: target, link_label: label || target });
    setPickerOpen(null);
  };

  return (
    <View style={styles.dpBlock}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="rocket-outline" size={16} color={colors.turquoise} />
        <Txt size="sm" weight="700" style={{ marginLeft: 6 }}>Destination du clic</Txt>
      </View>
      <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4, marginBottom: 12 }}>
        {"Choisissez où l'utilisateur atterrit lorsqu'il tape la bannière."}
      </Txt>

      {/* 1) Choix du TYPE de destination */}
      <Pressable style={styles.dpBtn} onPress={() => setPickerOpen("type")} testID="destination-type-btn">
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Ionicons name={typeMeta.icon} size={18} color={colors.midnight} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Txt size="sm" weight="700">{typeMeta.label}</Txt>
            <Txt size="xxs" color={colors.textMuted} numberOfLines={1}>{typeMeta.hint}</Txt>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      {/* 2) Cible spécifique au type */}
      {currentType === "provider" ? (
        <Pressable style={[styles.dpBtn, { marginTop: 8 }]} onPress={() => setPickerOpen("provider")} testID="destination-provider-btn">
          <Txt size="sm" numberOfLines={1} style={{ flex: 1 }}>
            {editing.link_label || (editing.link_target ? `Prestataire ${editing.link_target.slice(0, 8)}…` : "Choisir un prestataire…")}
          </Txt>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {currentType === "category" ? (
        <Pressable style={[styles.dpBtn, { marginTop: 8 }]} onPress={() => setPickerOpen("category")} testID="destination-category-btn">
          <Txt size="sm" numberOfLines={1} style={{ flex: 1 }}>
            {editing.link_label || "Choisir une catégorie…"}
          </Txt>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {currentType === "promo" ? (
        <Pressable style={[styles.dpBtn, { marginTop: 8 }]} onPress={() => setPickerOpen("promo")} testID="destination-promo-btn">
          <Txt size="sm" numberOfLines={1} style={{ flex: 1 }}>
            {editing.link_label || (editing.link_target ? `Promo /promo/${editing.link_target}` : "Choisir une offre promo…")}
          </Txt>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {currentType === "partner" ? (
        <Pressable style={[styles.dpBtn, { marginTop: 8 }]} onPress={() => setPickerOpen("partner")} testID="destination-partner-btn">
          <Txt size="sm" numberOfLines={1} style={{ flex: 1 }}>
            {editing.link_label || "Choisir un partenaire…"}
          </Txt>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {currentType === "app_route" ? (
        <Pressable style={[styles.dpBtn, { marginTop: 8 }]} onPress={() => setPickerOpen("app_route")} testID="destination-approute-btn">
          <Txt size="sm" numberOfLines={1} style={{ flex: 1 }}>
            {editing.link_label || "Choisir une section de l'app…"}
          </Txt>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {currentType === "external" ? (
        <View style={{ marginTop: 8 }}>
          <TextInput
            value={editing.link_target || ""}
            onChangeText={(v) => setEditing({ ...editing, link_target: v, link_label: v })}
            placeholder="https://jokooservices.com"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="none"
            keyboardType="url"
            style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 44, fontSize: 14, color: colors.text }}
            testID="destination-external-input"
          />
        </View>
      ) : null}

      {/* Récap */}
      {currentType !== "none" ? (
        <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center" }}>
          <Ionicons name="checkmark-circle" size={14} color={editing.link_target ? colors.turquoise : colors.warning} />
          <Txt size="xxs" color={colors.textMuted} style={{ marginLeft: 4 }} numberOfLines={1}>
            {editing.link_target ? targetSummary : "Cible à définir"}
          </Txt>
        </View>
      ) : null}

      {/* --- Bottom sheet picker --- */}
      <Modal transparent visible={pickerOpen !== null} animationType="slide" onRequestClose={() => setPickerOpen(null)}>
        <Pressable style={styles.modalWrap} onPress={() => setPickerOpen(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={{ padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: "row", alignItems: "center" }}>
              <Txt size="lg" weight="700" style={{ flex: 1 }}>
                {pickerOpen === "type" ? "Type de destination"
                  : pickerOpen === "provider" ? "Choisir un prestataire"
                  : pickerOpen === "category" ? "Choisir une catégorie"
                  : pickerOpen === "promo" ? "Choisir une promo"
                  : pickerOpen === "partner" ? "Choisir un partenaire"
                  : pickerOpen === "app_route" ? "Section de l'app"
                  : ""}
              </Txt>
              <Pressable onPress={() => setPickerOpen(null)} style={styles.back}>
                <Ionicons name="close" size={20} color={colors.midnight} />
              </Pressable>
            </View>
            <ScrollView>
              {pickerOpen === "type" ? LINK_TYPES.map((t) => (
                <Pressable key={t.key} onPress={() => setType(t.key)} style={[styles.dpChoice, currentType === t.key && styles.dpChoiceActive]}>
                  <Ionicons name={t.icon} size={18} color={colors.turquoise} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Txt size="sm" weight="700">{t.label}</Txt>
                    <Txt size="xxs" color={colors.textMuted}>{t.hint}</Txt>
                  </View>
                  {currentType === t.key ? <Ionicons name="checkmark" size={18} color={colors.turquoise} /> : null}
                </Pressable>
              )) : null}

              {pickerOpen === "provider" ? (providers || []).map((p: Provider) => (
                <Pressable key={p.id} onPress={() => setTarget(p.id, `${p.name} · ${p.service}`)} style={[styles.dpChoice, editing.link_target === p.id && styles.dpChoiceActive]}>
                  <Ionicons name="briefcase-outline" size={18} color={colors.turquoise} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Txt size="sm" weight="700">{p.name}</Txt>
                    <Txt size="xxs" color={colors.textMuted}>{p.service} · {p.city}</Txt>
                  </View>
                </Pressable>
              )) : null}

              {pickerOpen === "category" ? (cats || []).map((c: ServiceItem) => (
                <Pressable key={c.key} onPress={() => setTarget(c.key, c.label)} style={[styles.dpChoice, editing.link_target === c.key && styles.dpChoiceActive]}>
                  <Ionicons name="grid-outline" size={18} color={colors.turquoise} />
                  <Txt size="sm" weight="700" style={{ marginLeft: 10, flex: 1 }}>{c.label}</Txt>
                </Pressable>
              )) : null}

              {pickerOpen === "promo" ? (
                (promos || []).length === 0 ? (
                  <View style={{ padding: spacing.xl, alignItems: "center" }}>
                    <Ionicons name="pricetag-outline" size={32} color={colors.textMuted} />
                    <Txt size="sm" color={colors.textMuted} style={{ marginTop: 8, textAlign: "center" }}>
                      Aucune promo. Créez-en une dans « Promos » puis revenez.
                    </Txt>
                  </View>
                ) : (
                  (promos || []).map((p: Promo) => (
                    <Pressable key={p.id} onPress={() => setTarget(p.slug, p.title)} style={[styles.dpChoice, editing.link_target === p.slug && styles.dpChoiceActive]}>
                      <Ionicons name="pricetag-outline" size={18} color={colors.turquoise} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Txt size="sm" weight="700">{p.title}</Txt>
                        <Txt size="xxs" color={colors.textMuted}>/promo/{p.slug}</Txt>
                      </View>
                    </Pressable>
                  ))
                )
              ) : null}

              {pickerOpen === "partner" ? (
                (partners || []).length === 0 ? (
                  <View style={{ padding: spacing.xl, alignItems: "center" }}>
                    <Ionicons name="business-outline" size={32} color={colors.textMuted} />
                    <Txt size="sm" color={colors.textMuted} style={{ marginTop: 8, textAlign: "center" }}>
                      Aucun partenaire. Ajoutez-en dans « Partenaires » puis revenez.
                    </Txt>
                  </View>
                ) : (
                  (partners || []).map((p: Partner) => (
                    <Pressable key={p.id} onPress={() => setTarget(p.id, p.name)} style={[styles.dpChoice, editing.link_target === p.id && styles.dpChoiceActive]}>
                      <Ionicons name="business-outline" size={18} color={colors.turquoise} />
                      <Txt size="sm" weight="700" style={{ marginLeft: 10, flex: 1 }}>{p.name}</Txt>
                    </Pressable>
                  ))
                )
              ) : null}

              {pickerOpen === "app_route" ? APP_ROUTES.map((r) => (
                <Pressable key={r.key} onPress={() => setTarget(r.key, r.label)} style={[styles.dpChoice, editing.link_target === r.key && styles.dpChoiceActive]}>
                  <Ionicons name="apps-outline" size={18} color={colors.turquoise} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Txt size="sm" weight="700">{r.label}</Txt>
                    <Txt size="xxs" color={colors.textMuted}>{r.key}</Txt>
                  </View>
                </Pressable>
              )) : null}

              <View style={{ height: 40 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
