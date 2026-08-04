// Admin — Informations entreprise (coordonnées légales, réseaux sociaux, branding)
// Alimente /api/public/company-info consommé par le site web jokooservices.com.
import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, TextInput, Text } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { Btn, Card, Txt } from "@/src/components/ui";
import { colors, shadow, spacing } from "@/src/theme";

type Socials = { facebook?: string; instagram?: string; linkedin?: string; tiktok?: string; x?: string; youtube?: string };
type AppDownload = { ios_url?: string; android_url?: string };
type Brand = { primary_color?: string; secondary_color?: string; logo_url?: string };
type Emails = {
  noreply?: string; support?: string; contact?: string; legal?: string; dpo?: string;
  paiements?: string; verification?: string; prestataires?: string; security?: string;
  fraude?: string; family?: string; press?: string;
};
type CompanyInfo = {
  company_name?: string; trade_name?: string; legal_form?: string;
  rccm?: string; ninea?: string; address?: string; city?: string; country?: string;
  email?: string; phone?: string; whatsapp?: string; website?: string;
  socials?: Socials; app_download?: AppDownload; brand?: Brand; emails?: Emails;
  hosting_provider?: string; director_name?: string; updated_at?: string;
};

export default function AdminCompanyInfo() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CompanyInfo>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<CompanyInfo>("/admin/company-info");
      setData(r || {});
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible de charger les informations.");
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setField = (k: keyof CompanyInfo, v: any) => setData((d) => ({ ...d, [k]: v }));
  const setSocial = (k: keyof Socials, v: string) => setData((d) => ({ ...d, socials: { ...(d.socials || {}), [k]: v } }));
  const setDownload = (k: keyof AppDownload, v: string) => setData((d) => ({ ...d, app_download: { ...(d.app_download || {}), [k]: v } }));
  const setBrand = (k: keyof Brand, v: string) => setData((d) => ({ ...d, brand: { ...(d.brand || {}), [k]: v } }));
  const setEmail = (k: keyof Emails, v: string) => setData((d) => ({ ...d, emails: { ...(d.emails || {}), [k]: v } }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/company-info", data);
      Alert.alert("Enregistré", "Les informations sont maintenant synchronisées avec le site web et l'app.");
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="ci-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Informations entreprise</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 60 + insets.bottom, gap: spacing.md }}>
        <Card style={{ padding: spacing.md, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="globe" size={20} color={colors.turquoise} />
          <Txt size="xs" color={colors.textMuted} style={{ flex: 1 }}>
            Ces informations alimentent les mentions légales de l&apos;app **ET** de jokooservices.com via `/api/public/company-info`.
          </Txt>
        </Card>

        {/* Identité */}
        <Section title="Identité de l'entreprise" icon="business">
          <Field label="Raison sociale (nom légal)" value={data.company_name} onChangeText={(v) => setField("company_name", v)} placeholder="Jokoo Services SARL" testID="f-company" />
          <Field label="Nom commercial" value={data.trade_name} onChangeText={(v) => setField("trade_name", v)} placeholder="Jokoo" testID="f-trade" />
          <Field label="Forme juridique" value={data.legal_form} onChangeText={(v) => setField("legal_form", v)} placeholder="SARL, SAS, SUARL…" testID="f-legal" />
          <Field label="RCCM" value={data.rccm} onChangeText={(v) => setField("rccm", v)} placeholder="SN-DKR-2024-B-XXXX" testID="f-rccm" />
          <Field label="NINEA" value={data.ninea} onChangeText={(v) => setField("ninea", v)} placeholder="XXXXXXX" testID="f-ninea" />
          <Field label="Directeur de la publication" value={data.director_name} onChangeText={(v) => setField("director_name", v)} placeholder="Nom Prénom" testID="f-director" />
          <Field label="Hébergeur (obligatoire mentions légales)" value={data.hosting_provider} onChangeText={(v) => setField("hosting_provider", v)} placeholder="Ex : OVH, AWS, DigitalOcean…" testID="f-host" />
        </Section>

        {/* Coordonnées */}
        <Section title="Coordonnées" icon="call">
          <Field label="Adresse siège" value={data.address} onChangeText={(v) => setField("address", v)} placeholder="Rue, quartier" testID="f-address" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Ville" value={data.city} onChangeText={(v) => setField("city", v)} placeholder="Dakar" testID="f-city" /></View>
            <View style={{ flex: 1 }}><Field label="Pays" value={data.country} onChangeText={(v) => setField("country", v)} placeholder="Sénégal" testID="f-country" /></View>
          </View>
          <Field label="Email support" value={data.email} onChangeText={(v) => setField("email", v)} placeholder="support@jokooservices.com" keyboardType="email-address" testID="f-email" />
          <Field label="Téléphone" value={data.phone} onChangeText={(v) => setField("phone", v)} placeholder="+221 XX XXX XX XX" keyboardType="phone-pad" testID="f-phone" />
          <Field label="WhatsApp" value={data.whatsapp} onChangeText={(v) => setField("whatsapp", v)} placeholder="+221 XX XXX XX XX" keyboardType="phone-pad" testID="f-wa" />
          <Field label="Site web" value={data.website} onChangeText={(v) => setField("website", v)} placeholder="https://jokooservices.com" keyboardType="url" testID="f-web" />
        </Section>

        {/* Réseaux sociaux */}
        <Section title="Réseaux sociaux" icon="share-social">
          <Field label="Facebook"  value={data.socials?.facebook}  onChangeText={(v) => setSocial("facebook",  v)} placeholder="https://facebook.com/jokoo"  testID="s-fb" />
          <Field label="Instagram" value={data.socials?.instagram} onChangeText={(v) => setSocial("instagram", v)} placeholder="https://instagram.com/jokoo" testID="s-ig" />
          <Field label="LinkedIn"  value={data.socials?.linkedin}  onChangeText={(v) => setSocial("linkedin",  v)} placeholder="https://linkedin.com/company/jokoo" testID="s-li" />
          <Field label="TikTok"    value={data.socials?.tiktok}    onChangeText={(v) => setSocial("tiktok",    v)} placeholder="https://tiktok.com/@jokoo"  testID="s-tt" />
          <Field label="X (Twitter)" value={data.socials?.x}       onChangeText={(v) => setSocial("x",         v)} placeholder="https://x.com/jokoo"        testID="s-x" />
          <Field label="YouTube"   value={data.socials?.youtube}   onChangeText={(v) => setSocial("youtube",   v)} placeholder="https://youtube.com/@jokoo" testID="s-yt" />
        </Section>

        {/* Téléchargement app */}
        <Section title="Téléchargement app (stores)" icon="cloud-download">
          <Field label="URL App Store (iOS)"   value={data.app_download?.ios_url}     onChangeText={(v) => setDownload("ios_url",     v)} placeholder="https://apps.apple.com/…"       testID="d-ios" />
          <Field label="URL Play Store (Android)" value={data.app_download?.android_url} onChangeText={(v) => setDownload("android_url", v)} placeholder="https://play.google.com/store/…" testID="d-and" />
        </Section>

        {/* Emails professionnels */}
        <Section title="Emails professionnels (12)" icon="mail-open">
          <Field label="Expéditeur transactionnel (no-reply)" value={data.emails?.noreply}      onChangeText={(v) => setEmail("noreply",      v)} placeholder="noreply@jokooservices.com"      keyboardType="email-address" testID="e-noreply" />
          <Field label="Support utilisateur"                  value={data.emails?.support}      onChangeText={(v) => setEmail("support",      v)} placeholder="support@jokooservices.com"      keyboardType="email-address" testID="e-support" />
          <Field label="Contact général"                      value={data.emails?.contact}      onChangeText={(v) => setEmail("contact",      v)} placeholder="contact@jokooservices.com"      keyboardType="email-address" testID="e-contact" />
          <Field label="Juridique"                            value={data.emails?.legal}        onChangeText={(v) => setEmail("legal",        v)} placeholder="legal@jokooservices.com"        keyboardType="email-address" testID="e-legal" />
          <Field label="DPO (protection des données)"         value={data.emails?.dpo}          onChangeText={(v) => setEmail("dpo",          v)} placeholder="dpo@jokooservices.com"          keyboardType="email-address" testID="e-dpo" />
          <Field label="Support paiements"                    value={data.emails?.paiements}    onChangeText={(v) => setEmail("paiements",    v)} placeholder="paiements@jokooservices.com"    keyboardType="email-address" testID="e-pay" />
          <Field label="Vérification KYC"                     value={data.emails?.verification} onChangeText={(v) => setEmail("verification", v)} placeholder="verification@jokooservices.com" keyboardType="email-address" testID="e-kyc" />
          <Field label="Support prestataires (Pro)"           value={data.emails?.prestataires} onChangeText={(v) => setEmail("prestataires", v)} placeholder="prestataires@jokooservices.com" keyboardType="email-address" testID="e-pro" />
          <Field label="Sécurité (responsible disclosure)"    value={data.emails?.security}     onChangeText={(v) => setEmail("security",     v)} placeholder="security@jokooservices.com"     keyboardType="email-address" testID="e-sec" />
          <Field label="Signalement de fraude"                value={data.emails?.fraude}       onChangeText={(v) => setEmail("fraude",       v)} placeholder="fraude@jokooservices.com"       keyboardType="email-address" testID="e-fraud" />
          <Field label="Jokoo Family (SOS)"                   value={data.emails?.family}       onChangeText={(v) => setEmail("family",       v)} placeholder="family@jokooservices.com"       keyboardType="email-address" testID="e-fam" />
          <Field label="Presse / médias"                      value={data.emails?.press}        onChangeText={(v) => setEmail("press",        v)} placeholder="press@jokooservices.com"        keyboardType="email-address" testID="e-press" />
        </Section>

        {/* Branding */}
        <Section title="Charte graphique" icon="color-palette">
          <Field label="Couleur primaire" value={data.brand?.primary_color} onChangeText={(v) => setBrand("primary_color", v)} placeholder="#14b8a6" testID="b-pri" />
          <Field label="Couleur secondaire" value={data.brand?.secondary_color} onChangeText={(v) => setBrand("secondary_color", v)} placeholder="#0f172a" testID="b-sec" />
          <Field label="URL logo" value={data.brand?.logo_url} onChangeText={(v) => setBrand("logo_url", v)} placeholder="https://…" keyboardType="url" testID="b-logo" />
        </Section>

        <Btn title={saving ? "Enregistrement…" : "💾 Enregistrer et publier"} onPress={save} loading={saving} disabled={loading} icon="save" fullWidth />
        {data.updated_at ? (
          <Txt size="xs" color={colors.textMuted} style={{ textAlign: "center" }}>
            Mis à jour le {new Date(data.updated_at).toLocaleString("fr-FR")}
          </Txt>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Section({ title, icon, children }: any) {
  return (
    <Card style={{ padding: spacing.md, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Ionicons name={icon} size={18} color={colors.turquoise} />
        <Txt weight="700">{title}</Txt>
      </View>
      {children}
    </Card>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, testID }: any) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value || ""}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        keyboardType={keyboardType || "default"}
        autoCapitalize="none"
        style={styles.input}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 11, letterSpacing: 1, color: colors.textMuted, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 },
  input: { fontSize: 15, color: colors.text, backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
});
