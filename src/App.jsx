import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider, ADMIN_EMAIL } from "./firebase";
import { ensureUser } from "./game";
import { useI18n, LangSwitch } from "./i18n";
import { useSettings } from "./settings";
import Board from "./components/Board";
import Admin from "./components/Admin";

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { const v = localStorage.getItem("theme"); if (v) return v; } catch { /* yok */ }
    return matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("theme", theme); } catch { /* yok */ }
  }, [theme]);
  return [theme, () => setTheme((x) => (x === "dark" ? "light" : "dark"))];
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const { t } = useI18n();
  const [user, setUser] = useState(undefined);
  const settings = useSettings(user?.uid ?? null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("board");
  const [signing, setSigning] = useState(false);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u);
    setProfile(null);
    if (!u) return;
    try { setProfile(await ensureUser(u)); }
    catch (e) { setError(t("profileFailed", { msg: e.message })); }
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const inApp = /FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp|Snapchat|TikTok|; wv\)/i.test(navigator.userAgent);

  const login = async () => {
    if (signing) return; // cift tiklama ikinci popup acip cancelled-popup-request hatasi veriyordu
    setSigning(true); setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      const quiet = ["auth/cancelled-popup-request", "auth/popup-closed-by-user"];
      if (e.code === "auth/popup-blocked") setError(t("popupBlocked"));
      else if (e.code === "auth/network-request-failed") setError(t("networkFail"));
      else if (!quiet.includes(e.code)) setError(t("loginFailed", { msg: e.code || e.message }));
    }
    setSigning(false);
  };
  const isAdmin = !!ADMIN_EMAIL && user?.email?.toLowerCase() === ADMIN_EMAIL && user?.emailVerified;

  if (user === undefined) return <div className="center">{t("loading")}</div>;

  if (!user) {
    const [first, ...rest] = t("appName").split(" ");
    return (
      <div className="center login">
        <div className="topbar"><LangSwitch /><button className="icon" onClick={toggleTheme} aria-label="theme">{theme === "dark" ? "☀️" : "🌙"}</button></div>
        <div className="dots"><i /><i /><i /><i /></div>
        <h1>{first} <span>{rest.join(" ")}</span></h1>
        {settings.eventName && <p className="eventname">{settings.eventName}</p>}
        {settings.eventInfo && <p className="eventinfo">{settings.eventInfo}</p>}
        <p>{settings.eventName ? t("taglineEvent", { event: settings.eventName }) : t("taglineGeneric")}</p>
        {inApp && <p className="error">{t("inApp")}</p>}
        <button className="primary" onClick={login} disabled={signing}>{signing ? t("loggingIn") : t("login")}</button>
        {error && <p className="error">{error}</p>}
        {settings.footer && <footer className="loginfooter">{settings.footer}</footer>}
      </div>
    );
  }

  return (
    <div className={`app ${tab === "admin" && isAdmin ? "wide" : ""}`}>
      <header>
        <h1>
          <span className="dots"><i /><i /><i /><i /></span>
          <span>{t("appName")}{settings.eventName && <small className="event">{settings.eventName}</small>}</span>
        </h1>
        <div className="who">
          <LangSwitch />
          <button className="icon" onClick={toggleTheme} aria-label="theme">{theme === "dark" ? "☀️" : "🌙"}</button>
          {user.photoURL && <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />}
          <button onClick={() => signOut(auth)}>{t("logout")}</button>
        </div>
      </header>
      {isAdmin && (
        <nav>
          <button className={tab === "board" ? "on" : ""} onClick={() => setTab("board")}>{t("tabGame")}</button>
          <button className={tab === "admin" ? "on" : ""} onClick={() => setTab("admin")}>{t("tabAdmin")}</button>
        </nav>
      )}
      {error && <p className="error">{error}</p>}
      {!profile ? <div className="center">{t("profileCreating")}</div>
        : tab === "admin" && isAdmin ? <Admin settings={settings} />
        : <Board user={user} profile={profile} settings={settings} />}
      {(settings.footer || settings.eventInfo) && (
        <footer>{settings.eventInfo && <span>{settings.eventInfo}</span>}{settings.footer && <span>{settings.footer}</span>}</footer>
      )}
    </div>
  );
}
