import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { onColor } from "./logic";

export const DEFAULT_SETTINGS = {
  eventName: "", eventInfo: "", footer: "", accent: "#1a73e8", maxPerPerson: 4, gameOpen: true, openAt: 0, closeAt: 0, winMode: "full", winnersCount: 10,
};

// config/settings dokumanini canli dinler; alan eksikse varsayilan kullanilir.
export function useSettings(uid = null) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  useEffect(() => onSnapshot(doc(db, "config", "settings"),
    (d) => {
      const data = { ...DEFAULT_SETTINGS, ...(d.data() || {}) };
      // Eski varsayilan mavi (#4285f4) beyaz yazi ile yetersiz kontrast verir -> okunakli mavi
      if (String(data.accent).toLowerCase() === "#4285f4") data.accent = DEFAULT_SETTINGS.accent;
      setSettings(data);
    },
    () => setSettings(DEFAULT_SETTINGS)), [uid]); // giris degisince yeniden dinle
  useEffect(() => {
    document.documentElement.style.setProperty("--blue", settings.accent);
    document.documentElement.style.setProperty("--on-blue", onColor(settings.accent));
    document.title = settings.eventName ? `${settings.eventName} · Bingo` : "Bingo";
  }, [settings.accent, settings.eventName]);
  return settings;
}
