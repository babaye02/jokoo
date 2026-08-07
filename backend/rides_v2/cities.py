"""
rides_v2.cities — Normalisation des villes & quartiers du Sénégal
==================================================================

Objectif : quand un utilisateur saisit "Plateau", "Mermoz", "Point E", "Almadies",
"Ouakam", … tous ces quartiers sont automatiquement rattachés à leur ville-mère
(ici "Dakar") pour permettre un matching intelligent sans géocodage.

Architecture :
- CITY_ALIASES     : dict { "quartier|variante" -> "ville_canonique" }
- KNOWN_CITIES     : ensemble de villes canoniques connues (pour autocomplete)
- normalize_city() : chaîne libre -> forme canonique (accents/majuscules retirés)
- resolve_city()   : chaîne libre -> ville-mère canonique (via alias) ou fallback
- city_matches()   : test d'équivalence entre deux entrées libres
- district_hint()  : renvoie le quartier détecté, s'il existe (pour affichage)

V1 = matching par nom (ce fichier).
V2 sera greffée en ajoutant `resolve_coords(name) -> (lat, lng)` et
`radius_km` dans matching.py sans modifier ce module.
"""

from __future__ import annotations
import re
import unicodedata
from typing import Optional


# ─── Dictionnaire quartiers → ville-mère ─────────────────────────────
# La convention est : clé et valeur en minuscules, sans accent.
# `resolve_city` s'occupe de normaliser l'entrée avant le lookup.

_DAKAR_DISTRICTS = [
    "plateau", "point e", "point-e", "medina", "mermoz", "sacre coeur",
    "sacre-coeur", "sacré-coeur", "sacré cœur", "sacre cœur",
    "almadies", "ouakam", "ngor", "yoff", "yoff-virage", "yoff virage",
    "hann", "hann bel air", "hann-bel-air", "colobane", "grand yoff",
    "grand-yoff", "liberte", "liberté", "liberte 1", "liberte 2",
    "liberte 3", "liberte 4", "liberte 5", "liberte 6", "hlm",
    "hlm grand yoff", "sicap", "sicap liberte", "sicap-liberte",
    "sicap baobab", "sicap-baobab", "sicap sacre coeur",
    "sicap amitie", "amitie", "amitié", "castors", "dieuppeul",
    "dieuppeul-derkle", "derkle", "gueule tapee", "gueule-tapée",
    "gueule tapée", "front de terre", "front-de-terre", "cite keur gorgui",
    "keur gorgui", "keur damel", "corniche", "corniche ouest",
    "corniche est", "fenetre mermoz", "fenêtre mermoz", "cambérène",
    "camberene", "yeumbeul", "guediawaye", "guédiawaye", "pikine",
    "parcelles assainies", "parcelles-assainies", "parcelles",
    "sam notaire", "sam-notaire", "wakhinane", "wakhinane nimzatt",
    "golf sud", "sahm notaire", "thiaroye", "thiaroye sur mer",
    "malika", "keur massar", "keur-massar", "rufisque", "bargny",
    "diamniadio", "sebikotane", "sébikotane", "diass", "sangalkam",
    "cite mixta", "cité mixta", "off-dakar", "off dakar", "dakar centre",
    "dakar-centre", "centre-ville", "centre ville",
]

_THIES_DISTRICTS = [
    "randoulene", "randoulène", "thialy", "grand thiès", "grand-thies",
    "grand thies", "medina fall", "médina fall", "medina-fall",
    "hlm thies", "hlm-thies", "keur mame el hadji", "keur-mame-el-hadji",
    "thies centre", "thiès centre", "thies-centre", "thies nord",
    "thies-nord", "cité malick sy", "cite malick sy",
]

_SAINT_LOUIS_DISTRICTS = [
    "sor", "ndar", "guet ndar", "guet-ndar", "goxu mbacc", "goxu-mbacc",
    "pikine saint louis", "leona", "léona", "diamaguene",
    "diamaguène", "north saint-louis", "sud saint-louis",
    "st louis", "st-louis", "st. louis", "saint louis", "saint-louis",
]

_MBOUR_DISTRICTS = [
    "saly", "saly portudal", "saly-portudal", "nianing", "warang",
    "somone", "la somone", "ngaparou", "ndayane", "popenguine",
    "gandigal", "malicounda", "mbour centre", "mbour-centre",
    "santhie", "santhié",
]

_TOUBA_MBACKE_DISTRICTS = [
    "mbacke", "mbacké", "touba", "darou marnane", "darou-marnane",
    "darou mousty", "darou-mousty", "guede", "gueule tapee touba",
]

_KAOLACK_DISTRICTS = [
    "medina baye", "médina baye", "medina-baye", "kaolack centre",
    "kaolack-centre", "leona kaolack", "sing sing", "sing-sing",
    "kasnack", "gawane",
]

_ZIGUINCHOR_DISTRICTS = [
    "ziguinchor centre", "boucotte", "kandé", "kande", "colobane ziguinchor",
    "peyrissac", "casamance",
]

