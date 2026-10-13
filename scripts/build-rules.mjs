// firestore.rules.template -> firestore.rules (admin e-postasi koda gomulmesin diye).
// Kullanim: node scripts/build-rules.mjs            (VITE_ADMIN_EMAIL .env'den okunur)
//           ADMIN_EMAIL=ben@ornek.com node scripts/build-rules.mjs
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EMAIL_RE = /^[^\s'"\\@]+@[^\s'"\\@]+\.[^\s'"\\@]+$/;

export function buildRules(email) {
  if (!EMAIL_RE.test(email || "")) throw new Error(`Gecersiz admin e-postasi: "${email}"`);
  return readFileSync(join(root, "firestore.rules.template"), "utf8").replaceAll("__ADMIN_EMAIL__", email.toLowerCase());
}

function adminEmailFromEnv() {
  if (process.env.ADMIN_EMAIL) return process.env.ADMIN_EMAIL;
  const f = join(root, ".env");
  if (existsSync(f)) {
    const m = readFileSync(f, "utf8").match(/^VITE_ADMIN_EMAIL=(.+)$/m);
    if (m) return m[1].trim();
  }
  return "";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const email = adminEmailFromEnv();
  writeFileSync(join(root, "firestore.rules"), buildRules(email));
  console.log(`firestore.rules olusturuldu (admin: ${email.replace(/^(.).*(@.*)$/, "$1***$2")})`);
}
