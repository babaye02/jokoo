// Metadata éditoriale pour chaque catégorie Jokoo
// Utilisée par la page /category/[key].tsx pour construire une expérience immersive.
// Chaque catégorie a sa propre identité : gradient, description éditoriale, tagline.

export type CategoryMeta = {
  key: string;
  label: string;
  tagline: string;         // Phrase courte — hero
  description: string;     // 1-2 phrases éditoriales
  gradient: [string, string]; // Gradient hero (dark → soft)
  accent: string;          // Couleur d'accent (icônes, chips)
  overline: string;        // Micro-mot au-dessus du titre
};

export const CATEGORY_META: Record<string, CategoryMeta> = {
  beauty: {
    key: "beauty",
    label: "Beauté & Coiffure",
    overline: "Univers Beauté",
    tagline: "L'art de se sublimer.",
    description:
      "Coiffeuses, tresseuses, maquilleuses, esthéticiennes — entre les mains des meilleurs artisans beauté du Sénégal.",
    gradient: ["#0B1F3A", "#4B1D3F"],
    accent: "#EC4899",
  },
  health: {
    key: "health",
    label: "Santé & Soins",
    overline: "Univers Santé",
    tagline: "Soigner, avec justesse.",
    description:
      "Infirmiers, sages-femmes, kinés, garde-malades — des soins professionnels à domicile, dans la bienveillance et la discrétion.",
    gradient: ["#0B1F3A", "#1B3A5E"],
    accent: "#0EA5E9",
  },
  security: {
    key: "security",
    label: "Sécurité",
    overline: "Univers Sécurité",
    tagline: "La tranquillité, au quotidien.",
    description:
      "Agents de sécurité, gardiens, garde du corps, installateurs d'alarme — pour protéger ce qui compte.",
    gradient: ["#0B1F3A", "#1F1F1F"],
    accent: "#3B82F6",
  },
  home: {
    key: "home",
    label: "Maison & Ménage",
    overline: "Univers Maison",
    tagline: "Un intérieur qui respire.",
    description:
      "Femmes de ménage, gouvernantes, cuisinières, repasseuses — un foyer impeccable, orchestré par des mains de confiance.",
    gradient: ["#0B1F3A", "#1F4A3B"],
    accent: "#10B981",
  },
  repair: {
    key: "repair",
    label: "Bâtiment & Réparations",
    overline: "Univers Artisanat",
    tagline: "Des mains qui savent.",
    description:
      "Plombiers, électriciens, maçons, menuisiers, carreleurs — des artisans qui font parler leurs métiers.",
    gradient: ["#1F1F1F", "#4A2E00"],
    accent: "#F59E0B",
  },
  transport: {
    key: "transport",
    label: "Transport & Livraison",
    overline: "Univers Mobilité",
    tagline: "Se déplacer sans y penser.",
    description:
      "Chauffeurs, livreurs, coursiers — pour se déplacer, faire livrer, en toute sérénité.",
    gradient: ["#0B1F3A", "#1F3A5E"],
    accent: "#0B1F3A",
  },
  food: {
    key: "food",
    label: "Restauration & Traiteur",
    overline: "Univers Gastronomie",
    tagline: "L'art de la table.",
    description:
      "Chefs, traiteurs, pâtissiers, cuisiniers événementiels — la gastronomie sénégalaise, sur mesure.",
    gradient: ["#3F1A0A", "#7A2D0E"],
    accent: "#F97316",
  },
  events: {
    key: "events",
    label: "Événementiel",
    overline: "Univers Événements",
    tagline: "Célébrer, en grand.",
    description:
      "DJ, décorateurs, wedding planners, animateurs — pour des célébrations inoubliables, du baptême au mariage.",
    gradient: ["#2A1054", "#4B1D3F"],
    accent: "#8B5CF6",
  },
  tech: {
    key: "tech",
    label: "Tech & Digital",
    overline: "Univers Numérique",
    tagline: "Bâtir le futur.",
    description:
      "Développeurs, community managers, techniciens IT, réparateurs — le numérique au service de vos projets.",
    gradient: ["#0B1F3A", "#25276B"],
    accent: "#6366F1",
  },
  education: {
    key: "education",
    label: "Cours & Formation",
    overline: "Univers Éducation",
    tagline: "Apprendre, à son rythme.",
    description:
      "Professeurs, tuteurs, coaches — cours particuliers, langues, musique, soutien scolaire personnalisé.",
    gradient: ["#0B1F3A", "#1F3A5E"],
    accent: "#3B82F6",
  },
  kids: {
    key: "kids",
    label: "Enfants & Baby-sitting",
    overline: "Univers Enfance",
    tagline: "Grandir en confiance.",
    description:
      "Baby-sitters vérifiés, nounous, animatrices — des mains bienveillantes pour vos enfants.",
    gradient: ["#4B1D3F", "#7A2D5A"],
    accent: "#EC4899",
  },
  pets: {
    key: "pets",
    label: "Animaux",
    overline: "Univers Animaux",
    tagline: "Vos compagnons, gâtés.",
    description:
      "Pet-sitters, dog-walkers, toiletteurs — vos amis à quatre pattes entre de bonnes mains.",
    gradient: ["#1F1F1F", "#4A2E00"],
    accent: "#F59E0B",
  },
  laundry: {
    key: "laundry",
    label: "Pressing & Couture",
    overline: "Univers Textile",
    tagline: "L'élégance, sur mesure.",
    description:
      "Pressings, couturières, tailleurs, brodeurs — chaque tissu retrouve sa splendeur.",
    gradient: ["#1F4A3B", "#0F5F3F"],
    accent: "#22C55E",
  },
  moving: {
    key: "moving",
    label: "Déménagement",
    overline: "Univers Logistique",
    tagline: "Changer de vie, en douceur.",
    description:
      "Déménageurs, manutentionnaires — chaque carton, chaque meuble, avec soin.",
    gradient: ["#3F1A0A", "#7A2D0E"],
    accent: "#F97316",
  },
  garden: {
    key: "garden",
    label: "Jardinage",
    overline: "Univers Extérieur",
    tagline: "Le vert, au naturel.",
    description:
      "Jardiniers, paysagistes — pour un extérieur qui respire la vie.",
    gradient: ["#1F4A3B", "#0F5F3F"],
    accent: "#22C55E",
  },
  errands: {
    key: "errands",
    label: "Courses & Assistance",
    overline: "Univers Assistance",
    tagline: "Déléguer le quotidien.",
    description:
      "Coursiers, assistantes personnelles — plus une minute à perdre.",
    gradient: ["#0B1F3A", "#1B3A5E"],
    accent: "#0EA5E9",
  },
  admin: {
    key: "admin",
    label: "Administratif",
    overline: "Univers Admin",
    tagline: "Vos papiers en règle.",
    description:
      "Comptables, assistants administratifs, notaires — pour naviguer sereinement dans l'administratif.",
    gradient: ["#2A1054", "#4B1D3F"],
    accent: "#8B5CF6",
  },
  creative: {
    key: "creative",
    label: "Création",
    overline: "Univers Création",
    tagline: "Raconter en images.",
    description:
      "Photographes, vidéastes, graphistes, monteurs — capturez et racontez vos plus beaux moments.",
    gradient: ["#0B1F3A", "#25276B"],
    accent: "#6366F1",
  },
  rental: {
    key: "rental",
    label: "Location de matériel",
    overline: "Univers Location",
    tagline: "Tout pour l'événement.",
    description:
      "Sono, tables, chaises, décoration événementielle — l'équipement pro à la journée.",
    gradient: ["#1F1F1F", "#4A2E00"],
    accent: "#F59E0B",
  },
  other: {
    key: "other",
    label: "Autres services",
    overline: "Univers Sur-mesure",
    tagline: "L'inclassable, à portée de main.",
    description:
      "Le sur-mesure, l'exceptionnel — trouvez le talent qu'il vous faut.",
    gradient: ["#1F1F1F", "#3A3A3A"],
    accent: "#64748B",
  },
};

export function getCategoryMeta(key: string): CategoryMeta {
  return CATEGORY_META[key] || CATEGORY_META.other;
}
