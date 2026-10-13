import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { buildRules } from "../scripts/build-rules.mjs";
import { readFileSync } from "fs";
import { doc, getDoc, setDoc, writeBatch, serverTimestamp } from "firebase/firestore";

const N = 200, SQUARES = 25;
const env = await initializeTestEnvironment({
  projectId: "demo-bingo-load",
  firestore: { rules: buildRules("admin@example.com"), host: "127.0.0.1", port: 8080 },
});
await env.withSecurityRulesDisabled(async (c) => {
  for (let i = 1; i <= SQUARES; i++)
    await setDoc(doc(c.firestore(), "squares", "s" + String(i).padStart(2, "0")), { text: "t" + i, order: i - 1 });
});

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const gen = () => Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
const stats = { writes: 0, reads: 0, ok: 0, rejected: 0, unexpected: 0 };
const users = [];
const t0 = Date.now();

// 1) kayit
await Promise.all(Array.from({ length: N }, async (_, i) => {
  const uid = "u" + i, db = env.authenticatedContext(uid, { email: uid + "@x.com", email_verified: true }).firestore();
  const code = gen();
  const b = writeBatch(db);
  b.set(doc(db, "codes", code), { uid, name: uid, photoURL: "" });
  b.set(doc(db, "users", uid), { code, name: uid, email: uid + "@x.com", photoURL: "", createdAt: serverTimestamp() });
  await b.commit(); stats.writes += 2; stats.reads += 1;
  users.push({ uid, db, code });
}));
console.log(`kayit: ${N} kullanici, ${Date.now() - t0}ms`);

// 2) herkes 25 karenin hepsini baska kisilerle doldurmaya calissin + hileli denemeler
const t1 = Date.now();
await Promise.all(users.map(async (u, idx) => {
  const used = new Set();
  for (let s = 1; s <= SQUARES; s++) {
    const sq = "s" + String(s).padStart(2, "0");
    let t;
    do { t = users[Math.floor(Math.random() * N)]; } while (t.uid === u.uid || used.has(t.uid));
    used.add(t.uid);
    await getDoc(doc(u.db, "codes", t.code)); stats.reads += 1;
    const b = writeBatch(u.db);
    b.set(doc(u.db, "users", u.uid, "met", t.uid), { count: 1, lastSquareId: sq });
    b.set(doc(u.db, "users", u.uid, "claims", sq), { code: t.code, targetUid: t.uid, targetName: t.uid, createdAt: serverTimestamp() });
    try { await b.commit(); stats.ok++; stats.writes += 2; stats.reads += 3; } catch { stats.unexpected++; }
  }
  // hile: ayni kisiyi tekrar, kendi kodu, baskasi adina yazma
  const [first] = [...used];
  const tries = [
    ["dup-person", () => { const b = writeBatch(u.db); b.set(doc(u.db, "users", u.uid, "met", first), { count: 1, lastSquareId: "s01" }); return b.commit(); }],
    ["own-code", () => { const b = writeBatch(u.db); b.set(doc(u.db, "users", u.uid, "met", u.uid), { count: 1, lastSquareId: "s01" }); b.set(doc(u.db, "users", u.uid, "claims", "s01"), { code: u.code, targetUid: u.uid, targetName: "x", createdAt: serverTimestamp() }); return b.commit(); }],
    ["other-user", () => setDoc(doc(u.db, "users", users[(idx + 1) % N].uid, "claims", "s01"), { code: u.code, targetUid: u.uid, targetName: "x", createdAt: serverTimestamp() })],
  ];
  for (const [, fn] of tries) { try { await fn(); stats.unexpected++; } catch { stats.rejected++; } }
}));
console.log(`oyun: ${Date.now() - t1}ms`, stats);
console.log(`beklenen: ok=${N * SQUARES} rejected=${N * 3} unexpected=0`);
await env.cleanup();
