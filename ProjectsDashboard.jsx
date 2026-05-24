import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Search,
  Clock,
  TrendingUp,
  Compass,
  Eye,
  Zap,
  Pencil,
  Check,
  X,
  Filter,
  Sparkles,
  Layers,
  ArrowUpDown,
} from "lucide-react";

/**
 * ProjectsDashboard
 * --------------------------------------------------------------
 * Dark-mode, interactive table of the projects you spent the most
 * time on in the last 12 months, with four context panels per row:
 *   1. Opportunities to tackle soon
 *   2. Unexplored areas
 *   3. Competitor watch (who's playing in the same space)
 *   4. What competitors do better than us
 *
 * Interactions:
 *   - Click a row to expand the four context panels
 *   - Click any column header to sort (asc/desc/none)
 *   - Filter chips at the top (category)
 *   - Click the pencil icon on any text field to edit it inline
 * --------------------------------------------------------------
 */

const initialProjects = [
  {
    id: 1,
    name: "Interactive Table Component",
    category: "Core Component",
    hours: 64,
    status: "In Progress",
    lastTouched: "Today",
    progress: 72,
    opportunities: [
      "Add row virtualization (react-window) — render slows noticeably past ~200 rows.",
      "Column reordering via drag handle — common ask for any dashboard table.",
      "CSV / Markdown export of the current filtered view (one-line UX win).",
    ],
    unexplored: [
      "Multi-column sort with Shift-click — power users expect it.",
      "Sticky first column on horizontal scroll for wider data tables.",
      "Bulk select + bulk-edit toolbar (no selection state exists yet).",
    ],
    competitors: [
      { name: "TanStack Table", note: "Headless library, composable, massive ecosystem." },
      { name: "AG Grid", note: "Enterprise depth — pivots, grouping, filter sets." },
      { name: "Material React Table", note: "Polished out-of-the-box with editing built in." },
    ],
    competitorEdge: [
      "TanStack's column API gives composable hooks we'd have to invent from scratch.",
      "AG Grid ships row grouping and aggregation — our table is flat-only.",
      "MRT covers validation, error states, and async save patterns we haven't tackled.",
    ],
  },
  {
    id: 2,
    name: "Inline Editing System",
    category: "Interaction Pattern",
    hours: 48,
    status: "In Progress",
    lastTouched: "Today",
    progress: 55,
    opportunities: [
      "Undo / redo stack (Cmd+Z) — biggest missing safety net for an edit-everywhere UI.",
      "Field-level validation with inline error styling before commit.",
      "Optimistic updates with revert-on-error for when a backend lands.",
    ],
    unexplored: [
      "Autosave with a debounced 'Saved · 2s ago' indicator instead of explicit confirm.",
      "Slash-command menu inside text fields (Notion-style).",
      "Multi-cursor / collaborative presence on the same row.",
    ],
    competitors: [
      { name: "Notion", note: "Defines what 'edit anything in place' should feel like." },
      { name: "Airtable", note: "Typed cells with format-aware editors per column." },
      { name: "Linear", note: "Keyboard-first editing with zero modal friction." },
    ],
    competitorEdge: [
      "Notion's slash menu turns editing into a productivity layer, not just text input.",
      "Airtable's typed cells self-validate; ours treats everything as strings.",
      "Linear lets you edit anything with E or Tab — no hover-to-find-pencil ritual.",
    ],
  },
  {
    id: 3,
    name: "Dark Mode Design System",
    category: "Foundation",
    hours: 42,
    status: "Shipped",
    lastTouched: "Yesterday",
    progress: 88,
    opportunities: [
      "Light-mode toggle — half the potential audience defaults to light.",
      "Move hardcoded zinc / cyan values into CSS variables for real theming.",
      "Define a type scale (text-xs → text-3xl mapped to semantic roles, not raw sizes).",
    ],
    unexplored: [
      "High-contrast accessibility mode for WCAG AAA.",
      "Color-blind safe palette variants (deuteranopia / protanopia tested).",
      "prefers-reduced-motion handling on the row expand animation.",
    ],
    competitors: [
      { name: "Vercel / Geist", note: "Gold standard for dark UI tokens and density." },
      { name: "Linear", note: "Pixel-perfect spacing and tight typographic rhythm." },
      { name: "Raycast", note: "Layered dark palette with real color depth." },
    ],
    competitorEdge: [
      "Geist's token system is one source of truth — our colors are scattered across files.",
      "Linear's 4px grid creates visual calm we approximate but don't enforce.",
      "Raycast uses 5+ neutral steps; we lean on 2–3, which flattens hierarchy.",
    ],
  },
  {
    id: 4,
    name: "Expandable Rows / Drawer",
    category: "Interaction Pattern",
    hours: 31,
    status: "In Progress",
    lastTouched: "Today",
    progress: 60,
    opportunities: [
      "Animate row height with framer-motion instead of a CSS-only fade.",
      "Sync expanded row IDs to the URL so a view is shareable.",
      "Lazy-load the four context panels for faster initial render.",
    ],
    unexplored: [
      "Side drawer alternative for narrower viewports.",
      "Split-view layout: list on the left, detail pinned on the right.",
      "Full-screen detail mode for focus work on a single project.",
    ],
    competitors: [
      { name: "Linear", note: "Cmd+click opens detail in a stacked panel — model behavior." },
      { name: "Height", note: "Smooth nested drawer for sub-tasks." },
      { name: "Asana", note: "Persistent right-pane detail you can lock open." },
    ],
    competitorEdge: [
      "Linear's stack-based detail nav lets you traverse without losing the list.",
      "Height's drawer feels native — ours is a content shift, not an overlay.",
      "Asana's lockable pane respects layout preference; we always collapse on close.",
    ],
  },
  {
    id: 5,
    name: "Search & Filter UX",
    category: "Core Component",
    hours: 24,
    status: "Shipped",
    lastTouched: "3 days ago",
    progress: 70,
    opportunities: [
      "Save filter combinations as named views.",
      "Sync search + active filter state to the URL.",
      "Cmd+K global shortcut to focus search from anywhere on the page.",
    ],
    unexplored: [
      "Natural-language filter ('projects >40h with no progress this week').",
      "Faceted search with counts shown on each filter chip.",
      "Fuzzy matching on project names (Fuse.js) for typo-tolerance.",
    ],
    competitors: [
      { name: "Linear", note: "Filter chips that compose with AND/OR logic." },
      { name: "GitHub", note: "Qualified-search syntax (is:open author:me)." },
      { name: "Algolia", note: "Instant results with hit highlighting." },
    ],
    competitorEdge: [
      "Linear's filter chips are addable from a single menu; ours are a static row.",
      "GitHub's search syntax is power-user heaven — we're click-only today.",
      "Algolia highlights matched substrings; our results just appear or vanish.",
    ],
  },
  {
    id: 6,
    name: "Stats Cards & Visualization",
    category: "Data Display",
    hours: 18,
    status: "Backlog",
    lastTouched: "5 days ago",
    progress: 35,
    opportunities: [
      "Add a sparkline to each stat card showing 12-month trend.",
      "Comparison vs prior period (Δ% with up/down arrow).",
      "Click-through from card to a pre-filtered table view.",
    ],
    unexplored: [
      "Chart integration (Recharts / Tremor) for trend-over-time on hours.",
      "Customizable dashboard — drag cards to reorder, hide what you don't need.",
      "Annotations / events overlaid on a timeline.",
    ],
    competitors: [
      { name: "Tremor", note: "Composable dashboard blocks built on Recharts." },
      { name: "Recharts", note: "De-facto React charting library." },
      { name: "Visx", note: "D3 power with React ergonomics for bespoke viz." },
    ],
    competitorEdge: [
      "Tremor ships KPI cards with built-in deltas — we hand-rolled a static value.",
      "Recharts handles responsive sizing automatically; our cards are static numbers.",
      "Visx unlocks chart types we can't build with anything we have today.",
    ],
  },
];

