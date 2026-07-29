import { useRef, useState } from "react";
import { View, StyleSheet, FlatList, Dimensions, Pressable, StatusBar } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { storage } from "@/src/utils/storage";
import { Btn, Txt } from "@/src/components/ui";
import { colors, fs, spacing } from "@/src/theme";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    key: "1",
    title: "Trouvez rapidement le bon professionnel",
    subtitle: "Plombier, coiffeuse, prof, chauffeur… tout à portée de main.",
    image: "https://images.pexels.com/photos/10682438/pexels-photo-10682438.jpeg",
  },
  {
    key: "2",
    title: "Des milliers de professionnels vérifiés",
    subtitle: "Profils authentifiés, avis clients, badges de confiance.",
    image: "https://images.pexels.com/photos/36441633/pexels-photo-36441633.jpeg",
  },
  {
    key: "3",
    title: "Réservez en quelques clics",
    subtitle: "Discutez, réservez, payez — le tout en toute sécurité.",
    image: "https://images.unsplash.com/photo-1657302699239-c350f0372260",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);

  const finish = async () => {
    await storage.setItem("jokoo_onboarded", true);
    router.replace("/login");
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1 });
    } else finish();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.midnight }}>
      <StatusBar barStyle="light-content" />
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.key}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, height: "100%" }}>
            <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient
              colors={["transparent", "rgba(11,31,58,0.7)", colors.midnight]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}
      />
      <SafeAreaView edges={["top", "bottom"]} style={styles.overlay} pointerEvents="box-none">
        <Pressable onPress={finish} style={styles.skip} testID="onboarding-skip">
          <Txt size="sm" weight="600" color={colors.white}>Passer</Txt>
        </Pressable>

        <View style={styles.bottom}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === index ? colors.turquoise : "rgba(255,255,255,0.3)", width: i === index ? 24 : 8 },
                ]}
              />
            ))}
          </View>
          <Txt size="xxl" weight="700" color={colors.white} style={{ marginBottom: spacing.sm, lineHeight: 34 }}>
            {SLIDES[index].title}
          </Txt>
          <Txt size="md" color="rgba(255,255,255,0.78)" style={{ marginBottom: spacing.xl, lineHeight: 22 }}>
            {SLIDES[index].subtitle}
          </Txt>
          <Btn
            title={index === SLIDES.length - 1 ? "Commencer" : "Suivant"}
            onPress={next}
            fullWidth
            size="lg"
            testID="onboarding-next"
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  skip: {
    alignSelf: "flex-end",
    marginRight: spacing.xl,
    marginTop: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  bottom: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  dots: {
    flexDirection: "row",
    marginBottom: spacing.lg,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
});
