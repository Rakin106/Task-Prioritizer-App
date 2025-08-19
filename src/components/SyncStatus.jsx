import React, { useEffect, useState } from "react";
import { collection, query, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export function SyncStatus({ uid }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    function onOnline() { setOnline(true); }
    function onOffline() { setOnline(false); }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!uid) { setSyncing(false); return; }
    const col = collection(db, "users", uid, "tasks");
    const q = query(col);
    const unsub = onSnapshot(q, (snap) => {
      // if any change originated locally and not yet committed to server:
      setSyncing(snap.metadata.hasPendingWrites);
    }, (err) => {
      console.warn("sync status snapshot err:", err);
    });
    return unsub;
  }, [uid]);

  const status = !online ? "Offline" : syncing ? "Syncing" : "Online";
  const color =
    status === "Offline" ? "text-red-600"
    : status === "Syncing" ? "text-orange-600"
    : "text-emerald-600";

  return (
    <div className={`inline-flex items-center gap-2 ${color}`}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: status === "Offline" ? "#ef4444" : status === "Syncing" ? "#f97316" : "#10b981" }} />
      <span className="text-xs">{status}</span>
    </div>
  );
}