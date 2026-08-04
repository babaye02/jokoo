import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import * as Location from "expo-location";

/**
 * Hook contextuel pour gérer la permission de localisation (Foreground).
 *
 * Suit strictement le `handle_permissions_contract` :
 * 1. On CHECK d'abord la permission (`getForegroundPermissionsAsync`).
 * 2. On DEMANDE seulement lorsque l'utilisateur exprime une intention claire
 *    (via `requestLocation()`).
 * 3. On respecte `canAskAgain`. Si `false`, on redirige vers les Settings
 *    système avec un bouton dédié (`openSettings()` ci-dessous).
 * 4. En cas de refus définitif, on ne casse pas l'app — l'écran doit
 *    prévoir un fallback UX (map centrée sur Dakar, etc.).
 *
 * NE PAS appeler `requestLocation()` automatiquement au mount d'un écran :
 * l'appelant doit le faire uniquement lorsque l'utilisateur tape un bouton
 * "Utiliser ma position", "Me localiser", etc.
 */

export type LocationPermissionStatus =
  | "unknown"        // initial, avant tout check
  | "granted"        // OK, on peut lire la position
  | "denied"         // refusé, mais on peut re-demander
  | "blocked";       // refusé définitivement, seul Settings peut débloquer

export interface UseLocationPermissionResult {
  status: LocationPermissionStatus;
  loading: boolean;
  coords: Location.LocationObjectCoords | null;
  /** Déclenche la demande de permission (à appeler sur intention utilisateur). */
  requestLocation: () => Promise<Location.LocationObjectCoords | null>;
  /** Ouvre les Settings système pour débloquer une permission "blocked". */
  openSettings: () => Promise<void>;
  /** Recharge la position courante si la permission est déjà accordée. */
  refresh: () => Promise<void>;
}

export function useLocationPermission(): UseLocationPermissionResult {
  const [status, setStatus] = useState<LocationPermissionStatus>("unknown");
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Silent check on mount — ne déclenche AUCUNE popup système
  useEffect(() => {
    (async () => {
      try {
        const p = await Location.getForegroundPermissionsAsync();
        if (!mounted.current) return;
        if (p.status === "granted") {
          setStatus("granted");
        } else if (p.canAskAgain === false) {
          setStatus("blocked");
        } else {
          // undetermined + denied one-shot → tous "denied" (peut re-demander)
          setStatus(p.status === "denied" ? "denied" : "unknown");
        }
      } catch {
        // silencieux — pas de popup en cas d'erreur
      }
    })();
  }, []);

  const fetchCoords = useCallback(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (mounted.current) setCoords(pos.coords);
      return pos.coords;
    } catch {
      return null;
    }
  }, []);

  const requestLocation = useCallback(async () => {
    if (loading) return coords;
    setLoading(true);
    try {
      // Re-check current perm before requesting again
      const current = await Location.getForegroundPermissionsAsync();
      if (current.status === "granted") {
        setStatus("granted");
        const c = await fetchCoords();
        return c;
      }

      if (current.canAskAgain === false) {
        // Bloqué définitivement → l'appelant doit afficher un bouton Settings
        setStatus("blocked");
        return null;
      }

      const asked = await Location.requestForegroundPermissionsAsync();
      if (!mounted.current) return null;

      if (asked.status === "granted") {
        setStatus("granted");
        const c = await fetchCoords();
        return c;
      }

      if (asked.canAskAgain === false) {
        setStatus("blocked");
      } else {
        setStatus("denied");
      }
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [loading, coords, fetchCoords]);

  const openSettings = useCallback(async () => {
    try {
      if (Platform.OS === "ios") {
        await Linking.openURL("app-settings:");
      } else {
        await Linking.openSettings();
      }
    } catch {
      Alert.alert(
        "Impossible d'ouvrir les Réglages",
        "Merci d'activer l'autorisation Localisation manuellement dans les paramètres système.",
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    const p = await Location.getForegroundPermissionsAsync();
    if (p.status === "granted") {
      setStatus("granted");
      await fetchCoords();
    }
  }, [fetchCoords]);

  return { status, loading, coords, requestLocation, openSettings, refresh };
}
