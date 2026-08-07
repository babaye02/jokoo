import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, TextInput, Pressable, Alert, ScrollView, Linking } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api, Message } from "@/src/api";
import { Avatar, Txt } from "@/src/components/ui";
import { ActionSheet, ConfirmDialog } from "@/src/components/ActionSheet";
import { useLocationPermission } from "@/src/hooks/useLocationPermission";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from "expo-audio";
import { VoiceNote } from "@/src/components/VoiceNote";
import { colors, fs, radius, shadow, spacing } from "@/src/theme";

const QUICK_REPLIES: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "checkmark-circle-outline", label: "Je suis arrivé" },
  { icon: "navigate-outline", label: "J'arrive" },
  { icon: "alert-circle-outline", label: "Je suis bloqué" },
  { icon: "help-circle-outline", label: "Je ne trouve pas le lieu" },
  { icon: "hourglass-outline", label: "Attends-moi" },
  { icon: "heart-outline", label: "Merci" },
  { icon: "close-circle-outline", label: "Annuler" },
];

const SHARE_DURATIONS = [
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 heure" },
];

// Aligné sur la limite backend (chat_voice.MAX_VOICE_SECONDS = 120).
const MAX_VOICE_MS = 120_000;

export default function Chat() {
  const { id, name: nameParam } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [peerName, setPeerName] = useState<string | null>(nameParam || null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blockedToast, setBlockedToast] = useState<string | null>(null);
  const [reportPrompt, setReportPrompt] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [locSheet, setLocSheet] = useState(false);
  const [landmark, setLandmark] = useState("");
  const [sendingLoc, setSendingLoc] = useState(false);
  const { requestLocation, status: locStatus, openSettings } = useLocationPermission();
  const audioRecorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const [recording, setRecording] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const recordStartRef = useRef<number>(0);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const list = await api.get<Message[]>(`/chat/${id}/messages`);
      setItems(list);
      // Récupère le nom du peer depuis le premier message si non fourni via param
      if (!peerName && list.length > 0) {
        const first = list[0];
        const mine = first.from_id === user?.id;
        setPeerName((mine ? (first as any).to_name : first.from_name) || null);
      }
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e: any) {
      // On garde la liste actuelle en cas d'erreur réseau — ne pas écraser
      if (e?.status === 401) setErr("Session expirée. Reconnectez-vous.");
    }
  }, [id, peerName, user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  // Auto-hide error after 4s
  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(null), 4000);
    return () => clearTimeout(t);
  }, [err]);

  // Auto-hide blocked toast after 2s
  useEffect(() => {
    if (!blockedToast) return;
    const t = setTimeout(() => setBlockedToast(null), 2000);
    return () => clearTimeout(t);
  }, [blockedToast]);

  const send = async (overrideText?: string) => {
    // Garde-fou : si appelé directement depuis onPress/onSubmitEditing, le
    // premier argument est un événement natif, pas une chaîne. On l'ignore.
    const override = typeof overrideText === "string" ? overrideText : undefined;
    const t = (override ?? text).trim();
    if (!t || !id || sending) return;
    setSending(true);
    setErr(null);
    // Optimistic UI: on ajoute le message immédiatement
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conv_id: "",
      from_id: user?.id || "",
      from_name: user?.name || "Moi",
      to_id: id,
      text: t,
      kind: "text",
      read: false,
      created_at: new Date().toISOString(),
    } as any;
    setItems((x) => [...x, optimistic]);
    if (override === undefined) setText("");
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 30);
    try {
      const m = await api.post<Message>(`/chat/${id}/messages`, { text: t, kind: "text" });
      // Remplace le message optimiste par le vrai
      setItems((x) => x.map((msg) => (msg.id === tempId ? m : msg)));
    } catch (e: any) {
      // Retire l'optimiste et affiche l'erreur — remet le texte pour permettre de réessayer
      setItems((x) => x.filter((msg) => msg.id !== tempId));
      if (override === undefined) setText(t);
      const status = e?.status;
      let msg = "Impossible d'envoyer le message. Réessayez.";
      if (status === 401) msg = "Session expirée. Reconnectez-vous.";
      else if (status === 404) msg = "Ce destinataire n'existe plus.";
      else if (status === 400) msg = e?.message || "Message invalide.";
      else if (typeof e?.message === "string") msg = e.message;
      setErr(msg);
    } finally {
      setSending(false);
    }
  };

  const sendQuickReply = (label: string) => {
    if (sending) return;
    send(label);
  };

  const shareLocation = async (minutes: number) => {
    if (!id || sendingLoc) return;
    setSendingLoc(true);
    setErr(null);
    try {
      const coords = await requestLocation();
      if (!coords) {
        setErr(
          locStatus === "blocked"
            ? "Localisation bloquée. Activez-la dans les Réglages."
            : "Impossible d'obtenir votre position.",
        );
        return;
      }
      const m = await api.post<Message>(`/chat/${id}/messages`, {
        kind: "location",
        text: "",
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy_m: coords.accuracy ?? undefined,
        landmark: landmark.trim() || undefined,
        expires_in_minutes: minutes,
      });
      setItems((x: Message[]) => [...x, m]);
      setLocSheet(false);
      setLandmark("");
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 30);
    } catch (e: any) {
      setErr(e?.message || "Impossible de partager votre position.");
    } finally {
      setSendingLoc(false);
    }
  };

  // ---------- Notes vocales ----------
  const startRecording = async () => {
    if (recording || uploadingVoice) return;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setErr("Autorisez le micro pour envoyer une note vocale.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      recordStartRef.current = Date.now();
      setRecording(true);
    } catch {
      setErr("Impossible de démarrer l'enregistrement.");
      setRecording(false);
    }
  };

  const cancelRecording = async () => {
    if (!recording) return;
    setRecording(false);
    try {
      await audioRecorder.stop();
    } catch {
      /* enregistrement abandonné — rien à faire */
    }
  };

  const stopAndSendRecording = async () => {
    if (!recording || !id) return;
    setRecording(false);
    const elapsed = Date.now() - recordStartRef.current;
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) {
        setErr("Enregistrement vide.");
        return;
      }
      if (elapsed < 500) {
        setErr("Maintenez le bouton pour enregistrer.");
        return;
      }

      setUploadingVoice(true);
      // Lecture du fichier local → base64, sans dépendance supplémentaire.
      const res = await fetch(uri);
      const blob = await res.blob();
      const b64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("read_failed"));
        reader.onloadend = () => {
          const r = String(reader.result || "");
          resolve(r.includes(",") ? r.split(",")[1] : r);
        };
        reader.readAsDataURL(blob);
      });

      const m = await api.post<Message>(`/chat/${id}/voice`, {
        audio_b64: b64,
        duration_ms: Math.min(elapsed, MAX_VOICE_MS),
        mime: Platform.OS === "ios" ? "audio/m4a" : "audio/mp4",
      });
      setItems((x: Message[]) => [...x, m]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 30);
    } catch (e: any) {
      if (e?.status === 413) setErr("Note vocale trop longue (2 min maximum).");
      else setErr(e?.message || "Impossible d'envoyer la note vocale.");
    } finally {
      setUploadingVoice(false);
    }
  };

  // Coupe l'enregistrement à la limite backend plutôt que de laisser
  // l'utilisateur parler pour rien et se faire rejeter à l'envoi.
  useEffect(() => {
    if (!recording) return;
    const t = setTimeout(() => { stopAndSendRecording(); }, MAX_VOICE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const openInMaps = (lat: number, lng: number, label?: string | null) => {
    const q = encodeURIComponent(label || "Point de rendez-vous");
    const url = Platform.select({
      ios: `maps://?ll=${lat},${lng}&q=${q}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${q})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    })!;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`).catch(() =>
        setErr("Impossible d'ouvrir la carte."),
      ),
    );
  };

  const displayName = peerName || "Conversation";

  const submitReport = async () => {
    if (!id) return;
    try {
      await api.post("/reports", { target_id: id, target_type: "user", reason: reportReason.trim() || "Signalement depuis chat" });
      setReportPrompt(false);
      setReportReason("");
      setBlockedToast("Signalement envoyé. Notre équipe intervient sous 24 h.");
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Impossible d'envoyer le signalement.");
    }
  };

  const doBlock = async () => {
    if (!id) return;
    try {
      await api.post(`/users/${id}/block`, {});
      setBlockedToast(`${displayName} a été bloqué·e.`);
      // Retour arrière après un court délai pour laisser voir le toast
      setTimeout(() => {
        // Utilise dismiss si canGoBack() est faux (deep link direct)
        if ((router as any).canGoBack?.() !== false) {
          router.back();
        } else {
          router.replace("/(tabs)/messages");
        }
      }, 900);
    } catch (e: any) {
      // Alert.alert échoue silencieusement sur navigateur web → on utilise la bannière in-app.
      setErr(e?.message || "Impossible de bloquer. Vérifiez votre connexion.");
    }
  };

  const showMenu = () => {
    if (!id) return;
    setMenuOpen(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface2 }}>
      <SafeAreaView edges={["top"]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="chat-back">
          <Ionicons name="chevron-back" size={22} color={colors.midnight} />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginLeft: 8 }}>
          <Avatar name={displayName} size={40} />
          <View style={{ marginLeft: 10 }}>
            <Txt weight="700">{displayName}</Txt>
            <Txt size="xxs" color={colors.subtext}>Contact</Txt>
          </View>
        </View>
        <Pressable onPress={showMenu} style={styles.iconBtn} testID="chat-menu" hitSlop={10}>
          <Ionicons name="ellipsis-vertical" size={20} color={colors.midnight} />
        </Pressable>
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.xl, gap: 8, paddingBottom: 8 }}
          renderItem={({ item }: { item: Message }) => {
            const mine = item.from_id === user?.id;
            const isOptimistic = item.id.startsWith("temp-");
            const isLoc = item.kind === "location";
            const isVoice = item.kind === "voice" && !!item.media_id;
            const expired = isLoc && (item.location_expired || item.lat == null);
            return (
              <View style={[styles.bubbleRow, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, isOptimistic && { opacity: 0.6 }]}>
                  {isVoice ? (
                    <VoiceNote mediaId={item.media_id!} durationMs={item.duration_ms} mine={mine} />
                  ) : isLoc ? (
                    <Pressable
                      onPress={() => (!expired ? openInMaps(item.lat!, item.lng!, item.landmark) : undefined)}
                      disabled={expired}
                      testID={`chat-location-${item.id}`}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Ionicons
                          name={expired ? "location-outline" : "location"}
                          size={18}
                          color={mine ? colors.white : colors.turquoise}
                        />
                        <Txt weight="700" color={mine ? colors.white : colors.text} style={{ marginLeft: 6 }}>
                          {expired ? "Position expirée" : "Position partagée"}
                        </Txt>
                      </View>
                      {item.landmark ? (
                        <Txt size="sm" color={mine ? "rgba(255,255,255,0.9)" : colors.textMuted} style={{ marginTop: 4 }}>
                          {item.landmark}
                        </Txt>
                      ) : null}
                      <Txt size="xxs" color={mine ? "rgba(255,255,255,0.7)" : colors.textSubtle} style={{ marginTop: 4 }}>
                        {expired
                          ? "Le partage a pris fin"
                          : `Visible ${item.expires_in_minutes ?? 15} min · Appuyez pour ouvrir la carte`}
                      </Txt>
                    </Pressable>
                  ) : (
                    <Txt color={mine ? colors.white : colors.text}>{item.text}</Txt>
                  )}
                  <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-end", marginTop: 4, gap: 4 }}>
                    <Txt size="xxs" color={mine ? "rgba(255,255,255,0.7)" : colors.textSubtle}>
                      {new Date(item.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </Txt>
                    {isOptimistic && mine ? (
                      <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.7)" />
                    ) : null}
                  </View>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 80 }}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.textSubtle} />
              <Txt color={colors.textMuted} style={{ marginTop: spacing.md }}>Dites bonjour 👋</Txt>
            </View>
          }
        />

        {err ? (
          <View style={styles.errBar}>
            <Ionicons name="warning" size={16} color={colors.white} />
            <Txt color={colors.white} weight="600" style={{ flex: 1, marginLeft: 8 }} size="sm" testID="chat-error">
              {err}
            </Txt>
          </View>
        ) : null}

        {blockedToast ? (
          <View style={styles.toastBar} testID="chat-block-toast">
            <Ionicons name="checkmark-circle" size={16} color={colors.white} />
            <Txt color={colors.white} weight="700" style={{ flex: 1, marginLeft: 8 }} size="sm">
              {blockedToast}
            </Txt>
          </View>
        ) : null}

        {recording ? (
          <View style={styles.recBar} testID="chat-recording-bar">
            <View style={styles.recDot} />
            <Txt color={colors.white} weight="700" size="sm" style={{ flex: 1, marginLeft: 8 }}>
              Enregistrement… {Math.floor((recorderState?.durationMillis ?? 0) / 1000)}s
            </Txt>
            <Pressable onPress={cancelRecording} hitSlop={8} testID="chat-recording-cancel">
              <Txt color={colors.white} weight="700" size="sm">Annuler</Txt>
            </Pressable>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRepliesRow}
          keyboardShouldPersistTaps="handled"
          testID="chat-quick-replies"
        >
          {QUICK_REPLIES.map((qr) => (
            <Pressable
              key={qr.label}
              onPress={() => sendQuickReply(qr.label)}
              disabled={sending}
              style={[styles.quickReplyChip, sending && { opacity: 0.5 }]}
              testID={`chat-quick-reply-${qr.label}`}
            >
              <Ionicons name={qr.icon} size={14} color={colors.turquoise} />
              <Txt size="xs" weight="600" color={colors.midnight} style={{ marginLeft: 6 }}>
                {qr.label}
              </Txt>
            </Pressable>
          ))}
        </ScrollView>

        <View style={[styles.inputBar, { paddingBottom: 8 + insets.bottom }]}>
          <Pressable
            onPress={() => setLocSheet(true)}
            style={styles.locBtn}
            testID="chat-share-location"
            hitSlop={6}
          >
            <Ionicons name="location-outline" size={20} color={colors.turquoise} />
          </Pressable>
          <View style={styles.inputWrap}>
            <TextInput
              testID="chat-input"
              value={text}
              onChangeText={setText}
              placeholder="Message…"
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
              multiline
              editable={!sending}
              onSubmitEditing={() => send()}
              returnKeyType="send"
              blurOnSubmit={false}
            />
          </View>
          {text.trim().length > 0 ? (
            <Pressable
              onPress={() => send()}
              style={[styles.sendBtn, sending && { opacity: 0.5 }]}
              testID="chat-send"
              disabled={sending}
            >
              <Ionicons name={sending ? "hourglass" : "paper-plane"} size={18} color={colors.white} />
            </Pressable>
          ) : (
            <Pressable
              onPressIn={startRecording}
              onPressOut={stopAndSendRecording}
              delayLongPress={200}
              style={[
                styles.sendBtn,
                recording && styles.micRecording,
                uploadingVoice && { opacity: 0.5 },
              ]}
              testID="chat-mic"
              disabled={uploadingVoice}
              accessibilityRole="button"
              accessibilityLabel="Maintenir pour enregistrer une note vocale"
            >
              <Ionicons
                name={uploadingVoice ? "hourglass" : recording ? "stop" : "mic"}
                size={20}
                color={colors.white}
              />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <ActionSheet
        visible={menuOpen}
        title={displayName}
        subtitle="Actions"
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            id: "report",
            label: "Signaler cet utilisateur",
            icon: "flag-outline",
            hint: "Notre équipe intervient sous 24 h",
            onPress: () => { setReportReason(""); setReportPrompt(true); },
          },
          {
            id: "block",
            label: "Bloquer cet utilisateur",
            icon: "ban-outline",
            destructive: true,
            hint: "Vous ne recevrez plus ses messages",
            onPress: () => setConfirmBlock(true),
          },
        ]}
      />

      <ConfirmDialog
        visible={confirmBlock}
        title="Bloquer ?"
        message={`${displayName} ne pourra plus vous contacter et vous ne verrez plus ses messages.`}
        confirmLabel="Bloquer"
        destructive
        onConfirm={doBlock}
        onClose={() => setConfirmBlock(false)}
      />

      {/* Feuille de partage de position temporaire */}
      {locSheet ? (
        <View style={styles.promptOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setLocSheet(false)} />
          <View style={styles.promptCard}>
            <Txt size="lg" weight="700">Partager ma position</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
              Votre position sera visible pendant la durée choisie, puis masquée automatiquement.
            </Txt>

            <Txt size="sm" weight="600" style={{ marginTop: spacing.md }}>Point de repère (optionnel)</Txt>
            <TextInput
              value={landmark}
              onChangeText={setLandmark}
              placeholder="Ex : maison jaune, devant la pharmacie…"
              placeholderTextColor={colors.textSubtle}
              style={styles.promptInput}
              maxLength={200}
              testID="location-landmark-input"
            />

            {locStatus === "blocked" ? (
              <Pressable onPress={openSettings} style={[styles.promptBtn, styles.promptGhost, { marginTop: spacing.md }]}>
                <Txt weight="700" color={colors.turquoise}>Activer la localisation dans les Réglages</Txt>
              </Pressable>
            ) : (
              <View style={{ gap: 8, marginTop: spacing.md }}>
                {SHARE_DURATIONS.map((d) => (
                  <Pressable
                    key={d.minutes}
                    onPress={() => shareLocation(d.minutes)}
                    disabled={sendingLoc}
                    style={[styles.durationBtn, sendingLoc && { opacity: 0.5 }]}
                    testID={`location-duration-${d.minutes}`}
                  >
                    <Ionicons name="time-outline" size={16} color={colors.turquoise} />
                    <Txt weight="700" style={{ marginLeft: 8 }}>Partager pendant {d.label}</Txt>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable onPress={() => setLocSheet(false)} style={[styles.promptBtn, styles.promptGhost, { marginTop: spacing.md }]}>
              <Txt weight="700" color={colors.textMuted}>Annuler</Txt>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Prompt in-app pour le motif du signalement (Alert.prompt n'existe pas sur Android/web) */}
      {reportPrompt ? (
        <View style={styles.promptOverlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setReportPrompt(false)} />
          <View style={styles.promptCard}>
            <Txt size="lg" weight="700">Motif du signalement</Txt>
            <Txt size="xs" color={colors.textMuted} style={{ marginTop: 4 }}>
              Décrivez le problème (harcèlement, spam, contenu inapproprié…). Optionnel.
            </Txt>
            <TextInput
              value={reportReason}
              onChangeText={setReportReason}
              placeholder="Motif…"
              placeholderTextColor={colors.textSubtle}
              multiline
              style={styles.promptInput}
              testID="report-reason-input"
            />
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
              <Pressable onPress={() => setReportPrompt(false)} style={[styles.promptBtn, styles.promptGhost]} testID="report-cancel">
                <Txt weight="700" color={colors.textMuted}>Annuler</Txt>
              </Pressable>
              <Pressable onPress={submitReport} style={[styles.promptBtn, { backgroundColor: colors.turquoise }]} testID="report-submit">
                <Txt weight="700" color={colors.white}>Envoyer</Txt>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, ...shadow.soft },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  bubbleRow: { flexDirection: "row" },
  bubble: { maxWidth: "78%", padding: 12, borderRadius: 18 },
  bubbleMine: { backgroundColor: colors.turquoise, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4, ...shadow.soft },
  locBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", marginRight: 8 },
  micRecording: { backgroundColor: colors.danger },
  recBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginHorizontal: spacing.xl,
    borderRadius: radius.md,
    marginBottom: 6,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.white },
  durationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  quickRepliesRow: { paddingHorizontal: spacing.lg, paddingVertical: 8, gap: 8, backgroundColor: colors.surface },
  quickReplyChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  inputBar: { flexDirection: "row", alignItems: "flex-end", padding: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider },
  inputWrap: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: colors.surface2, paddingHorizontal: 16, justifyContent: "center" },
  input: { fontSize: fs.md, color: colors.text, paddingVertical: 10 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.turquoise, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  errBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginHorizontal: spacing.xl,
    borderRadius: radius.md,
    marginBottom: 6,
  },
  toastBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.turquoise,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginHorizontal: spacing.xl,
    borderRadius: radius.md,
    marginBottom: 6,
  },
  promptOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  promptCard: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: 30 },
  promptInput: { minHeight: 80, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, textAlignVertical: "top", fontSize: 14, color: colors.text, backgroundColor: colors.surface2 },
  promptBtn: { flex: 1, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  promptGhost: { backgroundColor: colors.surface2 },
});
