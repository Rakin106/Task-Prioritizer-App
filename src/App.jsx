import React, { useEffect, useMemo, useState } from "react";
import {
  Plus, Search, Trash2, Pencil, CheckCircle2, Download, Upload,
  Filter, Save, X, Calendar, ChevronDown, ArrowUpDown
} from "lucide-react";

// Priority & status orders (for sorting)
const PRIORITY_ORDER = { Low: 0, Normal: 1, High: 2, Urgent: 3 };
const STATUS_ORDER = { "Todo": 0, "In Progress": 1, "Done": 2 };

function uid() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
}

const STORAGE_KEY = "task_prioritizer_v1";

export default function TaskPrioritizerApp() {
  const [tasks, setTasks] = useState([]);
  const [q, setQ] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("priority");   // "priority" | "due" | "created" | "status"
  const [sortDir, setSortDir] = useState("desc");     // "asc" | "desc"
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Load / Save
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTasks(JSON.parse(raw));
    } catch (e) {
      console.error("Failed to load tasks", e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      console.error("Failed to save tasks", e);
    }
  }, [tasks]);

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

  function upsertTask(input) {
    const now = new Date().toISOString();
    if (editing) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === editing.id
            ? {
                ...t,
                title: input.title ?? t.title,
                notes: input.notes ?? t.notes,
                priority: input.priority ?? t.priority,
                status: input.status ?? t.status,
                due: input.due === undefined ? t.due : input.due || undefined,
                updatedAt: now,
              }
            : t
        )
      );
      setEditing(null);
      setShowForm(false);
      return;
    }
    const newTask = {
      id: uid(),
      title: (input.title || "Untitled").trim(),
      notes: input.notes || "",
      priority: input.priority || "Normal",
      status: input.status || "Todo",
      due: input.due || undefined,
      createdAt: now,
      updatedAt: now,
    };
    setTasks((prev) => [newTask, ...prev]);
    setShowForm(false);
  }

  function removeTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function toggleDone(id) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: t.status === "Done" ? "Todo" : "Done", updatedAt: new Date().toISOString() }
          : t
      )
    );
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
        setTasks(clean);
      } catch (e) {
        alert("Could not import: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
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
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" /> New Task
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

        {{/* Stats */}
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
        />
      )}

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-6 text-center text-xs text-slate-500">
        Data is saved in your browser (localStorage). Use Export to back up.
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
  return (
    <div className="relative">
      {icon ? icon : <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-2xl border px-9 py-2 text-sm outline-none ring-slate-200 focus:ring"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt === "priority" ? "Sort by priority" : opt}</option>
        ))}
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

function TaskForm({ initial, onClose, onSubmit }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [priority, setPriority] = useState(initial?.priority || "Normal");
  const [status, setStatus] = useState(initial?.status || "Todo");
  const [due, setDue] = useState(initial?.due || "");

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      alert("Title is required");
      return;
    }
    onSubmit({ title, notes, priority, status, due: due || undefined });
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="hidden flex-1 bg-black/30 md:block" onClick={onClose} />
      <div className="ml-auto flex h-full w-full max-w-xl flex-col border-l bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">{initial ? "Edit Task" : "New Task"}</h2>
            <p className="text-xs text-slate-500">{initial ? "Update details and save" : "Fill in the details and save"}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border p-2 hover:bg-slate-50" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Prepare MVD4 notes"
              className="w-full rounded-2xl border px-3 py-2 text-sm outline-none ring-slate-200 focus:ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Details, links, checklists..."
              rows={6}
              className="w-full rounded-2xl border px-3 py-2 text-sm outline-none ring-slate-200 focus:ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <label className="mb-1 block text-xs font-medium">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full appearance-none rounded-2xl border px-3 py-2 text-sm outline-none ring-slate-200 focus:ring"
              >
                {["Urgent", "High", "Normal", "Low"].map((p) => <option key={p}>{p}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-9 h-4 w-4 text-slate-400" />
            </div>
            <div className="relative">
              <label className="mb-1 block text-xs font-medium">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full appearance-none rounded-2xl border px-3 py-2 text-sm outline-none ring-slate-200 focus:ring"
              >
                {["Todo", "In Progress", "Done"].map((s) => <option key={s}>{s}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-9 h-4 w-4 text-slate-400" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium">Due date</label>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="w-full rounded-2xl border px-3 py-2 text-sm outline-none ring-slate-200 focus:ring"
            />
          </div>

          <div className="mt-auto flex justify-end gap-2 border-t pt-3">
            <button type="button" onClick={onClose} className="rounded-2xl border px-4 py-2 text-sm hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              <Save className="h-4 w-4" /> {initial ? "Save changes" : "Create task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
