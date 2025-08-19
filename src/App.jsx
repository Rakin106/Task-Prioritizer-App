import React, { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Trash2, Pencil, CheckCircle2, Download, Upload,
  Filter, Save, X, Calendar, ChevronDown, ArrowUpDown
} from "lucide-react";
import './App.css';
import { useAuth, login, register, logout } from "./hooks/useAuth";
import { useTasks, createTask, updateTask, deleteTaskCloud } from "./hooks/useTasks";
import { SyncStatus } from "./components/SyncStatus";
import { signIn as firebaseSignIn, register as firebaseRegister, logout as firebaseLogout, signInWithGoogle, signInWithGithub } from "./firebase";

// Priority & status orders (for sorting)
const PRIORITY_ORDER = { Low: 0, Normal: 1, High: 2, Urgent: 3 };
const STATUS_ORDER = { "Todo": 0, "In Progress": 1, "Done": 2 };

function uid() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
}

const STORAGE_KEY = "task_prioritizer_v1";
const THEME_KEY = "task_prioritizer_theme_v1";

// default theme (used for reset and initial state)
const DEFAULT_THEME = {
  accent: "#0f172a", // default slate-900
  font: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
  bgFrom: "#f8fafc",
  bgTo: "#ffffff",
};

export default function TaskPrioritizerApp() {
  const user = useAuth();
  const { tasks, setTasks } = useTasks(user?.uid);
  const [q, setQ] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("priority");   // "Priority" | "Due" | "Created" | "Status"
  const [sortDir, setSortDir] = useState("desc");     // "asc" | "desc"
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);

  // theme
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [showTheme, setShowTheme] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Load / Save tasks + theme
  useEffect(() => {
    try {
      const traw = localStorage.getItem(THEME_KEY);
      if (traw) setTheme(JSON.parse(traw));
    } catch (e) {
      console.error("Failed to load theme", e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    } catch (e) {
      console.error("Failed to save theme", e);
    }
  }, [theme]);

  const filtered = useMemo(() => {
    return tasks
      .filter((t) =>
        q.trim()
          ? (t.title + " " + (t.notes || "")).toLowerCase().includes(q.toLowerCase())
          : true
      )
      .filter((t) => (priorityFilter === "All" ? true : t.priority === priorityFilter))
      .filter((t) => (statusFilter === "All" ? true : t.status === statusFilter));
  }, [tasks, q, priorityFilter, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "priority") {
        cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      } else if (sortBy === "due") {
        const ad = a.due ? new Date(a.due).getTime() : Infinity; // empty due last
        const bd = b.due ? new Date(b.due).getTime() : Infinity;
        cmp = ad - bd;
      } else if (sortBy === "created") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === "status") {
        cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "Done").length;
    const high = tasks.filter((t) => t.priority === "High" || t.priority === "Urgent").length;
    return { total, done, high };
  }, [tasks]);

  async function upsertTask(task) {
    try {
      if (user) {
        if (task.id) {
          await updateTask(user.uid, task.id, task);
        } else {
          await createTask(user.uid, task);
        }
        // after write, Firestore onSnapshot will update local `tasks` via useTasks hook
      } else {
        // fallback: local-only behavior (keep your existing localStorage logic)
        saveTaskLocally(task);
      }
    } catch (err) {
      console.error("upsertTask error:", err);
      // show UI error/toast if desired
    }
  }

  async function removeTask(id) {
    try {
      if (user) {
        await deleteTaskCloud(user.uid, id);
      } else {
        removeTaskLocally(id);
      }
    } catch (err) {
      console.error("removeTask error:", err);
    }
  }

  async function toggleDone(id) {
    try {
      const t = tasks.find(x => x.id === id);
      if (!t) return;
      const newStatus = t.status === "Done" ? "Todo" : "Done";
      if (user) {
        await updateTask(user.uid, id, { status: newStatus });
      } else {
        // local update
        toggleDoneLocally(id);
      }
    } catch (err) {
      console.error("toggleDone error:", err);
    }
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data)) throw new Error("Invalid file");
        const clean = data
          .filter((d) => d && d.id && d.title)
          .map((d) => ({
            id: String(d.id),
            title: String(d.title),
            notes: d.notes ? String(d.notes) : "",
            priority: ["Low", "Normal", "High", "Urgent"].includes(d.priority) ? d.priority : "Normal",
            status: ["Todo", "In Progress", "Done"].includes(d.status) ? d.status : "Todo",
            due: d.due ? String(d.due) : undefined,
            createdAt: d.createdAt ? String(d.createdAt) : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }));
        clean.forEach((task) => createTask(task));
      } catch (e) {
        alert("Could not import: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div
      className="min-h-screen text-slate-900"
      style={{
        background: `linear-gradient(180deg, ${theme.bgFrom} 0%, ${theme.bgTo} 100%)`,
        fontFamily: theme.font,
      }}
    >
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">TP</div>
            <div>
              <h1 className="text-xl font-bold">Task Prioritizer</h1>
              <p className="text-xs text-slate-500">Prioritize, grade, note — and never lose track.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-3">
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
                style={{ backgroundColor: theme.accent, borderColor: theme.accent }}
                title="New Task"
              >
                <Plus className="h-4 w-4" /> New Task
              </button>
            </div>

            <button
              onClick={() => setShowTheme(true)}
              className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium hover:bg-slate-50"
              title="Appearance"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Appearance
            </button>

            <button
              onClick={exportJSON}
              className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium hover:bg-slate-50"
              title="Export JSON"
            >
              <Download className="h-4 w-4" /> Export
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium hover:bg-slate-50">
              <Upload className="h-4 w-4" /> Import
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importJSON(f);
                }}
              />
            </label>

            {user ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu((s) => !s)}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm bg-white hover:shadow-sm"
                  title={user.email}
                  aria-haspopup="true"
                  aria-expanded={showUserMenu}
                >
                  {/* show sync status inside the user button */}
                  <span className="flex items-center gap-2">
                    <SyncStatus uid={user?.uid} />
                  </span>
                  <span className="text-sm font-medium">Online</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-white p-2 shadow-lg z-20">
                    <div className="px-3 py-2 text-xs text-slate-500">Signed in as</div>
                    <div className="px-3 py-2 text-sm font-medium break-words">{user.email}</div>
                    <div className="mt-2 border-t pt-2">
                      <button
                        onClick={() => { firebaseLogout().catch(()=>{}); setShowUserMenu(false); }}
                        className="w-full text-left rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => setShowSignIn(true)} className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm hover:bg-slate-50">
                <span className="text-sm font-medium">Sign in</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Controls */}
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by title or notes..."
                className="w-full rounded-2xl border px-9 py-2 text-sm outline-none ring-slate-200 focus:ring"
              />
            </div>
          </div>

          <div className="md:col-span-7">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Select value={priorityFilter} onChange={setPriorityFilter} label="All priorities"
                      options={["All","Urgent","High","Normal","Low"]} />
              <Select value={statusFilter} onChange={setStatusFilter} label="All status"
                      options={["All","Todo","In Progress","Done"]} />
              <Select value={sortBy} onChange={setSortBy} label="Sort by priority"
                      options={["priority","due","created","status"]} icon={<ArrowUpDown className="h-4 w-4" />} />
              <Select value={sortDir} onChange={setSortDir} label="Desc"
                      options={["desc","asc"]} icon={<ArrowUpDown className="h-4 w-4" />} />
            </div>
          </div>
        </div>

        {/* Stats */}
