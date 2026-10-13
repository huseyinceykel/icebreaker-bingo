import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { buildRules } from "../scripts/build-rules.mjs";
import { readFileSync } from "fs";
import {
  doc, getDoc, getDocs, collection, collectionGroup, writeBatch, serverTimestamp, setDoc, updateDoc, deleteDoc, addDoc,
} from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-bingo-sec",
  firestore: { rules: buildRules("admin@example.com"), host: "127.0.0.1", port: 8080 },
});
await env.withSecurityRulesDisabled(async (c) => {
  for (let i = 1; i <= 8; i++) await setDoc(doc(c.firestore(), "squares", "s0" + i), { text: "x", order: i });
});

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log("  OK   " + name); }
  catch (e) { fail++; console.log("  FAIL " + name + " -> " + String(e.message).split("\n")[0]); }
};
const ok = (p) => assertSucceeds(p), no = (p) => assertFails(p);

const S = (n, extra = {}) => ({ eventName: "Test", accent: "#4285f4", maxPerPerson: n, gameOpen: true, eventInfo: "", footer: "", openAt: 0, closeAt: 0, ...extra });
const as = (uid, email = uid + "@x.com", verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const anon = env.unauthenticatedContext().firestore();
const ADMIN = "admin@example.com";
const admin = as("adm", ADMIN);

const reg = (db, uid, code, extra = {}) => {
  const b = writeBatch(db);
  b.set(doc(db, "codes", code), { uid, name: uid, photoURL: "" });
  b.set(doc(db, "users", uid), { code, name: uid, email: uid + "@x.com", photoURL: "", createdAt: serverTimestamp(), ...extra });
  return b.commit();
};
const claim = (db, uid, sq, code, target, count, first = count === 1) => {
  const b = writeBatch(db);
  b.set(doc(db, "users", uid, "met", target), { count, lastSquareId: sq });
  b.set(doc(db, "users", uid, "claims", sq), { code, targetUid: target, targetName: target, createdAt: serverTimestamp() });
  return b.commit();
};

const A = as("alice"), B = as("bob"), C = as("carl"), M = as("mallory");
await ok(reg(A, "alice", "AAAAAA"));
await ok(reg(B, "bob", "BBBBBB"));
await ok(reg(C, "carl", "CCCCCC"));
await ok(reg(M, "mallory", "MMMMMM"));

console.log("\n[1] Giris yapmamis kullanici");
for (const p of ["users/alice", "codes/AAAAAA", "squares/s01", "attempts/x"])
  await t("okuyamaz " + p, () => no(getDoc(doc(anon, p))));
await t("ayarlar herkese acik okunur (giris ekrani icin)", () => ok(getDoc(doc(anon, "config", "settings"))));
await t("yazamaz squares", () => no(setDoc(doc(anon, "squares", "z"), { text: "x", order: 1 })));
await t("kayit olamaz", () => no(reg(anon, "ghost", "GGGGGG")));

console.log("\n[2] Veri gizliligi");
await t("baskasinin profilini okuyamaz", () => no(getDoc(doc(M, "users", "alice"))));
await t("users listeleyemez", () => no(getDocs(collection(M, "users"))));
await t("codes listeleyemez (kod listesi calinamaz)", () => no(getDocs(collection(M, "codes"))));
await t("tek kod sorgulayabilir (oyun icin gerekli)", () => ok(getDoc(doc(M, "codes", "AAAAAA"))));
await t("baskasinin claimlerini okuyamaz", () => no(getDocs(collection(M, "users", "alice", "claims"))));
await t("claims collectionGroup sorgulayamaz", () => no(getDocs(collectionGroup(M, "claims"))));
await t("attempts okuyamaz", () => no(getDocs(collection(M, "attempts"))));
await t("admin users listeleyebilir", () => ok(getDocs(collection(admin, "users"))));
await t("admin codes listeleyebilir", () => ok(getDocs(collection(admin, "codes"))));
await t("admin claims collectionGroup", () => ok(getDocs(collectionGroup(admin, "claims"))));

console.log("\n[3] Kayit / kod manipulasyonu");
await t("baska uid adina kayit olamaz", () => no(reg(M, "alice2", "ZZZZZZ")));
await t("mevcut kodu ele gecirip kendi hesabina yazamaz", () => {
  const b = writeBatch(M);
  b.set(doc(M, "codes", "AAAAAA"), { uid: "mallory", name: "m", photoURL: "" });
  return no(b.commit());
});
await t("gecersiz format kod (kucuk harf / kisa / 0,1,O,I)", async () => {
  const N = as("nina");
  await no(reg(N, "nina", "abcdef"));
  await no(reg(N, "nina", "ABC12"));
  await no(reg(N, "nina", "ABCDE0"));
});
await t("profil baska kisinin koduna isaret edemez", () => {
  const N = as("nina2");
  const b = writeBatch(N);
  b.set(doc(N, "users", "nina2"), { code: "AAAAAA", name: "n", email: "n@x.com", photoURL: "", createdAt: serverTimestamp() });
  return no(b.commit());
});
await t("kayitta fazladan alan olamaz (isAdmin vb.)", () => no(reg(as("nina3"), "nina3", "NNNNNN", { isAdmin: true })));
await t("createdAt sahte olamaz", () => no(reg(as("nina4"), "nina4", "PPPPPP", { createdAt: new Date("2000-01-01") })));
await t("profilini guncelleyemez (kodunu degistiremez)", () => no(updateDoc(doc(M, "users", "mallory"), { code: "QQQQQQ" })));
await t("profilini silemez (yeni kod alamaz)", () => no(deleteDoc(doc(M, "users", "mallory"))));
await t("kodunu silemez", () => no(deleteDoc(doc(M, "codes", "MMMMMM"))));

console.log("\n[2b] Kart doldurma kurallari");
await t("kendi kodunu giremez", () => no(claim(M, "mallory", "s01", "MMMMMM", "mallory", 1)));
await t("olmayan kod", () => no(claim(M, "mallory", "s01", "XXXXXX", "bob", 1)));
await t("kod baska kisiye ait (targetUid sahte)", () => no(claim(M, "mallory", "s01", "BBBBBB", "carl", 1)));
await t("olmayan kare", () => no(claim(M, "mallory", "s99", "BBBBBB", "bob", 1)));
await t("baska kullanici adina kart doldurma", () => no(claim(M, "alice", "s01", "BBBBBB", "bob", 1)));
await t("met olmadan claim", () => no(setDoc(doc(M, "users", "mallory", "claims", "s01"), { code: "BBBBBB", targetUid: "bob", targetName: "bob", createdAt: serverTimestamp() })));
await t("claim olmadan met", () => no(setDoc(doc(M, "users", "mallory", "met", "bob"), { count: 1, lastSquareId: "s01" })));
await t("sahte createdAt", () => {
  const b = writeBatch(M);
  b.set(doc(M, "users", "mallory", "met", "bob"), { count: 1, lastSquareId: "s01" });
  b.set(doc(M, "users", "mallory", "claims", "s01"), { code: "BBBBBB", targetUid: "bob", targetName: "bob", createdAt: new Date(0) });
  return no(b.commit());
});
await t("ilk kullanimda count=3 ile baslatamaz", () => no(claim(M, "mallory", "s01", "BBBBBB", "bob", 3)));
await t("fazladan alan eklenemez", () => {
  const b = writeBatch(M);
  b.set(doc(M, "users", "mallory", "met", "bob"), { count: 1, lastSquareId: "s01", extra: 1 });
  b.set(doc(M, "users", "mallory", "claims", "s01"), { code: "BBBBBB", targetUid: "bob", targetName: "bob", createdAt: serverTimestamp() });
  return no(b.commit());
});

console.log("\n[4] AYNI KISI, FARKLI KARELER (limit 4)");
await t("1. kullanim", () => ok(claim(M, "mallory", "s01", "BBBBBB", "bob", 1)));
await t("2. farkli kare", () => ok(claim(M, "mallory", "s02", "BBBBBB", "bob", 2)));
await t("3. farkli kare", () => ok(claim(M, "mallory", "s03", "BBBBBB", "bob", 3)));
await t("4. farkli kare", () => ok(claim(M, "mallory", "s04", "BBBBBB", "bob", 4)));
await t("5. kullanim REDDEDILIR", () => no(claim(M, "mallory", "s05", "BBBBBB", "bob", 5)));
await t("sayaci geri sarip 5. yapamaz (count=4 tekrar)", () => no(claim(M, "mallory", "s05", "BBBBBB", "bob", 4)));
await t("sayaci 1'e cekip yapamaz", () => no(claim(M, "mallory", "s05", "BBBBBB", "bob", 1)));
await t("met silip sayaci sifirlayamaz", () => no(deleteDoc(doc(M, "users", "mallory", "met", "bob"))));
await t("claim silip yeniden dolduramaz", () => no(deleteDoc(doc(M, "users", "mallory", "claims", "s01"))));
await t("dolu kareyi baska kisiyle ezemez", () => no(claim(M, "mallory", "s01", "CCCCCC", "carl", 1)));
await t("claim guncelleyemez", () => no(updateDoc(doc(M, "users", "mallory", "claims", "s01"), { targetName: "hack" })));
await t("baska kisi (carl) ile yeni kare normal calisir", () => ok(claim(M, "mallory", "s05", "CCCCCC", "carl", 1)));

console.log("\n[5] Es zamanli (yaris) saldirisi");
await t("ayni anda 6 istek: sadece limit kadar gecer", async () => {
  const D = as("dave"); await reg(D, "dave", "DDDDDD");
  const results = await Promise.allSettled(
    ["s01", "s02", "s03", "s04", "s05", "s06"].map((sq) => claim(D, "dave", sq, "AAAAAA", "alice", 1))
  );
  const okCount = results.filter((r) => r.status === "fulfilled").length;
  if (okCount > 1) throw new Error(`ayni anda ${okCount} kare dolduruldu (count=1 ile en fazla 1 olmali)`);
});

console.log("\n[6] Admin yetkisi");
await t("baska e-posta admin sayilmaz", () => no(setDoc(doc(as("x", "baska@example.com"), "squares", "n1"), { text: "h", order: 9 })));
await t("e-posta dogrulanmamis admin sayilmaz", () => no(setDoc(doc(as("y", ADMIN, false), "squares", "n1"), { text: "h", order: 9 })));
await t("oyuncu kart ekleyemez", () => no(setDoc(doc(M, "squares", "n1"), { text: "h", order: 9 })));
await t("oyuncu kart silemez", () => no(deleteDoc(doc(M, "squares", "s01"))));
await t("oyuncu ayar degistiremez", () => no(setDoc(doc(M, "config", "settings"), S(25))));
await t("admin ayar degistirir (limit 2)", () => ok(setDoc(doc(admin, "config", "settings"), S(2))));
await t("admin gecersiz ayar giremez (0, 99, metin)", async () => {
  await no(setDoc(doc(admin, "config", "settings"), S(0)));
  await no(setDoc(doc(admin, "config", "settings"), S(99)));
  await no(setDoc(doc(admin, "config", "settings"), S("4")));
});
await t("admin gecersiz renk / uzun ad / eksik alan giremez", async () => {
  await no(setDoc(doc(admin, "config", "settings"), S(2, { accent: "red" })));
  await no(setDoc(doc(admin, "config", "settings"), S(2, { eventName: "x".repeat(61) })));
  await no(setDoc(doc(admin, "config", "settings"), S(2, { gameOpen: "evet" })));
  await no(setDoc(doc(admin, "config", "settings"), S(2, { evil: 1 })));
  await no(setDoc(doc(admin, "config", "settings"), { maxPerPerson: 2 }));
});
await t("admin kart ekler", () => ok(setDoc(doc(admin, "squares", "n1"), { text: "yeni", order: 9 })));
await t("limit 2 iken yeni kisi 3. kullanimi yapamaz", async () => {
  const E = as("erin"); await reg(E, "erin", "EEEEEE");
  await ok(claim(E, "erin", "s01", "AAAAAA", "alice", 1));
  await ok(claim(E, "erin", "s02", "AAAAAA", "alice", 2));
  await no(claim(E, "erin", "s03", "AAAAAA", "alice", 3));
});
await t("admin sifirlama icin claim/met/user/code silebilir", async () => {
  await ok(deleteDoc(doc(admin, "users", "erin", "met", "alice")));
  await ok(deleteDoc(doc(admin, "users", "erin", "claims", "s01")));
  await ok(deleteDoc(doc(admin, "users", "erin")));
  await ok(deleteDoc(doc(admin, "codes", "EEEEEE")));
});

console.log("\n[6b] Oyun kapali");
await t("oyun kapaliyken kart doldurulamaz", async () => {
  await ok(setDoc(doc(admin, "config", "settings"), S(4, { gameOpen: false })));
  const F = as("fred"); await reg(F, "fred", "FFFFFF");
  await no(claim(F, "fred", "s01", "AAAAAA", "alice", 1));
});
await t("oyun tekrar acilinca dolar", async () => {
  await ok(setDoc(doc(admin, "config", "settings"), S(4, { gameOpen: true })));
  await ok(claim(as("fred"), "fred", "s01", "AAAAAA", "alice", 1));
});
await t("oyun kapaliyken kayit olunabilir (sadece kart kapali)", async () => {
  await ok(setDoc(doc(admin, "config", "settings"), S(4, { gameOpen: false })));
  await ok(reg(as("gina"), "gina", "GGGGGG"));
  await ok(setDoc(doc(admin, "config", "settings"), S(4, { gameOpen: true })));
});

console.log("\n[6c] Zamanli acilis / kapanis");
await t("baslangic zamani gelecekte ise kart doldurulamaz", async () => {
  await ok(setDoc(doc(admin, "config", "settings"), S(4, { openAt: Date.now() + 3600_000 })));
  const H = as("hank"); await reg(H, "hank", "HHHHHH");
  await no(claim(H, "hank", "s01", "AAAAAA", "alice", 1));
});
await t("bitis zamani gecmisse kart doldurulamaz", async () => {
  await ok(setDoc(doc(admin, "config", "settings"), S(4, { closeAt: Date.now() - 1000 })));
  await no(claim(as("hank"), "hank", "s01", "AAAAAA", "alice", 1));
});
await t("zaman penceresi icindeyse dolar", async () => {
  await ok(setDoc(doc(admin, "config", "settings"), S(4, { openAt: Date.now() - 3600_000, closeAt: Date.now() + 3600_000 })));
  await ok(claim(as("hank"), "hank", "s01", "AAAAAA", "alice", 1));
});
await t("gecersiz yeni ayarlar reddedilir (negatif zaman, uzun alt yazi)", async () => {
  await no(setDoc(doc(admin, "config", "settings"), S(4, { openAt: -5 })));
  await no(setDoc(doc(admin, "config", "settings"), S(4, { closeAt: "yarin" })));
  await no(setDoc(doc(admin, "config", "settings"), S(4, { footer: "x".repeat(121) })));
  await no(setDoc(doc(admin, "config", "settings"), S(4, { eventInfo: "x".repeat(101) })));
});
await t("oyuncu zamani degistiremez", () => no(setDoc(doc(as("hank"), "config", "settings"), S(4, { closeAt: 0 }))));
await ok(setDoc(doc(admin, "config", "settings"), S(4)));

console.log("\n[6e] Kazanma kurali ayari (winMode)");
await t("admin winMode full / line yazabilir", async () => {
  await ok(setDoc(doc(admin, "config", "settings"), S(4, { winMode: "line" })));
  await ok(setDoc(doc(admin, "config", "settings"), S(4, { winMode: "full" })));
});
await t("gecersiz winMode reddedilir", async () => {
  await no(setDoc(doc(admin, "config", "settings"), S(4, { winMode: "hepsi" })));
  await no(setDoc(doc(admin, "config", "settings"), S(4, { winMode: 1 })));
});
await t("oyuncu winMode degistiremez", () => no(setDoc(doc(M, "config", "settings"), S(4, { winMode: "line" }))));
await ok(setDoc(doc(admin, "config", "settings"), S(4)));

console.log("\n[6f] Kazananlar listesi uzunlugu (winnersCount)");
await t("admin 1..100 arasi yazabilir", async () => {
  await ok(setDoc(doc(admin, "config", "settings"), S(4, { winnersCount: 1 })));
  await ok(setDoc(doc(admin, "config", "settings"), S(4, { winnersCount: 100 })));
});
await t("gecersiz winnersCount (0, 101, metin, ondalik) reddedilir", async () => {
  await no(setDoc(doc(admin, "config", "settings"), S(4, { winnersCount: 0 })));
  await no(setDoc(doc(admin, "config", "settings"), S(4, { winnersCount: 101 })));
  await no(setDoc(doc(admin, "config", "settings"), S(4, { winnersCount: "10" })));
  await no(setDoc(doc(admin, "config", "settings"), S(4, { winnersCount: 2.5 })));
});
await t("oyuncu winnersCount degistiremez", () => no(setDoc(doc(M, "config", "settings"), S(4, { winnersCount: 3 }))));
await ok(setDoc(doc(admin, "config", "settings"), S(4)));

console.log("\n[6d] Yonetici incelemesi (reviews)");
await t("oyuncu inceleme yazamaz", () => no(setDoc(doc(M, "reviews", "mallory"), { status: "cleared", updatedAt: serverTimestamp() })));
await t("oyuncu inceleme okuyamaz", () => no(getDoc(doc(M, "reviews", "mallory"))));
await t("girissiz inceleme okuyamaz", () => no(getDoc(doc(anon, "reviews", "mallory"))));
await t("admin onay yazabilir", () => ok(setDoc(doc(admin, "reviews", "mallory"), { status: "cleared", updatedAt: serverTimestamp() })));
await t("admin diskalifiye yazabilir", () => ok(setDoc(doc(admin, "reviews", "mallory"), { status: "disqualified", updatedAt: serverTimestamp() })));
await t("admin okur", () => ok(getDoc(doc(admin, "reviews", "mallory"))));
await t("gecersiz durum / fazladan alan / sahte tarih reddedilir", async () => {
  await no(setDoc(doc(admin, "reviews", "x1"), { status: "winner", updatedAt: serverTimestamp() }));
  await no(setDoc(doc(admin, "reviews", "x1"), { status: "cleared", updatedAt: serverTimestamp(), note: "x" }));
  await no(setDoc(doc(admin, "reviews", "x1"), { status: "cleared", updatedAt: new Date(0) }));
});
await t("admin incelemeyi geri alabilir (siler)", () => ok(deleteDoc(doc(admin, "reviews", "mallory"))));
await t("oyuncu kendini onaylatamaz / silemez", async () => {
  await no(setDoc(doc(M, "reviews", "mallory"), { status: "cleared", updatedAt: serverTimestamp() }));
  await no(deleteDoc(doc(M, "reviews", "mallory")));
});

console.log("\n[7] Deneme loglari");
await t("kendi adina log yazabilir", () => ok(addDoc(collection(M, "attempts"), { uid: "mallory", name: "m", code: "XXXXXX", squareId: "s01", reason: "invalid-code", createdAt: serverTimestamp() })));
await t("baskasi adina log yazamaz", () => no(addDoc(collection(M, "attempts"), { uid: "alice", name: "a", code: "XXXXXX", squareId: "s01", reason: "x", createdAt: serverTimestamp() })));
await t("logu silemez / guncelleyemez", async () => {
  const r = await addDoc(collection(M, "attempts"), { uid: "mallory", name: "m", code: "X", squareId: "s01", reason: "x", createdAt: serverTimestamp() });
  await no(deleteDoc(r));
  await no(updateDoc(r, { reason: "temiz" }));
});
await t("admin loglari okur", () => ok(getDocs(collection(admin, "attempts"))));

console.log(`\nSONUC: ${pass} gecti, ${fail} basarisiz`);
await env.cleanup();
process.exit(fail ? 1 : 0);
