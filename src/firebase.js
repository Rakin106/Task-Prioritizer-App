// Improved firebase initialization + verbose Firestore logging and safer fallbacks

import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import {
  initializeFirestore,
  enableIndexedDbPersistence,
  disableNetwork,
  enableNetwork,
  setLogLevel,
  onSnapshot as firestoreOnSnapshot,
} from "firebase/firestore";

// Firebase config (as you provided)
const firebaseConfig = {
  apiKey: "AIzaSyCWeg_kbrvQgqPGyzMS6Tz7QbM4eCgZxLk",
  authDomain: "task-d3ec3.firebaseapp.com",
  projectId: "task-d3ec3",
  storageBucket: "task-d3ec3.appspot.com",
  messagingSenderId: "1052122309711",
  appId: "1:1052122309711:web:cfe4cacd6ed79066a1763a",
};

// Initialize app once
if (!getApps().length) {
  initializeApp(firebaseConfig);
}
const app = getApps()[0];

// Enable verbose Firestore logs (helps diagnose transport / Listen issues)
setLogLevel("debug");

// Initialize Firestore with long-polling fallback (helps behind proxies / blocked websockets)
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: true,
});

// Auth instance
export const auth = getAuth(app);

// Better logging for persistence enabling
enableIndexedDbPersistence(db).then(() => {
  console.debug("IndexedDB persistence enabled");
}).catch((err) => {
  // Provide more information in console
  console.warn("Firestore persistence not enabled:", err?.code ?? err, err);
  // Common codes: 'failed-precondition' (multiple tabs), 'unimplemented' (browser)
});

// Auth helpers
export async function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
export async function register(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}
export async function logout() {
  return fbSignOut(auth);
}
export function onAuthChange(cb) {
  return onAuthStateChanged(auth, cb);
}

// Social providers
const googleProvider = new GoogleAuthProvider();
export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}
const githubProvider = new GithubAuthProvider();
export async function signInWithGithub() {
  return signInWithPopup(auth, githubProvider);
}

// Network helpers (for testing)
export async function goOffline() {
  await disableNetwork(db);
  console.debug("Firestore forced offline");
}
export async function goOnline() {
  await enableNetwork(db);
  console.debug("Firestore forced online");
}

// A small helper that wraps onSnapshot and logs metadata + errors — use when subscribing
// Example usage in your hooks: const unsub = listenWithLogging(queryRef, snapshotHandler, errHandler)
export function listenWithLogging(ref, onNext, onError) {
  return firestoreOnSnapshot(
    ref,
    (snap) => {
      if (snap && typeof snap.metadata !== "undefined") {
        console.debug("Snapshot metadata:", {
          hasPendingWrites: snap.metadata.hasPendingWrites,
          fromCache: snap.metadata.fromCache,
        });
      }
      onNext(snap);
    },
    (err) => {
      console.error("Firestore onSnapshot error:", err);
      if (onError) onError(err);
    }
  );
}

// Global handler to surface unhandled promise rejections (helps catch transport errors)
window.addEventListener("unhandledrejection", (ev) => {
  console.error("Unhandled promise rejection:", ev.reason);
});

export default app;