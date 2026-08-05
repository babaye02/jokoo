import { useEffect } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

/** Alias court pour /invite/[code] — utilisé par les Universal Links jokoo.sn/i/XXX */
export default function InviteShort() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  useEffect(() => {
    if (code) router.replace({ pathname: "/invite/[code]", params: { code: String(code) } });
    else router.replace("/");
  }, [code, router]);
  return <View />;
}
