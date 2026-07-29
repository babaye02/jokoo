import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fs, radius, shadow, spacing } from "@/src/theme";

// -------- Text --------
type TxtProps = {
  size?: keyof typeof fs;
  weight?: "400" | "500" | "600" | "700";
  color?: string;
  style?: TextStyle | TextStyle[];
  children?: React.ReactNode;
  numberOfLines?: number;
  testID?: string;
};
export function Txt({ size = "md", weight = "400", color = colors.text, style, children, numberOfLines, testID }: TxtProps) {
  return (
    <Text
      testID={testID}
      numberOfLines={numberOfLines}
      style={[{ fontSize: fs[size], fontWeight: weight, color }, style as any]}
    >
      {children}
    </Text>
  );
}

// -------- Button --------
type BtnProps = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "dark";
  size?: "sm" | "md" | "lg";
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  testID?: string;
  style?: ViewStyle | ViewStyle[];
};
export function Btn({ title, onPress, variant = "primary", size = "md", icon, loading, disabled, fullWidth, testID, style }: BtnProps) {
  const bg =
    variant === "primary" ? colors.turquoise :
    variant === "dark" ? colors.midnight :
    variant === "secondary" ? colors.surface :
    "transparent";
  const fg =
    variant === "primary" || variant === "dark" ? colors.white :
    colors.midnight;
  const borderColor = variant === "secondary" ? colors.borderStrong : "transparent";
  const height = size === "sm" ? 40 : size === "lg" ? 56 : 50;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          height,
          paddingHorizontal: spacing.xl,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? "stretch" : undefined,
        },
        variant === "primary" ? shadow.soft : undefined,
        style as any,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 8 }} /> : null}
          <Text style={{ color: fg, fontSize: fs.md, fontWeight: "600" }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// -------- Input --------
type InputProps = TextInputProps & {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string | null;
  testID?: string;
};
export function Input({ label, icon, error, style, testID, ...rest }: InputProps) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Txt size="sm" weight="500" color={colors.textMuted} style={{ marginBottom: 6 }}>{label}</Txt> : null}
      <View style={[styles.inputWrap, error ? { borderColor: colors.danger } : null]}>
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginRight: 8 }} /> : null}
        <TextInput
          testID={testID}
          placeholderTextColor={colors.textSubtle}
          style={[styles.input, style as any]}
          {...rest}
        />
      </View>
      {error ? <Txt size="xs" color={colors.danger} style={{ marginTop: 4 }}>{error}</Txt> : null}
    </View>
  );
}

// -------- Card --------
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return <View style={[styles.card, style as any]}>{children}</View>;
}

// -------- Chip --------
export function Chip({ label, active, onPress, icon, testID }: { label: string; active?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        height: 36,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        backgroundColor: active ? colors.midnight : colors.surface,
        borderWidth: 1,
        borderColor: active ? colors.midnight : colors.border,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        flexShrink: 0,
      }}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? colors.white : colors.midnight} style={{ marginRight: 6 }} /> : null}
      <Text style={{ color: active ? colors.white : colors.midnight, fontSize: fs.sm, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

// -------- Rating --------
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(value) ? "star" : "star-outline"}
          size={size}
          color="#F59E0B"
          style={{ marginRight: 1 }}
        />
      ))}
    </View>
  );
}

// -------- Avatar --------
export function Avatar({ uri, name, size = 48 }: { uri?: string | null; name?: string; size?: number }) {
  const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  if (uri) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: colors.surface3 }}>
        {/* Using RN Image to avoid extra deps */}
        <ExpoImage uri={uri} size={size} />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.midnight, fontWeight: "700", fontSize: size / 2.8 }}>{initials}</Text>
    </View>
  );
}

// wrapper avoiding importing at top
import { Image } from "expo-image";
function ExpoImage({ uri, size }: { uri: string; size: number }) {
  return <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={150} />;
}

// -------- Section header --------
export function SectionHeader({ title, action, onAction, testID }: { title: string; action?: string; onAction?: () => void; testID?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md, paddingHorizontal: spacing.xl }}>
      <Txt testID={testID} size="lg" weight="700">{title}</Txt>
      {action ? (
        <Pressable onPress={onAction}>
          <Txt size="sm" weight="600" color={colors.turquoise}>{action}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

// -------- Toast (inline) --------
export function ErrorBox({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <View style={{ backgroundColor: "#FEE2E2", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
      <Text style={{ color: colors.danger, fontSize: fs.sm, fontWeight: "500" }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    fontSize: fs.md,
    color: colors.text,
    height: "100%",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
});