const categoryStyles = {
  "Core Component": "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  "Interaction Pattern": "bg-violet-500/10 text-violet-300 border-violet-500/30",
  Foundation: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  "Data Display": "bg-amber-500/10 text-amber-300 border-amber-500/30",
};

const statusStyles = {
  Shipped: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  "In Progress": "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30",
  Backlog: "bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30",
};

/** Inline-editable text field — click the pencil to toggle edit mode */
function EditableText({ value, onChange, className = "", multiline = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    onChange(draft);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-sm text-zinc-100 focus:border-cyan-500 focus:outline-none resize-none"
            rows={2}
          />
        ) : (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancel();
            }}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-sm text-zinc-100 focus:border-cyan-500 focus:outline-none"
          />
        )}
        <button onClick={commit} className="text-emerald-400 hover:text-emerald-300 mt-1">
          <Check size={14} />
        </button>
        <button onClick={cancel} className="text-zinc-500 hover:text-zinc-300 mt-1">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className={`group flex items-start gap-2 ${className}`}>
      <span className="flex-1">{value}</span>
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-cyan-400 mt-0.5"
        title="Edit"
      >
        <Pencil size={12} />
      </button>
    </div>
  );
}

/** Single context panel (Opportunities / Unexplored / Competitors / Edge) */
function ContextPanel({ title, icon: Icon, accent, items, onItemChange, renderItem }) {
  return (
    <div
      className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 hover:border-zinc-700 transition-colors`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-md ${accent.bg}`}>
          <Icon size={14} className={accent.text} />
        </div>
        <h4 className="text-sm font-semibold text-zinc-100">{title}</h4>
        <span className="ml-auto text-xs text-zinc-500">{items.length}</span>
      </div>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li
            key={idx}
            className="text-sm text-zinc-300 leading-relaxed flex items-start gap-2"
          >
            <span className={`mt-1.5 h-1 w-1 rounded-full flex-shrink-0 ${accent.dot}`} />
            {renderItem ? (
              renderItem(item, idx)
            ) : (
              <EditableText
                value={item}
                onChange={(v) => onItemChange(idx, v)}
                multiline
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProjectsDashboard() {
  const [projects, setProjects] = useState(initialProjects);
  const [expanded, setExpanded] = useState(new Set([1])); // first row open by default
  const [sortKey, setSortKey] = useState("hours");
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = ["All", ...Array.from(new Set(initialProjects.map((p) => p.category)))];

  const toggleRow = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const updateProject = (id, patch) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const updateList = (id, listKey, idx, value) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, [listKey]: p[listKey].map((it, i) => (i === idx ? value : it)) }
          : p
      )
    );
  };

  const updateCompetitor = (id, idx, patch) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              competitors: p.competitors.map((c, i) =>
                i === idx ? { ...c, ...patch } : c
              ),
            }
          : p
      )
    );
  };

  const filtered = useMemo(() => {
    let list = projects;
    if (activeCategory !== "All") list = list.filter((p) => p.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
      );
    }
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [projects, search, activeCategory, sortKey, sortDir]);

  const totalHours = projects.reduce((sum, p) => sum + p.hours, 0);

  const SortIcon = ({ column }) => {
    if (sortKey !== column) return <ArrowUpDown size={12} className="text-zinc-600" />;
    return sortDir === "asc" ? (
      <ChevronUp size={12} className="text-cyan-400" />
    ) : (
      <ChevronDown size={12} className="text-cyan-400" />
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-2 text-xs text-cyan-400 mb-2 uppercase tracking-wider">
            <Sparkles size={14} />
            Last 12 months
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-50">
            Projects & Opportunity Map
          </h1>
          <p className="text-zinc-400 mt-2 max-w-2xl">
            Where your time went, what to tackle next, and how the field is moving around you.
          </p>
        </header>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            icon={Layers}
            label="Projects tracked"
            value={projects.length}
            accent="text-cyan-400"
          />
          <StatCard
            icon={Clock}
            label="Total hours"
            value={totalHours.toLocaleString()}
            accent="text-violet-400"
          />
          <StatCard
            icon={TrendingUp}
            label="Open opportunities"
            value={projects.reduce((s, p) => s + p.opportunities.length, 0)}
            accent="text-emerald-400"
          />
          <StatCard
            icon={Eye}
            label="Competitors tracked"
            value={projects.reduce((s, p) => s + p.competitors.length, 0)}
            accent="text-amber-400"
          />
        </div>

        {/* Controls */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-3 py-2.5 text-sm placeholder-zinc-600 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <Filter size={14} className="text-zinc-500 flex-shrink-0" />
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-colors ${
                  activeCategory === c
                    ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-12 px-5 py-3 text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800 bg-zinc-900/60">
            <div className="col-span-1"></div>
            <button
              onClick={() => handleSort("name")}
              className="col-span-4 md:col-span-3 flex items-center gap-1 hover:text-zinc-300"
            >
              Project <SortIcon column="name" />
            </button>
            <button
              onClick={() => handleSort("category")}
              className="hidden md:flex col-span-2 items-center gap-1 hover:text-zinc-300"
            >
              Category <SortIcon column="category" />
            </button>
            <button
              onClick={() => handleSort("hours")}
              className="col-span-3 md:col-span-2 flex items-center gap-1 hover:text-zinc-300"
            >
              Hours <SortIcon column="hours" />
            </button>
            <button
              onClick={() => handleSort("status")}
              className="col-span-2 flex items-center gap-1 hover:text-zinc-300"
            >
              Status <SortIcon column="status" />
            </button>
            <div className="col-span-2 hidden md:block">Last touched</div>
          </div>

          {/* Rows */}
          {filtered.map((p) => {
            const isOpen = expanded.has(p.id);
            return (
              <div key={p.id} className="border-b border-zinc-800 last:border-b-0">
                <button
                  onClick={() => toggleRow(p.id)}
                  className="w-full grid grid-cols-12 items-center px-5 py-4 text-left hover:bg-zinc-900/60 transition-colors"
                >
                  <div className="col-span-1">
                    {isOpen ? (
                      <ChevronDown size={16} className="text-cyan-400" />
                    ) : (
                      <ChevronRight size={16} className="text-zinc-500" />
                    )}
                  </div>
                  <div className="col-span-4 md:col-span-3">
                    <div className="font-medium text-zinc-100">{p.name}</div>
                    <div className="text-xs text-zinc-500 mt-0.5 md:hidden">
                      {p.category}
                    </div>
                  </div>
                  <div className="hidden md:block col-span-2">
                    <span
                      className={`inline-block text-xs px-2 py-1 rounded-md border ${
                        categoryStyles[p.category] ||
                        "bg-zinc-800 text-zinc-300 border-zinc-700"
                      }`}
                    >
                      {p.category}
                    </span>
                  </div>
                  <div className="col-span-3 md:col-span-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-zinc-200">{p.hours}h</span>
                      <div className="hidden md:block flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-violet-500"
                          style={{
                            width: `${
                              (p.hours /
                                Math.max(...projects.map((pr) => pr.hours))) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-md ${statusStyles[p.status]}`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <div className="hidden md:block col-span-2 text-sm text-zinc-400">
                    {p.lastTouched}
                  </div>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-5 pb-6 pt-2 bg-zinc-950/40 animate-[fadeIn_0.2s_ease]">
                    {/* Progress bar */}
                    <div className="mb-5 flex items-center gap-3">
                      <span className="text-xs text-zinc-500 uppercase tracking-wider">
                        Progress
                      </span>
                      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-violet-500 transition-all"
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-zinc-300">
                        {p.progress}%
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <ContextPanel
                        title="Opportunities to tackle soon"
                        icon={TrendingUp}
                        accent={{
                          bg: "bg-emerald-500/15",
                          text: "text-emerald-300",
                          dot: "bg-emerald-400",
                        }}
                        items={p.opportunities}
                        onItemChange={(idx, v) =>
                          updateList(p.id, "opportunities", idx, v)
                        }
                      />
                      <ContextPanel
                        title="Unexplored areas"
                        icon={Compass}
                        accent={{
                          bg: "bg-violet-500/15",
                          text: "text-violet-300",
                          dot: "bg-violet-400",
                        }}
                        items={p.unexplored}
                        onItemChange={(idx, v) =>
                          updateList(p.id, "unexplored", idx, v)
                        }
                      />
                      <ContextPanel
                        title="Competitor watch"
                        icon={Eye}
                        accent={{
                          bg: "bg-cyan-500/15",
                          text: "text-cyan-300",
                          dot: "bg-cyan-400",
                        }}
                        items={p.competitors}
                        onItemChange={() => {}}
                        renderItem={(c, idx) => (
                          <div className="flex-1">
                            <EditableText
                              value={c.name}
                              onChange={(v) =>
                                updateCompetitor(p.id, idx, { name: v })
                              }
                              className="font-medium text-zinc-100"
                            />
                            <div className="text-xs text-zinc-400 mt-0.5">
                              <EditableText
                                value={c.note}
                                onChange={(v) =>
                                  updateCompetitor(p.id, idx, { note: v })
                                }
                                multiline
                              />
                            </div>
                          </div>
                        )}
                      />
                      <ContextPanel
                        title="What they do better than us"
                        icon={Zap}
                        accent={{
                          bg: "bg-orange-500/15",
                          text: "text-orange-300",
                          dot: "bg-orange-400",
                        }}
                        items={p.competitorEdge}
                        onItemChange={(idx, v) =>
                          updateList(p.id, "competitorEdge", idx, v)
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-12 text-center text-zinc-500 text-sm">
              No projects match your filters.
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-600 mt-4 text-center">
          Hover any cell to reveal the edit icon. Click a column header to sort.
        </p>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Icon size={14} className={accent} />
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1 text-zinc-100">{value}</div>
    </div>
  );
}
