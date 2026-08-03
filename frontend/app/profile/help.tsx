// Écran Aide — FAQ + contact équipe Jokoo.
import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, Txt } from "@/src/components/ui";
import { colors, radius, shadow, spacing } from "@/src/theme";

const FAQ = [
  {
    q: "Comment réserver un prestataire ?",
    a: "Depuis l'accueil, cliquez sur une catégorie ou utilisez la recherche. Sélectionnez le prestataire de votre choix, puis « Réserver » sur sa fiche. Remplissez l'adresse et la description de votre besoin, choisissez une date, puis confirmez.",
  },
  {
    q: "Comment fonctionne le paiement ?",
    a: "Jokoo accepte le paiement par carte (Stripe), Wave, Orange Money, ou espèces à la fin de la prestation. Le règlement est sécurisé : votre argent est protégé jusqu'à la validation de la mission.",
  },
  {
    q: "Que faire si un prestataire ne se présente pas ?",
    a: "Vous pouvez annuler la réservation depuis « Mes réservations » et être remboursé automatiquement si le paiement était en ligne. Notre équipe intervient sous 24h en cas de litige.",
  },
  {
    q: "Comment devenir prestataire sur Jokoo ?",
    a: "Depuis votre profil, activez « Profil prestataire », renseignez vos prestations et tarifs, ajoutez vos photos et téléchargez votre pièce d'identité pour être Vérifié·e.",
  },
  {
    q: "Comment fonctionne Jokoo Family ?",
    a: "Jokoo Family permet aux parents de trouver des baby-sitters et professeurs de confiance. Chaque profil est vérifié (identité, casier judiciaire optionnel) et les baby-sitters peuvent obtenir le badge Vérifié+.",
  },
  {
    q: "Comment fonctionne le covoiturage ?",
    a: "Publiez un trajet en tant que conducteur ou cherchez un trajet en tant que passager. Vous pouvez aussi envoyer un colis grâce à un conducteur qui fait le trajet.",
  },
  {
    q: "Comment supprimer mon compte ?",
    a: "Depuis votre profil, ouvrez « Sécurité & confidentialité » puis cliquez sur « Supprimer mon compte ». Vos données personnelles seront effacées sous 30 jours conformément au RGPD.",
  },
];

export default function HelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<number | null>(0);

  const openLink = (url: string) => Linking.openURL(url).catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="help-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <Txt size="lg" weight="700">Aide & contact</Txt>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 + insets.bottom, gap: spacing.md }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={styles.iconBox}>
              <Ionicons name="chatbubbles-outline" size={20} color={colors.turquoise} />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Txt weight="700">Notre équipe est là pour vous</Txt>
              <Txt size="xs" color={colors.textMuted}>Réponse sous 24h en semaine</Txt>
            </View>
          </View>
          <Row icon="mail-outline"        label="Écrire à support@jokooservices.com"        onPress={() => openLink("mailto:support@jokooservices.com?subject=Aide%20Jokoo")} />
          <Row icon="logo-whatsapp"       label="WhatsApp · +221 77 000 00 00"               onPress={() => openLink("https://wa.me/221770000000")} />
          <Row icon="call-outline"        label="Téléphone · +221 33 800 00 00"              onPress={() => openLink("tel:+22133800000000")} />
          <Row icon="globe-outline"       label="Site web · jokooservices.com"               onPress={() => openLink("https://jokooservices.com")} />
        </Card>

        <Txt size="md" weight="700" style={{ marginTop: 4 }}>Questions fréquentes</Txt>

        {FAQ.map((f, i) => (
          <Card key={i} style={{ padding: 0 }}>
            <Pressable onPress={() => setOpen(open === i ? null : i)} style={styles.faqHead}>
              <Txt weight="700" style={{ flex: 1, marginRight: 8 }}>{f.q}</Txt>
              <Ionicons name={open === i ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
            </Pressable>
            {open === i ? (
              <View style={styles.faqBody}>
                <Txt size="sm" style={{ lineHeight: 22 }} color={colors.textMuted}>{f.a}</Txt>
              </View>
            ) : null}
          </Card>
        ))}

        <Txt size="xxs" color={colors.textSubtle} style={{ textAlign: "center", marginTop: spacing.md }}>
          Jokoo Services SARL · Dakar, Sénégal
        </Txt>
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, onPress }: any) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12 }}>
      <Ionicons name={icon} size={18} color={colors.turquoise} />
      <Txt weight="600" style={{ flex: 1, marginLeft: 12 }} numberOfLines={1}>{label}</Txt>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
    backgroundColor: colors.surface, ...shadow.soft,
  },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  iconBox: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  faqHead: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  faqBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
});
