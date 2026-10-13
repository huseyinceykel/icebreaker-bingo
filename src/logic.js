// Saf (Firebase'siz) oyun mantigi: Node'da test edilebilsin diye ayri dosya.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 0/O/1/I yok
export const CODE_LENGTH = 6;

export function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function normalizeCode(input) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}


// Kart sayisina gore kolon sayisi: 10 -> 4, 20 -> 5, 25 -> 5, 9 -> 3
export function gridCols(n) {
  return Math.max(2, Math.ceil(Math.sqrt(n)));
}

// Bingo sayilan tum cizgiler (kart indeksleri). Sadece tam satir/sutun ve (kare duzende) caprazlar.
export function bingoLines(n) {
  if (n < 2) return [];
  const cols = gridCols(n);
  const rows = Math.ceil(n / cols);
  const lines = [];
  for (let r = 0; r < rows; r++) {
    const l = [];
    for (let c = 0; c < cols; c++) if (r * cols + c < n) l.push(r * cols + c);
    if (l.length === cols) lines.push(l);
  }
  for (let c = 0; c < cols; c++) {
    const l = [];
    for (let r = 0; r < rows; r++) if (r * cols + c < n) l.push(r * cols + c);
    if (l.length === rows) lines.push(l);
  }
  if (n === cols * cols) {
    lines.push(Array.from({ length: cols }, (_, i) => i * cols + i));
    lines.push(Array.from({ length: cols }, (_, i) => i * cols + (cols - 1 - i)));
  }
  return lines;
}

// squares: siralanmis kartlar, claims: {squareId: claim}
export function findBingos(squares, claims) {
  const filled = squares.map((s) => !!claims[s.id]);
  return bingoLines(squares.length).filter((l) => l.every((i) => filled[i]));
}

// Bingoya en az kac kart kaldi (bingo varsa 0, cizgi yoksa null)
export function cardsToBingo(squares, claims) {
  const filled = squares.map((s) => !!claims[s.id]);
  const lines = bingoLines(squares.length);
  if (!lines.length) return null;
  return Math.min(...lines.map((l) => l.filter((i) => !filled[i]).length));
}

// Oyun su an oynanabilir mi? (elle ac/kapa + opsiyonel baslangic/bitis zamani, ms)
export function isGameOpen(settings, now = Date.now()) {
  if (!settings.gameOpen) return false;
  if (settings.openAt && now < settings.openAt) return false;
  if (settings.closeAt && now >= settings.closeAt) return false;
  return true;
}

export const DEFAULT_SQUARES = [
  ["Bugün yapay zekaya soru sormuş biri", "Someone who asked an AI a question today"],
  ["Gözlük takan biri", "Someone who wears glasses"],
  ["Hiç uygulama geliştirmiş ya da denemiş biri", "Someone who has built or tried building an app"],
  ["Şehir dışından gelen biri", "Someone who came from out of town"],
  ["Bu etkinliğe ilk kez gelen biri", "Someone attending this event for the first time"],
  ["Mekanik klavye kullanan biri", "Someone who uses a mechanical keyboard"],
  ["Telefon kılıfı siyah olan biri", "Someone with a black phone case"],
  ["Çay yerine kahve seven biri", "Someone who prefers coffee over tea"],
  ["Üniversite öğrencisi olan biri", "Someone who is a university student"],
  ["Mühendis ya da yazılımcı olan biri", "Someone who is an engineer or developer"],
  ["İngilizce bilen biri", "Someone who speaks English"],
  ["Bu etkinliğe arkadaşıyla gelen biri", "Someone who came with a friend"],
  ["Bir hackathon'a katılmış biri", "Someone who has joined a hackathon"],
  ["Kendi web sitesi olan biri", "Someone who has their own website"],
  ["Bir teknoloji topluluğuna üye olan biri", "Someone who is in a tech community"],
  ["Üzerinde mavi renk olan biri", "Someone wearing something blue"],
  ["Bilgisayar oyunu oynayan biri", "Someone who plays video games"],
  ["Bir teknoloji etkinliğinde konuşmacı olmuş biri", "Someone who has spoken at a tech event"],
  ["Bir bulut servisi (Firebase, Google Cloud vb.) kullanmış biri", "Someone who has used a cloud service (Firebase, Google Cloud, etc.)"],
  ["Telefonunda 5'ten fazla sosyal medya uygulaması olan biri", "Someone with more than 5 social apps on their phone"],
  ["Günde 6 saatten fazla bilgisayar başında çalışan biri", "Someone who works 6+ hours a day at a computer"],
  ["Düzenli spor yapan biri", "Someone who exercises regularly"],
  ["Linux kullanan biri", "Someone who uses Linux"],
  ["Python seven biri", "Someone who loves Python"],
  ["Bugün ilk kez tanıştığın biri", "Someone you met for the first time today"],
].map(([text, textEn], i) => ({ id: `s${String(i + 1).padStart(2, "0")}`, text, textEn, order: i }));

// Vurgu rengi uzerindeki yazi: beyazla kontrast 4.5'in altindaysa koyu yazi (WCAG AA)
export function onColor(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05) >= 4.5 ? "#ffffff" : "#0b1020";
}

// Yonetici incelemesi: durum ve kazanan olmaya uygunluk.
// suspicious + inceleme yok -> "pending" (listede ⏳ ile gorunur), "cleared" -> onayli, "disqualified" -> kazananlardan cikar.
export function reviewState(suspicious, status) {
  if (status === "disqualified") return "disqualified";
  if (status === "cleared") return "cleared";
  return suspicious ? "pending" : "ok";
}

// Tum kartlar dolduysa son kartin zamani (ms), degilse null. getMs: claim -> ms
export function completedAt(squares, bySquare, getMs) {
  if (!squares.length) return null;
  let max = 0;
  for (const s of squares) {
    const m = bySquare[s.id] && getMs(bySquare[s.id]);
    if (!m) return null;
    max = Math.max(max, m);
  }
  return max;
}
