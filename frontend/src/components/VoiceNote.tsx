import { useMemo, useState } from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Txt } from "@/src/components/ui";
import { API, getAuthTokenMem } from "@/src/api";
import { colors } from "@/src/theme";

/**
 * Lecture d'une note vocale.
 *
 * L'audio n'est pas inliné dans le message : il est servi par
 * `GET /chat/media/{media_id}`, protégé par le même Bearer token que le
 * reste de l'API. expo-audio accepte des en-têtes sur la source, on peut
 * donc streamer directement sans télécharger ni stocker le fichier.
 */
export function VoiceNote({
  mediaId,
  durationMs,
  mine,
}: {
  mediaId: string;
  durationMs?: number;
  mine: boolean;
}) {
  const [failed, setFailed] = useState(false);

  const source = useMemo(() => {
    const token = getAuthTokenMem();
    return {
      uri: `${API}/chat/media/${mediaId}`,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    };
  }, [mediaId]);

  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);

  const fg = mine ? colors.white : colors.turquoise;
  const subFg = mine ? "rgba(255,255,255,0.75)" : colors.textSubtle;

  const total = durationMs ?? 0;
  const playing = status?.playing ?? false;
  const loaded = status?.isLoaded ?? false;

  const toggle = () => {
    try {
      if (playing) {
        player.pause();
      } else {
        // Relit depuis le début si la note est arrivée à son terme.
        if (status?.didJustFinish) player.seekTo(0);
        player.play();
      }
    } catch {
      setFailed(true);
    }
  };

  const fmt = (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  // Progression : barre simple, sans dépendance de graphe.
  const progress = total > 0 && status?.currentTime != null
    ? Math.min(1, (status.currentTime * 1000) / total)
    : 0;

  if (failed) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="alert-circle-outline" size={18} color={fg} />
        <Txt size="sm" color={subFg} style={{ marginLeft: 6 }}>
          Note vocale indisponible
        </Txt>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", minWidth: 160 }}>
      <Pressable
        onPress={toggle}
        hitSlop={8}
        testID={`voice-play-${mediaId}`}
        accessibilityRole="button"
        accessibilityLabel={playing ? "Mettre en pause" : "Écouter la note vocale"}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: mine ? "rgba(255,255,255,0.22)" : colors.surface2,
        }}
      >
        {!loaded ? (
          <ActivityIndicator size="small" color={fg} />
        ) : (
          <Ionicons name={playing ? "pause" : "play"} size={18} color={fg} />
        )}
      </Pressable>

      <View style={{ flex: 1, marginLeft: 10 }}>
        <View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: mine ? "rgba(255,255,255,0.28)" : colors.divider,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              backgroundColor: fg,
            }}
          />
        </View>
        <Txt size="xxs" color={subFg} style={{ marginTop: 4 }}>
          {total > 0 ? fmt(total) : "Note vocale"}
        </Txt>
      </View>
    </View>
  );
}
