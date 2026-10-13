import { useEffect, useMemo, useState } from "react";
import {
  collection, collectionGroup, onSnapshot, orderBy, query, limit,
  writeBatch, doc, addDoc, deleteDoc, getDocs, setDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { DEFAULT_SQUARES, findBingos, reviewState, completedAt } from "../game";
import { useI18n } from "../i18n";

const STATE_ORDER = { ok: 0, cleared: 0, pending: 0, disqualified: 1 }; // supheliler de ayni listede, sadece diskalifiye sona
const pad = (n) => String(n).padStart(2, "0");
// ms <-> <input type="datetime-local"> degeri (yerel saat)
const toLocalInput = (ms) => {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v) => (v ? new Date(v).getTime() : 0);

export default function Admin({ settings }) {
  const { t, lang } = useI18n();
  const [sub, setSub] = useState("scores");
  const [users, setUsers] = useState([]);
  const [claims, setClaims] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [squares, setSquares] = useState([]);
  const [reviews, setReviews] = useState({});
  const [open, setOpen] = useState(null);

  useEffect(() => {
    const subs = [
      onSnapshot(collection(db, "reviews"), (s) => setReviews(Object.fromEntries(s.docs.map((d) => [d.id, d.data().status])))),
      onSnapshot(collection(db, "users"), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collectionGroup(db, "claims"), (s) =>
        setClaims(s.docs.map((d) => ({ square: d.id, uid: d.ref.parent.parent.id, ...d.data() })))),
      onSnapshot(query(collection(db, "attempts"), orderBy("createdAt", "desc"), limit(100)),
        (s) => setAttempts(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "squares"), orderBy("order")),
        (s) => setSquares(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => subs.forEach((u) => u());
  }, []);

  // ---------- Siralama ----------
  const ms = (c) => c?.createdAt?.toMillis?.() ?? null;
  const clock = (m) => (m ? new Date(m).toLocaleTimeString(lang === "tr" ? "tr-TR" : "en-GB") : "-");

  const rows = useMemo(() => users.map((u) => {
    const mine = claims.filter((c) => c.uid === u.id);
    const bySquare = Object.fromEntries(mine.map((c) => [c.square, c]));
    const times = mine.map(ms).filter(Boolean).sort((a, b) => a - b);
    const span = times.length > 1 ? Math.round((times.at(-1) - times[0]) / 1000) : null;
    const bad = attempts.filter((a) => a.uid === u.id).length;
    const suspicious = bad >= 5 || (mine.length >= 5 && span !== null && span < 60);
    // Ilk bingo: tamamlanan cizgilerden son karesi en erken dolan
    const lineTimes = findBingos(squares, bySquare)
      .map((line) => Math.max(...line.map((i) => ms(bySquare[squares[i].id]) ?? 0)))
      .filter(Boolean);
    const bingoAt = lineTimes.length ? Math.min(...lineTimes) : null;
    const doneAt = completedAt(squares, bySquare, ms);
    const winAt = settings.winMode === "line" ? bingoAt : doneAt; // kazanma kuralini ilk saglayan
    const state = reviewState(suspicious, reviews[u.id]);
    return { ...u, count: mine.length, bad, span, suspicious, bingoAt, doneAt, winAt, lastAt: times.at(-1) ?? null, state, mine };
  }).sort((a, b) =>
    // supheli de olsa herkes tek listede hiza gore; yalniz diskalifiye edilenler en sonda
    STATE_ORDER[a.state] - STATE_ORDER[b.state]
    || (a.winAt ?? Infinity) - (b.winAt ?? Infinity)
    || b.count - a.count
    || (a.lastAt ?? Infinity) - (b.lastAt ?? Infinity)), [users, claims, attempts, squares, reviews, settings.winMode]);

  const review = (uid, status) => (status
    ? setDoc(doc(db, "reviews", uid), { status, updatedAt: serverTimestamp() })
    : deleteDoc(doc(db, "reviews", uid)));

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["rank", "name", "email", "code", "squares", "first_bingo", "completed_at", "last_square", "failed_attempts", "suspicious", "review"];
    const lines = rows.map((r, i) => [
      r.state !== "disqualified" && r.count > 0 ? rows.slice(0, i).filter((x) => x.state !== "disqualified" && x.count > 0).length + 1 : "", r.name, r.email, r.code, r.count,
      r.bingoAt ? new Date(r.bingoAt).toISOString() : "", r.doneAt ? new Date(r.doneAt).toISOString() : "", r.lastAt ? new Date(r.lastAt).toISOString() : "",
      r.bad, r.suspicious ? "yes" : "", r.state,
    ].map(esc).join(","));
    const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bingo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---------- Ayarlar ----------
  const [draft, setDraft] = useState(settings);
  const [savedMsg, setSavedMsg] = useState(false);
  useEffect(() => setDraft(settings), [settings]);
  const saveSettings = async () => {
    await setDoc(doc(db, "config", "settings"), {
      eventName: (draft.eventName || "").trim().slice(0, 60),
      eventInfo: (draft.eventInfo || "").trim().slice(0, 100),
      footer: (draft.footer || "").trim().slice(0, 120),
      accent: /^#[0-9a-fA-F]{6}$/.test(draft.accent) ? draft.accent : "#1a73e8",
      maxPerPerson: Math.min(25, Math.max(1, parseInt(draft.maxPerPerson, 10) || 1)),
      gameOpen: !!draft.gameOpen,
      winMode: draft.winMode === "line" ? "line" : "full",
      winnersCount: Math.min(100, Math.max(1, parseInt(draft.winnersCount, 10) || 10)),
      openAt: draft.openAt || 0,
      closeAt: draft.closeAt || 0,
    });
    setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2000);
  };

  // Kazananlar sayfasindaki kisi sayisi secimi: mevcut ayarlari koruyup tek alani gunceller
  const setWinnersCount = (v) => {
    const n = Math.min(100, Math.max(1, parseInt(v, 10) || 1));
    return setDoc(doc(db, "config", "settings"), {
      eventName: settings.eventName || "", eventInfo: settings.eventInfo || "", footer: settings.footer || "",
      accent: settings.accent, maxPerPerson: settings.maxPerPerson, gameOpen: !!settings.gameOpen,
      winMode: settings.winMode === "line" ? "line" : "full", openAt: settings.openAt || 0, closeAt: settings.closeAt || 0,
      winnersCount: n,
    });
  };

  // ---------- Sifirlama ----------
  const [resetting, setResetting] = useState(false);
  const deleteAll = async (refs) => {
    for (let i = 0; i < refs.length; i += 400) {
      const b = writeBatch(db);
      refs.slice(i, i + 400).forEach((r) => b.delete(r));
      await b.commit();
    }
  };
  const resetGame = async (full) => {
    const word = full ? t("wordFull") : t("wordSoft");
    if (prompt(t(full ? "resetConfirmFull" : "resetConfirmSoft", { word })) !== word) return;
    setResetting(true);
    try {
      const refs = [];
      claims.forEach((c) => {
        refs.push(doc(db, "users", c.uid, "claims", c.square));
        refs.push(doc(db, "users", c.uid, "met", c.targetUid));
      });
      (await getDocs(collection(db, "attempts"))).forEach((d) => refs.push(d.ref));
      if (full) users.forEach((u) => { refs.push(doc(db, "codes", u.code)); refs.push(doc(db, "users", u.id)); });
      await deleteAll(refs);
      alert(t("resetDone"));
    } catch (e) { alert(t("resetErr", { msg: e.message })); }
    setResetting(false);
  };

  // ---------- Kartlar ----------
  const [bulk, setBulk] = useState("");
  const [one, setOne] = useState("");
  const nextOrder = () => (squares.length ? Math.max(...squares.map((s) => s.order)) + 1 : 0);
  const parseLine = (l) => {
    const [tr, en] = l.split("|").map((x) => x.trim());
    return { text: tr, textEn: en || "" };
  };
  const seed = async () => {
    const b = writeBatch(db);
    DEFAULT_SQUARES.forEach((s) => b.set(doc(db, "squares", s.id), { text: s.text, textEn: s.textEn, order: s.order }));
    await b.commit();
  };
  const addOne = async () => {
    if (!one.trim()) return;
    await addDoc(collection(db, "squares"), { ...parseLine(one), order: nextOrder() });
    setOne("");
  };
  const addBulk = async () => {
    const lines = bulk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const b = writeBatch(db);
    const start = nextOrder();
    lines.forEach((l, i) => b.set(doc(collection(db, "squares")), { ...parseLine(l), order: start + i }));
    await b.commit();
    setBulk("");
  };
  const saveField = (s, field, value) => {
    const v = value.trim();
    if (v === (s[field] || "") || (field === "text" && !v)) return;
    return updateDoc(doc(db, "squares", s.id), { [field]: v });
  };
  const used = (s) => claims.filter((c) => c.square === s.id).length;
  const remove = async (s) => {
    const n = used(s);
    if (!confirm(n ? t("delConfirmUsed", { n }) : t("delConfirm"))) return;
    await deleteDoc(doc(db, "squares", s.id));
  };
  const move = async (i, dir) => {
    const a = squares[i], c = squares[i + dir];
    if (!c) return;
    const b = writeBatch(db);
    b.update(doc(db, "squares", a.id), { order: c.order });
    b.update(doc(db, "squares", c.id), { order: a.order });
    await b.commit();
  };

  const medal = (i) => ["🥇", "🥈", "🥉"][i] || `${i + 1}`;
  // Diskalifiye edilmeyen herkes (supheli de olsa) kazananlarda gorunur; hic kart doldurmayanlar girmez
  const winners = rows.filter((r) => r.state !== "disqualified" && r.count > 0).slice(0, settings.winnersCount || 10);
  const pendingN = rows.filter((r) => r.state === "pending").length;
  const disqN = rows.filter((r) => r.state === "disqualified").length;

  return (
    <main className="admin">
      <div className="subtabs">
        {[["scores", "adminScores"], ["winners", "adminWinners"], ["settings", "adminSettings"], ["cards", "adminCards"]].map(([k, label]) => (
          <button key={k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}>{t(label)}</button>
        ))}
      </div>

      {sub === "scores" && (
        <>
          <div className="titlerow">
            <h2>{t("scoreboard", { n: users.length })}</h2>
            <button onClick={exportCsv} disabled={!rows.length}>⬇ {t("exportCsv")}</button>
          </div>
          <p className="hint">{t("scoreboardHint")}</p>
          <div className="tablewrap">
            <table>
              <thead><tr>
                <th>#</th><th>{t("colName")}</th><th className="opt2">{t("colCode")}</th><th className="num">{t("colSquares")}</th>
                <th className="opt">{t("colFirstBingo")}</th><th>{t("colDone")}</th><th className="opt">{t("colLast")}</th><th className="num opt2">{t("colWrong")}</th>
                <th className="num opt">{t("colSeconds")}</th><th className="opt2"></th><th></th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const rank = rows.slice(0, i).filter((x) => x.state !== "disqualified" && x.count > 0).length + 1;
                  return [
                    <tr key={r.id} className={`${r.suspicious ? "sus" : ""} st-${r.state}`}>
                      <td>{r.state === "disqualified" ? "✕" : r.count > 0 ? <>{rank}{r.state === "pending" && <span title={t("pending")}> ⏳</span>}</> : "–"}</td>
                      <td><button className="link" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "▾" : "▸"} {r.name}</button></td>
                      <td className="mono opt2">{r.code}</td><td className="num">{r.count}</td>
                      <td className="opt">{clock(r.bingoAt)}</td><td>{clock(r.doneAt)}</td><td className="opt">{clock(r.lastAt)}</td><td className="num opt2">{r.bad}</td>
                      <td className="num opt">{r.span ?? "-"}</td>
                      <td className="opt2">{r.state !== "ok" ? <span className={`pill ${r.state}`}>{t(r.state)}</span> : r.suspicious ? <span className="pill">{t("suspicious")}</span> : ""}</td>
                      <td className="acts">
                        {r.state !== "cleared" && r.state !== "disqualified" && r.suspicious && <button className="mini ok" onClick={() => review(r.id, "cleared")}>✓ {t("actClear")}</button>}
                        {r.state !== "disqualified" && <button className="mini bad" onClick={() => review(r.id, "disqualified")}>✕ {t("actDisq")}</button>}
                        {(r.state === "cleared" || r.state === "disqualified") && <button className="mini" onClick={() => review(r.id, null)}>↺ {t("actUndo")}</button>}
                      </td>
                    </tr>,
                    open === r.id && (
                      <tr key={r.id + "d"} className="detail"><td colSpan={11}>
                        <div className="detailgrid">
                          <div>
                            <b>{t("detailsClaims")} ({r.mine.length})</b>
                            {r.mine.length === 0 ? <p className="hint">{t("detailsNone")}</p> : (
                              <ul>{[...r.mine].sort((x, y) => (ms(x) ?? 0) - (ms(y) ?? 0)).map((c) => (
                                <li key={c.square}><span className="mono">{clock(ms(c))}</span> · {squares.find((s) => s.id === c.square)?.text ?? c.square} → <b>{c.targetName}</b></li>
                              ))}</ul>
                            )}
                          </div>
                          <div>
                            <b>{t("detailsAttempts")} ({r.bad})</b>
                            {r.bad === 0 ? <p className="hint">{t("detailsNone")}</p> : (
                              <ul>{attempts.filter((x) => x.uid === r.id).map((x) => (
                                <li key={x.id}><span className="mono">{clock(ms(x))}</span> · <span className="mono">{x.code}</span> · {x.reason}</li>
                              ))}</ul>
                            )}
                          </div>
                        </div>
                      </td></tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>

          <h2>{t("recentAttempts")}</h2>
          <div className="tablewrap">
            <table>
              <thead><tr><th>{t("colWho")}</th><th>{t("colEntered")}</th><th>{t("colSquare")}</th><th>{t("colReason")}</th></tr></thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id}><td>{a.name}</td><td className="mono">{a.code}</td><td>{a.squareId}</td><td>{a.reason}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sub === "winners" && (
        <div className="winners">
          <h2>{settings.eventName ? `${settings.eventName} · ` : ""}{t("winnersTitle")}</h2>
          <label className="countpick">{t("winnersShow")}
            <input type="number" min="1" max="100" value={settings.winnersCount || 10}
              onChange={(e) => setWinnersCount(e.target.value)} />
          </label>
          {!winners.some((w) => w.winAt) && <p className="hint">{t("noWinners")}</p>}
          {pendingN > 0 && <p className="reviewnote">⏳ {t("winnersPending", { n: pendingN })}</p>}
          {disqN > 0 && <p className="hint">{t("winnersDisq", { n: disqN })}</p>}
          <ol>
            {winners.map((w, i) => (
              <li key={w.id} className={w.winAt ? "has" : ""}>
                <span className="rank">{medal(i)}</span>
                <span className="who">{w.name}{w.state === "pending" && <span className="pendingmark" title={t("pending")}> ⏳</span>}</span>
                <span className="meta">{w.winAt ? <><b>{t(settings.winMode === "line" ? "bingoBadge" : "doneBadge")}</b> {clock(w.winAt)}</> : t("squaresCount", { n: w.count, total: squares.length })}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {sub === "settings" && (
        <>
          <h2>{t("settingsTitle")}</h2>
          <div className="form">
            <label>{t("eventName")}
              <input value={draft.eventName} maxLength={60} placeholder="My Event 2026"
                onChange={(e) => setDraft({ ...draft, eventName: e.target.value })} />
            </label>
            <label>{t("eventInfo")}
              <input value={draft.eventInfo} maxLength={100} placeholder="12 Oct · City"
                onChange={(e) => setDraft({ ...draft, eventInfo: e.target.value })} />
            </label>
            <label>{t("footerLabel")}
              <input value={draft.footer} maxLength={120} placeholder="Organizer / community"
                onChange={(e) => setDraft({ ...draft, footer: e.target.value })} />
            </label>
            <label>{t("accentColor")}
              <input type="color" value={draft.accent} onChange={(e) => setDraft({ ...draft, accent: e.target.value })} />
            </label>
            <label>{t("winMode")}
              <select value={draft.winMode || "full"} onChange={(e) => setDraft({ ...draft, winMode: e.target.value })}>
                <option value="full">{t("winFull")}</option>
                <option value="line">{t("winLine")}</option>
              </select>
            </label>
            <label className="inline">{t("maxPre")}
              <input type="number" min="1" max="25" value={draft.maxPerPerson} style={{ width: 70 }}
                onChange={(e) => setDraft({ ...draft, maxPerPerson: e.target.value })} />
              {t("maxPost")}
            </label>
            <label>{t("openAt")}
              <input type="datetime-local" value={toLocalInput(draft.openAt)}
                onChange={(e) => setDraft({ ...draft, openAt: fromLocalInput(e.target.value) })} />
            </label>
            <label>{t("closeAt")}
              <input type="datetime-local" value={toLocalInput(draft.closeAt)}
                onChange={(e) => setDraft({ ...draft, closeAt: fromLocalInput(e.target.value) })} />
            </label>
            <p className="hint">{t("timeHint")}</p>
            <label className="inline">
              <input type="checkbox" checked={!!draft.gameOpen} style={{ width: "auto" }}
                onChange={(e) => setDraft({ ...draft, gameOpen: e.target.checked })} />
              {t("gameOpenLabel")}
            </label>
            <button className="primary" onClick={saveSettings}>{savedMsg ? t("saved") : t("saveSettings")}</button>
          </div>

          <h2>{t("resetTitle")}</h2>
          <p className="hint">{t("resetHint")}</p>
          <div className="sqrow">
            <button onClick={() => resetGame(false)} disabled={resetting}>{t("resetGame")}</button>
            <button className="danger" onClick={() => resetGame(true)} disabled={resetting}>{t("resetAll")}</button>
          </div>
        </>
      )}

      {sub === "cards" && (
        <>
          <h2>{t("cardsTitle", { n: squares.length })}</h2>
          <p className="hint">{t("cardsHint", { n: squares.length })}</p>
          {squares.length === 0 && <button className="primary" onClick={seed}>{t("seed")}</button>}
          <div className="sqrow">
            <input value={one} placeholder={t("newCardPh")} onChange={(e) => setOne(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addOne()} />
            <button className="primary" onClick={addOne}>{t("add")}</button>
          </div>
          <textarea value={bulk} rows={4} placeholder={t("bulkPh")} onChange={(e) => setBulk(e.target.value)} />
          <button onClick={addBulk} disabled={!bulk.trim()}>{t("bulkAdd")}</button>
          <div className="sqlist">
            {squares.map((s, i) => (
              <div className="sqrow" key={s.id}>
                <b>{i + 1}</b>
                <div className="pair">
                  <input defaultValue={s.text} onBlur={(e) => saveField(s, "text", e.target.value)} />
                  <input defaultValue={s.textEn || ""} placeholder={t("enPh")} onBlur={(e) => saveField(s, "textEn", e.target.value)} />
                </div>
                <button onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button onClick={() => move(i, 1)} disabled={i === squares.length - 1}>↓</button>
                <button onClick={() => remove(s)}>🗑</button>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
