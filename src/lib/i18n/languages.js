// Languages guests can choose. Order = order shown in the language menu.
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "zh", name: "中文" },
  { code: "es", name: "Español" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "ar", name: "العربية", rtl: true },
  { code: "ru", name: "Русский" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "tr", name: "Türkçe" },
];

export const DEFAULT_LANG = "en";

/** A supported language code, or the default. */
export function pickLang(code) {
  const c = String(code || "")
    .toLowerCase()
    .slice(0, 2);
  return LANGUAGES.some((l) => l.code === c) ? c : DEFAULT_LANG;
}

export function isRtl(code) {
  return LANGUAGES.find((l) => l.code === code)?.rtl === true;
}
