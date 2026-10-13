import {
  doc, getDoc, writeBatch, addDoc, collection, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { CODE_LENGTH, generateCode, normalizeCode } from "./logic";

export class GameError extends Error {
  constructor(key, params = {}) { super(key); this.key = key; this.params = params; }
}

// Giris yapan kullanicinin dokumani yoksa benzersiz kodla olusturur.
export async function ensureUser(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) return snap.data();

  const name = user.displayName || user.email.split("@")[0];
  const photoURL = user.photoURL || "";
  for (let i = 0; i < 8; i++) {
    const code = generateCode();
    const taken = await getDoc(doc(db, "codes", code));
    if (taken.exists()) continue;
    const batch = writeBatch(db);
    batch.set(doc(db, "codes", code), { uid: user.uid, name, photoURL });
    batch.set(userRef, {
      code, name, email: user.email, photoURL, createdAt: serverTimestamp(),
    });
    try {
      await batch.commit();
      return (await getDoc(userRef)).data();
    } catch (e) {
      if (i === 7) throw e;
    }
  }
  throw new Error("Kod olusturulamadi");
}

async function logAttempt(user, profile, code, squareId, reason) {
  try {
    await addDoc(collection(db, "attempts"), {
      uid: user.uid, name: profile.name, code, squareId, reason,
      createdAt: serverTimestamp(),
    });
  } catch { /* log yazilamazsa oyunu engelleme */ }
}

// Bir kareyi baska bir kisinin koduyla doldurur. Hata durumunda Error firlatir.
export async function claimSquare({ user, profile, squareId, rawCode, claims, maxPerPerson = 4, gameOpen = true }) {
  const code = normalizeCode(rawCode);
  const fail = async (reason, key, params) => {
    await logAttempt(user, profile, code, squareId, reason);
    throw new GameError(key, params);
  };

  if (!gameOpen) throw new GameError("errClosed");
  if (code.length !== CODE_LENGTH) throw new GameError("errCodeLen", { n: CODE_LENGTH });
  if (claims[squareId]) throw new GameError("errFilled");
  if (code === profile.code) return fail("own-code", "errOwn");

  const codeSnap = await getDoc(doc(db, "codes", code));
  if (!codeSnap.exists()) return fail("invalid-code", "errInvalid");

  const target = codeSnap.data();
  const used = Object.values(claims).filter((c) => c.targetUid === target.uid).length;
  if (used >= maxPerPerson) {
    return fail("already-used", "errUsed", { name: target.name, max: maxPerPerson });
  }

  const batch = writeBatch(db);
  batch.set(doc(db, "users", user.uid, "met", target.uid), { count: used + 1, lastSquareId: squareId });
  batch.set(doc(db, "users", user.uid, "claims", squareId), {
    code, targetUid: target.uid, targetName: target.name, createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch {
    return fail("rejected", "errRejected");
  }
  return target;
}

export {
  CODE_LENGTH, generateCode, normalizeCode, gridCols, bingoLines, findBingos,
  cardsToBingo, isGameOpen, DEFAULT_SQUARES, onColor, reviewState, completedAt,
} from "./logic";
