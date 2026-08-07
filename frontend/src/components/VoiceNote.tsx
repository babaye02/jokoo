import { useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable, ActivityIndicator, Platform } from "react-native";
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
 * reste de l'API.
 *
 * Deux implémentations :
 * - Natif (iOS/Android) : expo-audio accepte des en-têtes sur la source,
 *   on streame directement sans télécharger ni stocker le fichier.
 * - Web : HTMLAudioElement ne peut PAS envoyer le header Authorization et
 *   le `play()` d'expo-audio web ne gère pas la promesse retournée (toute
 *   erreur — 401, format non supporté, autoplay policy — devient un
 *   « Uncaught Error » qui crashe l'app). On télécharge donc le média en
 *   blob authentifié et on pilote nous-mêmes un HTMLAudioElement dont le
 *   play() est correctement catch-é.
 */

type VoiceNoteProps = {
  mediaId: string;
  durationMs?: number;
  mine: boolean;
};

export function VoiceNote(props: VoiceNoteProps) {
  return Platform.OS === "web" ? <VoiceNoteWeb {...props} /> : <VoiceNoteNative {...props} />;
}

// ─── Natif : streaming expo-audio avec header Authorization ───────────

function VoiceNoteNative({ mediaId, durationMs, mine }: VoiceNoteProps) {
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

  const total = durationMs ?? 0;
  const playing = status?.playing ?? false;
  const loaded = status?.isLoaded ?? false;
  const progress =
    total > 0 && status?.currentTime != null
      ? Math.min(1, (status.currentTime * 1000) / total)
      : 0;

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

  return (
    <VoiceShell
      mediaId={mediaId}
      mine={mine}
      failed={failed}
      loaded={loaded}
      playing={playing}
      progress={progress}
      totalMs={total}
      onToggle={toggle}
    />
  );
}

// ─── Web : blob authentifié + HTMLAudioElement contrôlé ───────────────

function VoiceNoteWeb({ mediaId, durationMs, mine }: VoiceNoteProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const audioRef = useRef<any>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = getAuthTokenMem();
        const res = await fetch(`${API}/chat/media/${mediaId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!alive) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const AudioCtor = (globalThis as any).Audio;
        const el = new AudioCtor(url);
        el.preload = "auto";
        el.addEventListener("timeupdate", () => {
          setCurrentMs((el.currentTime || 0) * 1000);
        });
        el.addEventListener("ended", () => {
          setPlaying(false);
          el.currentTime = 0;
          setCurrentMs(0);
        });
        el.addEventListener("error", () => {
          setFailed(true);
          setPlaying(false);
        });
        audioRef.current = el;
        setLoaded(true);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      const el = audioRef.current;
      if (el) {
        try { el.pause(); } catch { /* déjà arrêté */ }
        audioRef.current = null;
      }
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [mediaId]);

  const total = durationMs ?? 0;
  const progress = total > 0 ? Math.min(1, currentMs / total) : 0;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      try { el.pause(); } catch { /* ignore */ }
      setPlaying(false);
      return;
    }
    const p = el.play();
    setPlaying(true);
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        setFailed(true);
        setPlaying(false);
      });
    }
  };

  return (
    <VoiceShell
      mediaId={mediaId}
      mine={mine}
      failed={failed}
      loaded={loaded}
      playing={playing}
      progress={progress}
      totalMs={total}
      onToggle={toggle}
    />
  );
}

// ─── UI partagée ───────────────────────────────────────────────────────

function VoiceShell({
  mediaId,
  mine,
  failed,
  loaded,
  playing,
  progress,
  totalMs,
  onToggle,
}: {
  mediaId: string;
  mine: boolean;
  failed: boolean;
  loaded: boolean;
  playing: boolean;
  progress: number;
  totalMs: number;
  onToggle: () => void;
}) {
  const fg = mine ? colors.white : colors.turquoise;
  const subFg = mine ? "rgba(255,255,255,0.75)" : colors.textSubtle;

  const fmt = (ms: number) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

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
        onPress={onToggle}
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
          {totalMs > 0 ? fmt(totalMs) : "Note vocale"}
        </Txt>
      </View>
    </View>
  );
}
