import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { buildRules } from "../scripts/build-rules.mjs";
import { readFileSync } from "fs";
import { doc, writeBatch, serverTimestamp, setDoc } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-bingo",
  firestore: { rules: buildRules("admin@example.com"), host: "127.0.0.1", port: 8080 },
});
await env.withSecurityRulesDisabled(async (c) => {
  for (let i = 1; i <= 8; i++) await setDoc(doc(c.firestore(), "squares", "s0" + i), { text: "x", order: i });
});
const S = (n, extra = {}) => ({ eventName: "Test", accent: "#4285f4", maxPerPerson: n, gameOpen: true, ...extra });
const mk = (uid) => env.authenticatedContext(uid, { email: uid + "@x.com", email_verified: true }).firestore();
const register = (db, uid, code) => {
  const b = writeBatch(db);
  b.set(doc(db, "codes", code), { uid, name: uid, photoURL: "" });
  b.set(doc(db, "users", uid), { code, name: uid, email: uid + "@x.com", photoURL: "", createdAt: serverTimestamp() });
  return b.commit();
};
const claim = (db, uid, sq, code, target, count) => {
  const b = writeBatch(db);
  b.set(doc(db, "users", uid, "met", target), { count, lastSquareId: sq });
  b.set(doc(db, "users", uid, "claims", sq), { code, targetUid: target, targetName: target, createdAt: serverTimestamp() });
  return b.commit();
};
const a = mk("alice"), bob = mk("bob");
await assertSucceeds(register(a, "alice", "ABCDEF"));
await assertSucceeds(register(bob, "bob", "GHJKLM"));

// varsayilan limit 4
for (let i = 1; i <= 4; i++) await assertSucceeds(claim(a, "alice", "s0" + i, "GHJKLM", "bob", i));
await assertFails(claim(a, "alice", "s05", "GHJKLM", "bob", 5)); // 5. kullanim
await assertFails(claim(a, "alice", "s05", "GHJKLM", "bob", 4)); // sayaci geri sarma
await assertFails(claim(a, "alice", "s01", "GHJKLM", "bob", 5)); // dolu kareyi tekrar
await assertFails(claim(a, "alice", "s06", "ABCDEF", "alice", 1)); // kendi kodu
console.log("limit 4 ok");

// admin limiti 2 yapar
const adminDb = env.authenticatedContext("adm", { email: "admin@example.com", email_verified: true }).firestore();
await assertSucceeds(setDoc(doc(adminDb, "config", "settings"), S(2)));
await assertFails(setDoc(doc(a, "config", "settings"), S(9))); // admin degil
await assertSucceeds(register(mk("carl"), "carl", "NPQRST"));
const c = mk("carl");
await assertSucceeds(claim(c, "carl", "s01", "GHJKLM", "bob", 1));
await assertSucceeds(claim(c, "carl", "s02", "GHJKLM", "bob", 2));
await assertFails(claim(c, "carl", "s03", "GHJKLM", "bob", 3));
console.log("limit 2 ok");
await env.cleanup();
