import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { dict } from "./i18n-dict";

const LangCtx = createContext(null);

function initialLang() {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "tr" || saved === "en") return saved;
  } catch { /* localStorage kullanilamiyor */ }
  return (navigator.language || "tr").toLowerCase().startsWith("tr") ? "tr" : "en";
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);
  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem("lang", l); } catch { /* yoksay */ }
    document.documentElement.lang = l;
  }, []);
  const t = useCallback((key, vars = {}) => {
    const s = dict[lang][key] ?? dict.tr[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
  }, [lang]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]); // hyphens ve ekran okuyucular icin
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const useI18n = () => useContext(LangCtx);

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang">
      {["tr", "en"].map((l) => (
        <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

// Karti secili dilde goster (textEn yoksa Turkce metne duser)
export const cardText = (s, lang) => (lang === "en" && s.textEn) || s.text;
