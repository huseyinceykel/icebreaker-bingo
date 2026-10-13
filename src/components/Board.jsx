import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { claimSquare, findBingos, gridCols, cardsToBingo, isGameOpen } from "../game";
import { useI18n, cardText } from "../i18n";
import Confetti from "./Confetti";

// 10+ harfli kelime iceren kart: dar ekranda kelime ortadan bolunmesin diye yazi biraz kuculur
const hasLongWord = (text) => text.split(/\s+/).some((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length >= 10);

export default function Board({ user, profile, settings }) {
  const { t, lang } = useI18n();
  const { maxPerPerson } = settings;
  const [squares, setSquares] = useState([]);
  const [claims, setClaims] = useState({});
  const [active, setActive] = useState(null);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(i); }, []);
  useEffect(() => onSnapshot(query(collection(db, "squares"), orderBy("order")),
    (s) => setSquares(s.docs.map((d) => ({ id: d.id, ...d.data() })))), []);
  useEffect(() => onSnapshot(collection(db, "users", user.uid, "claims"),
    (s) => setClaims(Object.fromEntries(s.docs.map((d) => [d.id, d.data()])))), [user.uid]);

  const open = isGameOpen(settings, now);
  const bingos = useMemo(() => findBingos(squares, claims), [squares, claims]);
  const bingoCells = new Set(bingos.flat());
  const filled = squares.filter((s) => claims[s.id]).length;
  const total = squares.length || 1;
  const met = new Set(Object.values(claims).map((c) => c.targetUid)).size;
  const left = cardsToBingo(squares, claims);
  const done = squares.length > 0 && filled === squares.length;
  const fullMode = settings.winMode !== "line";

  // Yeni bingo olunca konfeti (sayfa ilk acilisinda calmaz)
  const prevBingos = useRef(null);
  const prevDone = useRef(null);
  useEffect(() => {
    if (!squares.length || Object.keys(claims).length === 0 && prevBingos.current === null) { prevBingos.current = bingos.length; prevDone.current = done; return; }
    if (prevBingos.current !== null && bingos.length > prevBingos.current) setConfetti((c) => c + 1);
    if (prevDone.current === false && done) setConfetti((c) => c + 1);
    prevBingos.current = bingos.length; prevDone.current = done;
  }, [bingos.length, done, squares.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = () => navigator.clipboard?.writeText(profile.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  const share = async () => {
    const text = t(done ? "shareDone" : "shareText", { event: settings.eventName || t("appName") });
    try {
      if (navigator.share) await navigator.share({ title: t("appName"), text, url: location.origin });
      else { await navigator.clipboard.writeText(`${text} ${location.origin}`); setShared(true); setTimeout(() => setShared(false), 1500); }
    } catch { /* kullanici vazgecti */ }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      const tgt = await claimSquare({
        user, profile, squareId: active.id, rawCode: input, claims, maxPerPerson, gameOpen: open,
      });
      setMsg(t("metWith", { name: tgt.name }));
      setActive(null); setInput("");
    } catch (err) { setMsg(err.key ? t(err.key, err.params) : t("errRejected")); }
    setBusy(false);
  };

  const notice = !settings.gameOpen ? t("gameClosed")
    : settings.openAt && now < settings.openAt ? t("notStarted", { time: new Date(settings.openAt).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) })
    : settings.closeAt && now >= settings.closeAt ? t("ended") : "";

  return (
    <main>
      <Confetti run={confetti} />
      <section className="mycode">
        <span>{t("yourCode")}</span>
        <strong>{profile.code}</strong>
        <small>{t("codeHint")}</small>
        <button onClick={copy}>{copied ? t("copied") : t("copy")}</button>
      </section>

      <div className="stats">
        <div><b>{filled}</b><span>{t("statSquares")}</span></div>
        <div><b>{met}</b><span>{t("statPeople")}</span></div>
        <div><b>{bingos.length}</b><span>{t("statBingo")}</span></div>
      </div>
      <div className="progress">
        <div className="bar"><i style={{ width: `${(filled / total) * 100}%` }} /></div>
        <p>
          <span>{t("squaresCount", { n: filled, total: squares.length })}</span>
          <span>{fullMode ? (done ? t("completedShort") : t("cardsLeft", { n: squares.length - filled })) : bingos.length > 0 ? t("bingoDone") : left != null ? t("toBingo", { n: left }) : ""}</span>
        </p>
      </div>

      {(done || bingos.length > 0) && (
        <div className="banner">
          <span>{done ? t("completeBanner") : t("bingoBanner")}</span>
          <button onClick={share}>{shared ? t("shareCopied") : t("share")}</button>
        </div>
      )}
      {notice && <div className="closed">{notice}</div>}
      {squares.length === 0 && <p className="empty">{t("noSquares")}</p>}

      <div className="grid" style={{ gridTemplateColumns: `repeat(${gridCols(squares.length)}, 1fr)` }}>
        {squares.map((s, i) => {
          const c = claims[s.id];
          return (
            <button key={s.id} className={`cell ${c ? "done" : ""} ${bingoCells.has(i) ? "bingo" : ""} ${hasLongWord(c ? c.targetName : cardText(s, lang)) ? "long" : ""}`}
              onClick={() => { if (!c && open) { setActive(s); setInput(""); setMsg(""); } }}>
              <i className="num">{i + 1}</i>
              {c ? <><span className="check">✓</span><em>{c.targetName}</em></> : <span>{cardText(s, lang)}</span>}
            </button>
          );
        })}
      </div>
      {msg && !active && <p className="toast">{msg}</p>}

      {active && (
        <div className="modal" onClick={() => setActive(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h2>{cardText(active, lang)}</h2>
            <p>{t("modalAsk")}</p>
            <input autoFocus value={input} maxLength={8} placeholder="ABC123" autoCapitalize="characters"
              autoComplete="off" onChange={(e) => setInput(e.target.value.toUpperCase())} />
            {msg && <p className="error">{msg}</p>}
            <div className="row">
              <button type="button" onClick={() => setActive(null)}>{t("cancel")}</button>
              <button className="primary" disabled={busy || !input}>{t("send")}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
