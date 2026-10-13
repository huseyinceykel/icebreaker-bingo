// Saf mantik + ceviri testleri (Firebase gerektirmez): node test/unit.mjs
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  gridCols, bingoLines, findBingos, cardsToBingo, isGameOpen,
  normalizeCode, generateCode, CODE_LENGTH, DEFAULT_SQUARES, onColor, reviewState, completedAt,
} from "../src/logic.js";
import { dict } from "../src/i18n-dict.js";

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log("  OK   " + name); }
  catch (e) { fail++; console.log("  FAIL " + name + " -> " + e.message); }
};
const eq = (a, b, msg = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} beklenen ${JSON.stringify(b)}, gelen ${JSON.stringify(a)}`); };
const truthy = (v, msg) => { if (!v) throw new Error(msg); };
const sq = (n) => Array.from({ length: n }, (_, i) => ({ id: "s" + i }));
const cl = (...ids) => Object.fromEntries(ids.map((i) => ["s" + i, { x: 1 }]));

console.log("\n[gridCols]");
t("kolon sayilari", () => {
  eq([0, 1, 2, 3, 4, 9, 10, 12, 16, 17, 20, 25, 26, 36, 100].map(gridCols), [2, 2, 2, 2, 2, 3, 4, 4, 4, 5, 5, 5, 6, 6, 10]);
});

console.log("\n[bingoLines]");
t("0 ve 1 kartta cizgi yok", () => { eq(bingoLines(0), []); eq(bingoLines(1), []); });
t("5x5: 5 satir + 5 sutun + 2 capraz = 12", () => eq(bingoLines(25).length, 12));
t("3x3: 8 cizgi", () => eq(bingoLines(9).length, 8));
t("4x4: 10 cizgi", () => eq(bingoLines(16).length, 10));
t("10 kart (4 kolon): 2 tam satir + 2 tam sutun, capraz yok", () => {
  const l = bingoLines(10); eq(l.length, 4);
  eq(l.filter((x) => x.length === 4).length, 2); eq(l.filter((x) => x.length === 3).length, 2);
});
t("20 kart (5x4): 4 satir + 5 sutun, capraz yok", () => eq(bingoLines(20).length, 9));
t("tum cizgi indeksleri gecerli ve tekrarsiz (1..100)", () => {
  for (let n = 0; n <= 100; n++) for (const l of bingoLines(n)) {
    truthy(l.every((i) => i >= 0 && i < n), `n=${n} aralik disi`);
    truthy(new Set(l).size === l.length, `n=${n} tekrar`);
  }
});

console.log("\n[findBingos]");
t("bos tahta bingo yok", () => eq(findBingos(sq(25), {}).length, 0));
t("ilk satir", () => eq(findBingos(sq(25), cl(0, 1, 2, 3, 4)).length, 1));
t("ilk sutun", () => eq(findBingos(sq(25), cl(0, 5, 10, 15, 20)).length, 1));
t("capraz 1 ve 2", () => { eq(findBingos(sq(25), cl(0, 6, 12, 18, 24)).length, 1); eq(findBingos(sq(25), cl(4, 8, 12, 16, 20)).length, 1); });
t("4/5 dolu satir bingo degil", () => eq(findBingos(sq(25), cl(0, 1, 2, 3)).length, 0));
t("tum tahta dolu = 12 bingo", () => eq(findBingos(sq(25), cl(...Array(25).keys())).length, 12));
t("10 kartta eksik son satir bingo sayilmaz", () => eq(findBingos(sq(10), cl(8, 9)).length, 0));
t("10 kartta tam sutun (0,4,8)", () => eq(findBingos(sq(10), cl(0, 4, 8)).length, 1));
t("claim olmayan kartlar sayilmaz", () => eq(findBingos(sq(9), { s0: null, s1: null, s2: null }).length, 0));

console.log("\n[cardsToBingo]");
t("bos tahta: 5 kart kaldi", () => eq(cardsToBingo(sq(25), {}), 5));
t("4 dolu satir: 1 kaldi", () => eq(cardsToBingo(sq(25), cl(0, 1, 2, 3)), 1));
t("bingo varsa 0", () => eq(cardsToBingo(sq(25), cl(0, 1, 2, 3, 4)), 0));
t("kart yoksa null", () => { eq(cardsToBingo([], {}), null); eq(cardsToBingo(sq(1), {}), null); });
t("9 kart bos: 3", () => eq(cardsToBingo(sq(9), {}), 3));

console.log("\n[isGameOpen]");
const NOW = 1_000_000;
t("acik, zaman yok", () => eq(isGameOpen({ gameOpen: true, openAt: 0, closeAt: 0 }, NOW), true));
t("elle kapali", () => eq(isGameOpen({ gameOpen: false, openAt: 0, closeAt: 0 }, NOW), false));
t("baslangic gelecekte", () => eq(isGameOpen({ gameOpen: true, openAt: NOW + 1, closeAt: 0 }, NOW), false));
t("baslangic tam simdi", () => eq(isGameOpen({ gameOpen: true, openAt: NOW, closeAt: 0 }, NOW), true));
t("bitis tam simdi (kapali)", () => eq(isGameOpen({ gameOpen: true, openAt: 0, closeAt: NOW }, NOW), false));
t("bitis gelecekte", () => eq(isGameOpen({ gameOpen: true, openAt: 0, closeAt: NOW + 1 }, NOW), true));
t("pencere icinde", () => eq(isGameOpen({ gameOpen: true, openAt: NOW - 5, closeAt: NOW + 5 }, NOW), true));
t("elle kapali pencere icinde de kapali", () => eq(isGameOpen({ gameOpen: false, openAt: NOW - 5, closeAt: NOW + 5 }, NOW), false));

console.log("\n[normalizeCode]");
t("kucuk harf, bosluk, tire", () => {
  eq(normalizeCode("abc 123"), "ABC123"); eq(normalizeCode(" ab-cd_ef "), "ABCDEF");
  eq(normalizeCode("ABCDEF"), "ABCDEF"); eq(normalizeCode(""), "");
});
t("emoji / Turkce karakter / satir sonu temizlenir", () => { eq(normalizeCode("ab😀cd\n"), "ABCD"); eq(normalizeCode("ığüşöç"), "I"); });
t("script/HTML enjeksiyonu zararsiz", () => eq(normalizeCode("<script>alert(1)</script>"), "SCRIPTALERT1SCRIPT"));

console.log("\n[generateCode]");
t("10.000 kod: uzunluk, alfabe, belirsiz karakter yok", () => {
  for (let i = 0; i < 10000; i++) {
    const c = generateCode();
    truthy(c.length === CODE_LENGTH, "uzunluk " + c);
    truthy(/^[A-HJ-NP-Z2-9]{6}$/.test(c), "alfabe " + c);
    truthy(!/[01OI]/.test(c), "belirsiz karakter " + c);
  }
});
t("10.000 kodda cakisma < %1 (dogum gunu paradoksu)", () => {
  const s = new Set(); for (let i = 0; i < 10000; i++) s.add(generateCode());
  truthy(10000 - s.size < 100, "cakisma " + (10000 - s.size));
});
t("karakter dagilimi yaklasik duzgun (+-%25)", () => {
  const cnt = {}; for (let i = 0; i < 20000; i++) for (const ch of generateCode()) cnt[ch] = (cnt[ch] || 0) + 1;
  const exp = (20000 * 6) / 32;
  for (const [k, v] of Object.entries(cnt)) truthy(Math.abs(v - exp) / exp < 0.25, `${k}: ${v} (beklenen ~${exp})`);
  eq(Object.keys(cnt).length, 32);
});
t("kod tutarlilik: normalizeCode(generateCode()) ayni", () => { for (let i = 0; i < 1000; i++) { const c = generateCode(); eq(normalizeCode(c), c); } });
t("kod regex'i Firestore kurali ile ayni (^[A-Z2-9]{6}$)", () => {
  const rules = readFileSync("firestore.rules.template", "utf8");
  truthy(rules.includes("^[A-Z2-9]{6}$"), "kural regex'i degismis");
  for (let i = 0; i < 2000; i++) truthy(/^[A-Z2-9]{6}$/.test(generateCode()), "uretilen kod kurala uymuyor");
});

console.log("\n[DEFAULT_SQUARES]");
t("25 kart, benzersiz id, bos metin yok", () => {
  eq(DEFAULT_SQUARES.length, 25);
  eq(new Set(DEFAULT_SQUARES.map((s) => s.id)).size, 25);
  truthy(DEFAULT_SQUARES.every((s) => s.text.trim() && s.textEn.trim()), "bos metin");
  eq(new Set(DEFAULT_SQUARES.map((s) => s.text)).size, 25, "tekrar eden metin");
});
t("siralar 0..24", () => eq(DEFAULT_SQUARES.map((s) => s.order), [...Array(25).keys()]));

console.log("\n[onColor / kontrast]");
t("koyu vurgu rengi uzerine beyaz yazi", () => { eq(onColor("#1a73e8"), "#ffffff"); eq(onColor("#000000"), "#ffffff"); eq(onColor("#5b4bd5"), "#ffffff"); });
t("acik vurgu rengi (sari, beyaz) uzerine koyu yazi", () => { eq(onColor("#fbbc04"), "#0b1020"); eq(onColor("#ffffff"), "#0b1020"); eq(onColor("#ffeb3b"), "#0b1020"); });
t("eski varsayilan #4285f4 beyazla yetersiz (3.56) -> koyu yazi secilir", () => eq(onColor("#4285f4"), "#0b1020"));

console.log("\n[completedAt - tum kartlari doldurma]");
const ts = (map) => (id) => map[id];
t("hepsi dolu -> en son kartin zamani", () => eq(completedAt(sq(3), { s0: 100, s1: 300, s2: 200 }, (x) => x), 300));
t("bir kart eksik -> null", () => eq(completedAt(sq(3), { s0: 100, s1: 300 }, (x) => x), null));
t("bekleyen (zamani henuz null) kart -> null", () => eq(completedAt(sq(2), { s0: 100, s1: null }, (x) => x), null));
t("kart yoksa null", () => eq(completedAt([], {}, (x) => x), null));
t("9 kartlik tahtada 9 dolu bingo ama TAMAMLAMA degil", () => {
  const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => ["s" + i, 100 + i]));
  eq(completedAt(sq(25), nine, (x) => x), null);
  eq(findBingos(sq(25), cl(0, 1, 2, 3, 4)).length, 1);
});
t("tum 25 kart -> tamamlandi ve 12 bingo", () => {
  const all = Object.fromEntries(Array.from({ length: 25 }, (_, i) => ["s" + i, 1000 + i]));
  eq(completedAt(sq(25), all, (x) => x), 1024);
});

console.log("\n[inceleme akisi]");
t("supheli degil -> ok", () => eq(reviewState(false, undefined), "ok"));
t("supheli + inceleme yok -> pending (listede kalir, diskalifiye degil)", () => eq(reviewState(true, undefined), "pending"));
t("supheli + onayli -> cleared", () => eq(reviewState(true, "cleared"), "cleared"));
t("diskalifiye her durumda diskalifiye (supheli olsun olmasin)", () => { eq(reviewState(false, "disqualified"), "disqualified"); eq(reviewState(true, "disqualified"), "disqualified"); });
t("supheli olmayan biri onaylanirsa cleared", () => eq(reviewState(false, "cleared"), "cleared"));

console.log("\n[i18n]");
const keys = (o) => Object.keys(o).sort();
t("tr ve en ayni anahtarlara sahip", () => {
  const a = keys(dict.tr), b = keys(dict.en);
  eq(a.filter((k) => !b.includes(k)), [], "en'de eksik");
  eq(b.filter((k) => !a.includes(k)), [], "tr'de eksik");
});
t("bos ceviri yok", () => { for (const l of ["tr", "en"]) for (const [k, v] of Object.entries(dict[l])) truthy(String(v).trim(), `${l}.${k} bos`); });
t("yer tutucular ({x}) iki dilde ayni", () => {
  const ph = (s) => (s.match(/\{(\w+)\}/g) || []).sort();
  for (const k of keys(dict.tr)) eq(ph(dict.en[k]), ph(dict.tr[k]), k);
});
t("kodda kullanilan t('anahtar') / hata anahtarlari sozlukte var", () => {
  const files = [];
  const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(f) && files.push(p); });
  walk("src");
  const used = new Set();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bt\(\s*"(\w+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/t\(\s*(?:[^"()]+\?\s*)?"(\w+)"\s*:\s*"(\w+)"/g)) { used.add(m[1]); used.add(m[2]); }
    for (const m of src.matchAll(/(?:fail\([^,]+,\s*|new GameError\()"(err\w+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/\["(\w+)",\s*"(admin\w+)"\]/g)) used.add(m[2]);
    for (const m of src.matchAll(/t\(full \? "(\w+)" : "(\w+)"|t\(full \? "(\w+)"\s*:\s*"(\w+)"/g)) m.slice(1).filter(Boolean).forEach((k) => used.add(k));
    for (const m of src.matchAll(/t\(\s*(\w+)\s*\)/g)) void m; // dinamik: asagida elle kontrol
  }
  const missing = [...used].filter((k) => !(k in dict.tr));
  eq(missing, [], "sozlukte olmayan anahtar");
  truthy(used.size > 60, "tarama cok az anahtar buldu: " + used.size);
});
t("sozlukte kullanilmayan anahtar yok (olu metin)", () => {
  const all = readdirSync("src", { recursive: true }).filter((f) => /\.(jsx?|mjs)$/.test(f) && !f.includes("i18n-dict")).map((f) => readFileSync(join("src", f), "utf8")).join("\n");
  const unused = keys(dict.tr).filter((k) => !new RegExp(`["'\`]${k}["'\`]`).test(all));
  eq(unused, [], "kullanilmayan");
});

console.log(`\nSONUC: ${pass} gecti, ${fail} basarisiz`);
process.exit(fail ? 1 : 0);
