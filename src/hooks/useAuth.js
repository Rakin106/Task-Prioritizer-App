import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../firebase";

export function useAuth() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return unsub;
  }, []);
  return user;
}

export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
export async function register(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}
export async function logout() {
  return signOut(auth);
}