<div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
  <StatCard label="Total Tasks" value={stats.total} subtitle="All tasks stored locally" />
  <StatCard label="High & Urgent" value={stats.high} subtitle="Needs attention" />
  <StatCard label="Completed" value={stats.done} subtitle="Marked as done" />
</div>


        {/* List */}
        <div className="grid grid-cols-1 gap-3">
          {sorted.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-slate-500">
              No tasks found. Create your first task!
            </div>
          ) : null}

          {sorted.map((t) => (
            <div key={t.id} className="group rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    onClick={() => toggleDone(t.id)}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${t.status === 'Done' ? 'bg-emerald-600 text-white border-emerald-600' : 'hover:bg-slate-50'}`}
                    title={t.status === 'Done' ? 'Mark as Todo' : 'Mark as Done'}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{t.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <PriorityBadge p={t.priority} />
                      <StatusBadge s={t.status} />
                      {t.due && (
                        <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Due {t.due}</span>
                      )}
                      <span className="hidden sm:inline">•</span>
                      <span>Updated {new Date(t.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditing(t); setShowForm(true); }}
                    className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                  <button
                    onClick={() => removeTask(t.id)}
                    className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              </div>

              {t.notes && (
                <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{t.notes}</div>
              )}
            </div>
          ))}
        </div>
      </main>

      {showForm && (
        <TaskForm
          initial={editing || undefined}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSubmit={(data) => upsertTask(data)}
          theme={theme}
        />
      )}

      {showTheme && (
        <ThemeSettings
          theme={theme}
          onClose={() => setShowTheme(false)}
          onSave={(t) => { setTheme(t); setShowTheme(false); }}
        />
      )}

      {showSignIn && (
        <SignInModal
          onClose={() => setShowSignIn(false)}
          onSuccess={() => setShowSignIn(false)}
        />
      )}

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-6 text-xs text-slate-500">
        <div className="flex items-center justify-between">
          <div>Data is saved in your browser (localStorage). Use Export to back up.</div>
          {user ? (
            <div className="text-right">
              <div className="text-xs text-slate-400">Signed in as</div>
              <div className="text-sm font-medium break-words">{user.email}</div>
            </div>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, subtitle }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-400">{subtitle}</div> : null}
    </div>
  );
}