_KAFFRINE_DISTRICTS = ["kaffrine centre", "diourbel"]
_LOUGA_DISTRICTS = ["louga centre", "keur cheikh", "linguere", "linguère"]
_TAMBACOUNDA_DISTRICTS = ["tamba", "tamba centre", "tambacounda-centre"]
_KEDOUGOU_DISTRICTS = ["kedougou centre", "kédougou-centre"]
_KOLDA_DISTRICTS = ["kolda centre", "velingara", "vélingara"]
_FATICK_DISTRICTS = ["fatick centre", "gossas", "diakhao"]
_MATAM_DISTRICTS = ["matam centre", "ourossogui", "kanel"]
_SEDHIOU_DISTRICTS = ["sedhiou centre", "sédhiou centre", "bounkiling"]


# Ville canonique (en minuscules sans accent) -> liste de districts/variantes
_CITIES_WITH_DISTRICTS: dict[str, list[str]] = {
    "dakar": _DAKAR_DISTRICTS,
    "thies": _THIES_DISTRICTS,
    "saint-louis": _SAINT_LOUIS_DISTRICTS,
    "mbour": _MBOUR_DISTRICTS,
    "mbacke": _TOUBA_MBACKE_DISTRICTS,
    "kaolack": _KAOLACK_DISTRICTS,
    "ziguinchor": _ZIGUINCHOR_DISTRICTS,
    "kaffrine": _KAFFRINE_DISTRICTS,
    "louga": _LOUGA_DISTRICTS,
    "tambacounda": _TAMBACOUNDA_DISTRICTS,
    "kedougou": _KEDOUGOU_DISTRICTS,
    "kolda": _KOLDA_DISTRICTS,
    "fatick": _FATICK_DISTRICTS,
    "matam": _MATAM_DISTRICTS,
    "sedhiou": _SEDHIOU_DISTRICTS,
}


# Villes canoniques additionnelles sans quartiers listés
_OTHER_KNOWN_CITIES: list[str] = [
    "dahra", "richard toll", "richard-toll", "podor", "bakel",
    "tivaouane", "khombole", "bambey", "guinguineo", "kaffrine",
    "birkelane", "malem hodar", "malem-hodar", "koumpentoum",
    "goudiry", "salemata", "saraya", "medina yoro foulah",
    "médina yoro foulah", "mbao", "sindia", "gorée", "goree",
    "joal", "joal-fadiouth", "fadiouth", "palmarin", "toubab dialaw",
    "toubab-dialaw", "ndangane", "foundiougne", "sokone", "karang",
    "oussouye", "cap skirring", "cap-skirring", "elinkine",
    "diamniadio", "poponguine", "popenguine",
]


# ─── Build reverse alias map (district -> canonical city) ────────────

CITY_ALIASES: dict[str, str] = {}
KNOWN_CITIES: set[str] = set()

for _city, _districts in _CITIES_WITH_DISTRICTS.items():
    KNOWN_CITIES.add(_city)
    CITY_ALIASES[_city] = _city  # ville elle-même
    for _d in _districts:
        CITY_ALIASES[_d] = _city

for _c in _OTHER_KNOWN_CITIES:
    KNOWN_CITIES.add(_c)
    CITY_ALIASES.setdefault(_c, _c)


# ─── Display labels for canonical cities (accent-preserving) ─────────

CITY_DISPLAY: dict[str, str] = {
    "dakar": "Dakar",
    "thies": "Thiès",
    "saint-louis": "Saint-Louis",
    "mbour": "Mbour",
    "mbacke": "Mbacké / Touba",
    "kaolack": "Kaolack",
    "ziguinchor": "Ziguinchor",
    "kaffrine": "Kaffrine",
    "louga": "Louga",
    "tambacounda": "Tambacounda",
    "kedougou": "Kédougou",
    "kolda": "Kolda",
    "fatick": "Fatick",
    "matam": "Matam",
    "sedhiou": "Sédhiou",
    "dahra": "Dahra",
    "richard-toll": "Richard-Toll",
    "podor": "Podor",
    "bakel": "Bakel",
    "tivaouane": "Tivaouane",
    "khombole": "Khombole",
    "bambey": "Bambey",
    "diamniadio": "Diamniadio",
    "joal-fadiouth": "Joal-Fadiouth",
    "gorée": "Gorée",
    "goree": "Gorée",
    "cap-skirring": "Cap-Skirring",
    "cap skirring": "Cap-Skirring",
}


# ─── Public API ──────────────────────────────────────────────────────

def normalize_city(text: Optional[str]) -> str:
    """Retire accents, met en minuscules, réduit les espaces, retire ponctuation légère."""
    if not text:
        return ""
    t = unicodedata.normalize("NFD", str(text))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = t.lower().strip()
    t = re.sub(r"[.,;:!?()\[\]{}]", " ", t)
    t = re.sub(r"\s+", " ", t)
    # Normaliser les tirets multiples et remplacer certaines écritures usuelles
    t = t.replace(" - ", "-")
    t = t.replace("–", "-").replace("—", "-")
    return t


