import { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  setDoc,
  doc,
  deleteDoc,
  getDocs,
} from "firebase/firestore";
import { db, listenWithLogging } from "./firebase";

/**
 * useTasks(uid) - subscribes to users/{uid}/tasks. Requires a uid (string).
 */
export function useTasks(uid) {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) {
      setTasks([]);
      setError(null);
      return;
    }
    const uidStr = String(uid);
    const col = collection(db, "users", uidStr, "tasks");
    const q = query(col, orderBy("createdAt", "desc"));

    const unsub = listenWithLogging(
      q,
      (snap) => {
        setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setError(null);
      },
      async (err) => {
        console.error("Realtime listen failed — falling back to one-time fetch:", err);
        setError(err);
        try {
          const ds = await getDocs(q);
          setTasks(ds.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (fetchErr) {
          console.error("Fallback fetch also failed:", fetchErr);
          setError(fetchErr);
        }
      }
    );

    return () => unsub();
  }, [uid]);

  return { tasks, error, setTasks };
}

/**
 * Cloud helpers — require uid to prevent accidental undefined path segments.
 */
export async function createTask(uid, task) {
  if (!uid) throw new Error("createTask: uid required");
  try {
    const col = collection(db, "users", String(uid), "tasks");
    const docRef = await addDoc(col, {
      ...task,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (err) {
    console.error("createTask failed:", err);
    throw err;
  }
}

export async function updateTask(uid, id, updates) {
  if (!uid) throw new Error("updateTask: uid required");
  try {
    const d = doc(db, "users", String(uid), "tasks", String(id));
    await setDoc(d, { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.error("updateTask failed:", err);
    throw err;
  }
}

export async function deleteTaskCloud(uid, id) {
  if (!uid) throw new Error("deleteTaskCloud: uid required");
  try {
    const d = doc(db, "users", String(uid), "tasks", String(id));
    await deleteDoc(d);
  } catch (err) {
    console.error("deleteTaskCloud failed:", err);
    throw err;
  }
}