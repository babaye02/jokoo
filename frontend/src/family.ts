// Shared metadata for Jokoo Family (babysitting)

export const LANGUAGES: { code: string; label: string; flag: string }[] = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "Anglais", flag: "🇬🇧" },
  { code: "wo", label: "Wolof", flag: "🇸🇳" },
  { code: "ar", label: "Arabe", flag: "🇸🇦" },
  { code: "es", label: "Espagnol", flag: "🇪🇸" },
  { code: "pt", label: "Portugais", flag: "🇵🇹" },
  { code: "de", label: "Allemand", flag: "🇩🇪" },
  { code: "it", label: "Italien", flag: "🇮🇹" },
  { code: "zh", label: "Chinois", flag: "🇨🇳" },
];

export const LANG_LEVEL_LABEL: Record<string, string> = {
  native: "Natif",
  fluent: "Courant",
  intermediate: "Intermédiaire",
  basic: "Débutant",
};

export const AGE_GROUPS: { code: string; label: string; icon: string }[] = [
  { code: "0-2", label: "0–2 ans", icon: "👶" },
  { code: "3-5", label: "3–5 ans", icon: "🧒" },
  { code: "6-10", label: "6–10 ans", icon: "👦" },
  { code: "11-14", label: "11–14 ans", icon: "🧑" },
];

export const SKILLS: { code: string; label: string; icon: string }[] = [
  { code: "languages", label: "Langues", icon: "language" },
  { code: "homework", label: "Devoirs", icon: "school" },
  { code: "educational_games", label: "Jeux éducatifs", icon: "extension-puzzle" },
  { code: "baby_care", label: "Garde bébés", icon: "flower" },
  { code: "music", label: "Musique", icon: "musical-notes" },
  { code: "art", label: "Art & Dessin", icon: "color-palette" },
  { code: "sport", label: "Sport", icon: "football" },
  { code: "cooking", label: "Cuisine", icon: "restaurant" },
  { code: "stories", label: "Contes", icon: "book" },
  { code: "outdoor", label: "Sorties", icon: "sunny" },
  { code: "school_pickup", label: "Accompagnement école", icon: "walk" },
  { code: "holiday_care", label: "Garde vacances", icon: "airplane" },
];

export const SERVICES: { code: string; label: string; icon: string; emoji: string }[] = [
  { code: "babysitting", label: "Baby-sitting", icon: "happy", emoji: "👶" },
  { code: "tutoring", label: "Cours & devoirs", icon: "school", emoji: "📚" },
  { code: "educational_activities", label: "Activités éducatives", icon: "sparkles", emoji: "🎨" },
  { code: "school_pickup", label: "Accompagnement école", icon: "walk", emoji: "🚸" },
  { code: "holiday_care", label: "Garde vacances", icon: "airplane", emoji: "🌴" },
];

export const PROFILE_TYPE_LABEL: Record<string, { label: string; emoji: string }> = {
  student: { label: "Étudiant(e)", emoji: "🎓" },
  teacher: { label: "Professeur", emoji: "👨‍🏫" },
  professional: { label: "Professionnel(le)", emoji: "💼" },
};

export const LEVEL_LABEL: Record<string, string> = {
  licence: "Licence",
  master: "Master",
  doctorat: "Doctorat",
  prepa: "Prépa",
  other: "Autre",
};

export const MOOD_META: Record<string, { label: string; emoji: string; color: string }> = {
  happy: { label: "Joyeux(se)", emoji: "😊", color: "#10B981" },
  calm: { label: "Calme", emoji: "😌", color: "#3B82F6" },
  tired: { label: "Fatigué(e)", emoji: "😴", color: "#F59E0B" },
  upset: { label: "Contrarié(e)", emoji: "😢", color: "#EF4444" },
};

export const langMeta = (code: string) => LANGUAGES.find((l) => l.code === code) || { code, label: code.toUpperCase(), flag: "🌐" };
export const skillMeta = (code: string) => SKILLS.find((s) => s.code === code);
export const ageMeta = (code: string) => AGE_GROUPS.find((a) => a.code === code);
export const serviceMeta = (code: string) => SERVICES.find((s) => s.code === code);