def resolve_city(text: Optional[str]) -> str:
    """
    Retourne la ville canonique pour une entrée libre.
    Reconnaît quartiers, variantes, tirets ("Saint Louis" -> "saint-louis").
    Fallback : retourne la version normalisée si aucune correspondance.
    """
    n = normalize_city(text)
    if not n:
        return ""
    # 1. Match direct
    if n in CITY_ALIASES:
        return CITY_ALIASES[n]
    # 2. Match avec/sans tiret
    n_dash = n.replace(" ", "-")
    if n_dash in CITY_ALIASES:
        return CITY_ALIASES[n_dash]
    n_space = n.replace("-", " ")
    if n_space in CITY_ALIASES:
        return CITY_ALIASES[n_space]
    # 3. Fuzzy prefix match sur les villes connues (>=4 chars)
    if len(n) >= 4:
        for key in CITY_ALIASES:
            if key.startswith(n) or n.startswith(key):
                # priorité aux villes canoniques
                if CITY_ALIASES[key] in KNOWN_CITIES:
                    return CITY_ALIASES[key]
    # 4. Fallback : retourne la version normalisée
    return n


def city_display(canonical: str) -> str:
    """Retourne l'affichage propre d'une ville canonique."""
    if canonical in CITY_DISPLAY:
        return CITY_DISPLAY[canonical]
    # Fallback : capitalize + remplacer tirets par espaces
    return " ".join(part.capitalize() for part in canonical.replace("-", " ").split())


def district_hint(text: Optional[str]) -> Optional[str]:
    """
    Retourne le quartier détecté (non normalisé — utile pour l'affichage
    "Dakar · Plateau"). Renvoie None si l'entrée est une ville-mère.
    """
    if not text:
        return None
    n = normalize_city(text)
    if n in KNOWN_CITIES:
        return None
    if n in CITY_ALIASES:
        # Le mot lui-même est un district — on retourne l'original nettoyé
        return str(text).strip()
    return None


def city_matches(a: Optional[str], b: Optional[str]) -> bool:
    """Test d'équivalence entre deux entrées libres, via résolution canonique."""
    ra = resolve_city(a)
    rb = resolve_city(b)
    if not ra or not rb:
        return False
    return ra == rb


def all_cities_for_autocomplete() -> list[dict]:
    """
    Retourne la liste des villes canoniques + leurs variantes principales,
    pour alimenter un autocomplete côté client.

    Les synonymes directionnels ou basiques (ex: "saint louis", "st-louis",
    "north saint-louis", "dakar centre") sont filtrés pour ne garder que
    les vrais quartiers/points d'intérêt qui ont du sens comme label.

    Format :
        [{ "canonical": "dakar",
           "label": "Dakar",
           "aliases": ["Plateau", "Mermoz", ...] }, ...]
    """
    out = []

    # Préfixes/motifs à exclure de l'autocomplete (mais gardés pour la résolution)
    directional_prefixes = ("north ", "nord ", "sud ", "south ", "est ", "east ", "ouest ", "west ")

    def _is_display_worthy(alias: str, canonical: str) -> bool:
        a = alias.strip().lower()
        c = canonical.strip().lower()
        # 1) mot exact ou variation orthographique de la ville canonique
        if a == c or a.replace("-", " ") == c.replace("-", " "):
            return False
        # 2) directionnel
        if a.startswith(directional_prefixes):
            return False
        # 3) "<ville> centre"
        c_base = c.split("-")[0]
        if a in {f"{c} centre", f"{c_base} centre", f"{c}-centre", f"{c_base}-centre"}:
            return False
        # 4) abréviations "st louis", "st-louis" pour saint-louis
        if a.startswith("st ") or a.startswith("st-") or a.startswith("st."):
            return False
        # 5) synonyme évident (ex: "guédiawaye" quand canonical=guediawaye)
        return True

    for c in sorted(KNOWN_CITIES):
        aliases = [
            _pretty_alias(a) for a, canon in CITY_ALIASES.items()
            if canon == c and a != c and _is_display_worthy(a, c)
        ]
        # Dédupliquer en gardant l'ordre
        seen: set[str] = set()
        aliases_unique: list[str] = []
        for a in aliases:
            key = a.lower()
            if key not in seen:
                seen.add(key)
                aliases_unique.append(a)
        out.append({
            "canonical": c,
            "label": city_display(c),
            "aliases": aliases_unique[:20],
        })
    return out


def _pretty_alias(a: str) -> str:
    """Rend un alias en Title Case tout en respectant les tirets et accents connus."""
    # Cas spéciaux
    special = {
        "hlm": "HLM",
        "sicap": "SICAP",
    }
    parts = a.split(" ")
    out_parts = []
    for p in parts:
        if p in special:
            out_parts.append(special[p])
        else:
            sub = p.split("-")
            out_parts.append("-".join(x.capitalize() for x in sub))
    return " ".join(out_parts)