function Select({ value, onChange, label, options, icon }) {
  const cap = (s) => (typeof s === "string" && s.length > 0) ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  return (
    <div className="relative">
      {icon ? (
        // when an icon is provided by caller, place it absolutely like the default so alignment stays consistent
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {React.cloneElement(icon, { className: "h-4 w-4" })}
        </span>
      ) : (
        <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-2xl border px-9 py-2 text-sm outline-none ring-slate-200 focus:ring"
      >
        {options.map((opt) => {
          const labelText = opt === "priority" ? "Sort by priority" : cap(opt);
          return <option key={opt} value={opt}>{labelText}</option>;
        })}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function PriorityBadge({ p }) {
  const color =
    p === "Urgent" ? "bg-red-100 text-red-700 border-red-200"
      : p === "High" ? "bg-orange-100 text-orange-700 border-orange-200"
      : p === "Normal" ? "bg-blue-100 text-blue-700 border-blue-200"
      : "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}>
      {p}
    </span>
  );
}

function StatusBadge({ s }) {
  const color =
    s === "Done" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : s === "In Progress" ? "bg-violet-100 text-violet-700 border-violet-200"
      : "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}>
      {s}
    </span>
  );
}

function TaskForm({ initial, onClose, onSubmit, theme }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [priority, setPriority] = useState(initial?.priority || "Normal");
  const [status, setStatus] = useState(initial?.status || "Todo");
  const [due, setDue] = useState(initial?.due || "");
  const [time, setTime] = useState(initial?.time || "");          // new: time of day (HH:MM)
  const [email, setEmail] = useState(initial?.email || "");       // new: contact email
  const [location, setLocation] = useState(initial?.location || ""); // new: location string

  const PRIORITY_META = {
    Urgent: { bg: "bg-red-50", ring: "ring-red-300", text: "text-red-700", dot: "bg-red-500" },
    High:   { bg: "bg-orange-50", ring: "ring-orange-200", text: "text-orange-700", dot: "bg-orange-500" },
    Normal: { bg: "bg-blue-50", ring: "ring-blue-200", text: "text-blue-700", dot: "bg-blue-500" },
    Low:    { bg: "bg-slate-50", ring: "ring-slate-200", text: "text-slate-700", dot: "bg-slate-400" },
  };

  function formatCountdown(targetIsoDate, targetTime) {
    if (!targetIsoDate) return null;
    try {
      const datePart = new Date(targetIsoDate);
      if (isNaN(datePart)) return null;
      // If time provided, combine
      let dt;
      if (targetTime) {
        const [hh, mm] = targetTime.split(":").map(Number);
        dt = new Date(datePart);
        dt.setHours(isNaN(hh) ? 0 : hh, isNaN(mm) ? 0 : mm, 0, 0);
      } else {
        dt = new Date(datePart);
      }
      const diff = dt.getTime() - Date.now();
      if (isNaN(diff)) return null;
      if (diff <= 0) return "Expired";
      const days = Math.floor(diff / (1000*60*60*24));
      const hours = Math.floor((diff % (1000*60*60*24)) / (1000*60*60));
      const mins = Math.floor((diff % (1000*60*60)) / (1000*60));
      if (days > 0) return `in ${days}d ${hours}h`;
      if (hours > 0) return `in ${hours}h ${mins}m`;
      return `in ${mins}m`;
    } catch (e) {
      return null;
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      alert("Title is required");
      return;
    }
    const payload = {
      ...(initial?.id ? { id: initial.id } : {}),
      title: title.trim(),
      notes,
      priority,
      status,
      due: due || undefined,
      time: time || undefined,
      email: email || undefined,
      location: location || undefined,
    };
    onSubmit(payload);
  }

  const previewCountdown = formatCountdown(due, time);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative z-10 w-full max-w-3xl rounded-2xl border bg-white shadow-xl">
        <div className={`flex items-center justify-between border-b px-5 py-3 ${PRIORITY_META[priority].bg}`}>
          <div className="flex items-center gap-3">
            <span className={`inline-block h-3 w-3 rounded-full ${PRIORITY_META[priority].dot}`} />
            <div>
              <h2 className="text-base font-semibold">{initial ? "Edit Task" : "New Task"}</h2>
              <p className="text-xs text-slate-500">{initial ? "Update details and save" : "Fill in the details and save"}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border p-2 hover:bg-slate-50" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-6 px-6 py-6">
          <div className="md:col-span-3 flex flex-col gap-4">
            <div>
              <label className="mb-2 block text-xs font-medium">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Prepare MVD4 notes"
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm shadow-sm outline-none transition focus:shadow-md focus:ring-2"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-xs font-medium">Contact email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="team@company.com"
                  type="email"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium">Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Meeting room / Address"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Details, links, checklists..."
                rows={5}
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-xs font-medium">Priority</label>
                <div className="flex flex-wrap gap-2">
                  {["Urgent","High","Normal","Low"].map((p) => {
                    const meta = PRIORITY_META[p];
                    const active = p === priority;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        aria-pressed={active}
                        className={`flex-shrink-0 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? `${meta.bg} ${meta.text} ring-2 ${meta.ring}` : "bg-white text-slate-600 hover:bg-slate-50"}`}
                      >
                        <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium">Status</label>
                <div className="flex flex-wrap gap-2">
                  {["Todo","In Progress","Done"].map((s) => {
                    const active = s === status;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        aria-pressed={active}
                        className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="mb-2 block text-xs font-medium">Due date</label>
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm"
                />
              </div>

              <div className="w-36">
                <label className="mb-2 block text-xs font-medium">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-auto flex justify-end gap-3 border-t pt-4">
              <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: theme?.accent || '#0f172a' }}>
                <Save className="h-4 w-4" /> {initial ? "Save changes" : "Create task"}
              </button>
            </div>
          </div>

          <div className="md:col-span-1">
            <label className="mb-2 block text-xs font-medium invisible md:visible">Preview</label>
            <div className="rounded-xl border px-3 py-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${PRIORITY_META[priority].dot}`} />
                    <div className="text-sm font-medium">{title || "Untitled task"}</div>
                  </div>
                  {email ? <div className="text-xs text-slate-500 mt-1">{email}</div> : null}
                  {location ? <div className="text-xs text-slate-500">{location}</div> : null}
                </div>
                <div className="text-xs text-slate-500">{status}</div>
              </div>
              {due ? <div className="mt-2 text-xs text-slate-400">{previewCountdown ? previewCountdown : `Due ${due}${time ? ' ' + time : ''}`}</div> : null}
              {notes ? <div className="mt-3 text-xs text-slate-600 line-clamp-4">{notes}</div> : null}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Theme settings modal
function ThemeSettings({ theme, onClose, onSave }) {
  const [accent, setAccent] = useState(theme.accent || DEFAULT_THEME.accent);
  const [font, setFont] = useState(theme.font || DEFAULT_THEME.font);
  const [bgFrom, setBgFrom] = useState(theme.bgFrom || DEFAULT_THEME.bgFrom);
  const [bgTo, setBgTo] = useState(theme.bgTo || DEFAULT_THEME.bgTo);

  function handleSave() {
    onSave({ accent, font, bgFrom, bgTo });
  }

  function handleResetToDefault() {
    // apply default immediately and persist
    onSave(DEFAULT_THEME);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative max-w-md rounded-2xl border bg-white p-4 shadow-xl">
        <h3 className="mb-2 text-sm font-semibold">Appearance</h3>
        <div className="mb-3 grid gap-3">
          <div>
            <label className="block text-xs font-medium">Accent color</label>
            <input type="color" value={accent} onChange={(e)=>setAccent(e.target.value)} className="mt-1 h-9 w-12 rounded-md border" />
          </div>
          <div>
            <label className="block text-xs font-medium">Primary font</label>
            <select value={font} onChange={(e)=>setFont(e.target.value)} className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm">
              <option value={'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto'}>Inter / System Sans</option>
              <option value={'"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'}>Segoe UI / Tahoma</option>
              <option value={'Roboto, "Helvetica Neue", Arial, sans-serif'}>Roboto / Helvetica</option>
              <option value={'Georgia, serif'}>Georgia</option>
              <option value={'"Courier New", Courier, monospace'}>Courier New</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium">Background gradient (from)</label>
            <input type="color" value={bgFrom} onChange={(e)=>setBgFrom(e.target.value)} className="mt-1 h-9 w-12 rounded-md border" />
          </div>
          <div>
            <label className="block text-xs font-medium">Background gradient (to)</label>
            <input type="color" value={bgTo} onChange={(e)=>setBgTo(e.target.value)} className="mt-1 h-9 w-12 rounded-md border" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-2xl border px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={handleResetToDefault} className="rounded-2xl border px-4 py-2 text-sm hover:bg-slate-50">Reset to default</button>
          <button onClick={handleSave} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <Save className="h-4 w-4" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

// New SignInModal component
function SignInModal({ onClose, onSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      if (isRegister) {
        await firebaseRegister(email, password);
      } else {
        await firebaseSignIn(email, password);
      }
      setLoading(false);
      onSuccess();
    } catch (e) {
      setErr(e?.message || "Auth failed");
      setLoading(false);
    }
  }

  async function handleSocialSignIn(providerFn) {
    setErr("");
    setLoading(true);
    try {
      await providerFn();
      setLoading(false);
      onSuccess();
    } catch (e) {
      setErr(e?.message || "Social sign-in failed");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border bg-white p-6 shadow-xl z-10">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{isRegister ? "Create account" : "Sign in to your account"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="grid gap-2">
          <button
            onClick={() => handleSocialSignIn(signInWithGoogle)}
            className="auth-btn provider google inline-flex items-center gap-2 justify-center rounded-2xl border px-3 py-2 text-sm"
            disabled={loading}
            title="Continue with Google"
          >
            <svg className="h-4 w-4" viewBox="0 0 533.5 544.3" xmlns="http://www.w3.org/2000/svg"><path fill="#4285f4" d="M533.5 278.4c0-18.8-1.6-37-4.6-54.6H272v103.3h147.1c-6.4 34.6-25.9 64-55.3 83.6v69.5h89.2c52.2-48 82.5-119 82.5-201.8z"/><path fill="#34a853" d="M272 544.3c74 0 136-24.5 181.3-66.4l-89.2-69.5c-24.7 16.6-56.4 26.4-92.1 26.4-70.8 0-130.8-47.8-152.3-112.1H29.7v70.7C74.8 486.6 167.6 544.3 272 544.3z"/><path fill="#fbbc04" d="M119.7 325.3c-10.8-31.5-10.8-65.8 0-97.3V157.3H29.7c-40.9 81.9-40.9 179.8 0 261.7l90-93.7z"/><path fill="#ea4335" d="M272 107.6c39.9 0 75.8 13.7 104.1 40.6l78-78C409.6 24.8 346.6 0 272 0 167.6 0 74.8 57.7 29.7 157.3l90 70.6C141.2 155.4 201.2 107.6 272 107.6z"/></svg>
            <span>Continue with Google</span>
          </button>

          <button
            onClick={() => handleSocialSignIn(signInWithGithub)}
            className="auth-btn provider github inline-flex items-center gap-2 justify-center rounded-2xl border px-3 py-2 text-sm"
            disabled={loading}
            title="Continue with GitHub"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.16-.01-2.1-3.2.7-3.88-1.38-3.88-1.38-.53-1.37-1.3-1.74-1.3-1.74-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.11-.76.41-1.27.74-1.56-2.56-.29-5.26-1.28-5.26-5.72 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0c2.2-1.5 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.45-2.7 5.42-5.28 5.7.42.36.79 1.07.79 2.16 0 1.56-.01 2.82-.01 3.2 0 .3.21.66.8.55C20.71 21.39 24 17.08 24 12c0-6.35-5.15-11.5-12-11.5z"/></svg>
            <span>Continue with GitHub</span>
          </button>
        </div>

        <div className="my-4 border-t pt-4 text-center text-xs text-slate-400">Or use your email</div>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-2xl border px-3 py-2 text-sm"
            type="email"
            required
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            className="w-full rounded-2xl border px-3 py-2 text-sm"
            required
          />

          {err ? <div className="text-xs text-red-600">{err}</div> : null}

          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              {isRegister ? "Already have an account?" : "Don't have an account?"}
              <button type="button" onClick={() => setIsRegister(!isRegister)} className="ml-2 text-sky-600 underline">
                {isRegister ? "Sign in" : "Create account"}
              </button>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-2xl border px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={loading} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm text-white">
                {loading ? (isRegister ? "Creating…" : "Signing in…") : (isRegister ? "Create" : "Sign in")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
