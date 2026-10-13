import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator, signInWithCredential, signOut } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
// Admin sekmesini gosterme karari. Gercek yetki Firestore kurallarinda (firestore.rules.template).
export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase();

// Yerel test ortami (vite --mode emulator). Uretim derlemesinde bu blok dahil edilmez.
if (import.meta.env.VITE_USE_EMULATOR === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  // Tarayici testlerinde popup yerine sahte Google hesabiyla giris
  window.__test = {
    signIn: (email, name) => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({
      sub: email, email, email_verified: true, name, display_name: name,
    }))),
    signOut: () => signOut(auth),
  };
}
