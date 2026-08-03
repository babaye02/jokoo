// Loader Instrument Serif — chargé depuis le CDN Google Fonts via expo-font.
// L'app utilise Instrument Serif pour les titres éditoriaux (font.serif).
// Fallback : si le chargement échoue, System font est utilisée.
import { useFonts } from "expo-font";

// URLs officielles Google Fonts (TTF)
const INSTRUMENT_SERIF_REG =
  "https://fonts.gstatic.com/s/instrumentserif/v9/jizAREVNn1dOx-zrZ2X3pZvkThUY.ttf";
const INSTRUMENT_SERIF_ITALIC =
  "https://fonts.gstatic.com/s/instrumentserif/v9/jizGREVNn1dOx-zrZ2X3pZvkTiFF7O_9.ttf";

export function useEditorialFonts() {
  const [loaded, error] = useFonts({
    InstrumentSerif: INSTRUMENT_SERIF_REG,
    InstrumentSerifItalic: INSTRUMENT_SERIF_ITALIC,
  });
  return [loaded, error] as const;
}
