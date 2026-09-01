import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

const STORAGE_KEY = "profs-locale";

export function loadLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  return LOCALES.includes(stored as Locale) ? (stored as Locale) : "fr";
}

export function saveLocale(locale: Locale): void {
  localStorage.setItem(STORAGE_KEY, locale);
  i18n.changeLanguage(locale);
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: loadLocale(),
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
});

export default i18n;
