import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft, Copy, GripVertical, Search, Trash2, UserPlus, X, Globe, Lock, Link2, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import type { Movie } from "@/components/MovieCard";
import type { ListSortMode, MovieList } from "@/lib/lists";
import { newShareSlug } from "@/lib/lists";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lists/$id")({
  head: () => ({ meta: [{ title: "List – Reel Movie" }, { name: "robots", content: "noindex" }] }),
  component: ListDetail,
});

interface Item { position: number; added_at: string; movie: Movie }

function ListDetail() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  const [list, setList] = useState<MovieList | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All");
  const [year, setYear] = useState("All");
  const [watched, setWatched] = useState<"all" | "watched" | "unwatched">("all");
  const [minRating, setMinRating] = useState<string>("0");

  // dialogs
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    setLoading(true);
    const { data: l, error } = await supabase.from("lists").select("*").eq("id", id).maybeSingle();
    if (error || !l) { setNotFound(true); setLoading(false); return; }
    setList(l as MovieList);
    const { data: rows } = await supabase
      .from("list_items")
      .select("position, added_at, movie:movies(*)")
      .eq("list_id", id)
      .order("position", { ascending: true });
    setItems(((rows ?? []) as unknown as Item[]).filter(r => r.movie));
    setLoading(false);
  }
  useEffect(() => { load(); }, [id]);

  const isOwner = !!list && list.user_id === user.id;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(({ movie: m }) => {
      if (q && !m.title.toLowerCase().includes(q) && !m.genre.toLowerCase().includes(q)) return false;
      if (genre !== "All" && m.genre !== genre) return false;
      if (year !== "All") {
        const y = (m.watched_at ?? m.created_at).slice(0, 4);
        if (y !== year) return false;
      }
      if (watched === "watched" && m.status !== "watched") return false;
      if (watched === "unwatched" && m.status !== "watchlist") return false;
      const min = Number(minRating);
      if (min > 0) {
        const r = m.rating_score != null && m.rating_max ? (m.rating_score / m.rating_max) * 10 : -1;
        if (r < min) return false;
      }
      return true;
    });
  }, [items, search, genre, year, watched, minRating]);

  const sorted = useMemo(() => {
    if (!list) return filtered;
    const mode: ListSortMode = list.sort_mode;
    const arr = [...filtered];
    const ratio = (m: Movie) => m.rating_score != null && m.rating_max ? m.rating_score / m.rating_max : -1;
    switch (mode) {
      case "date_added": arr.sort((a, b) => b.added_at.localeCompare(a.added_at)); break;
      case "rating": arr.sort((a, b) => ratio(b.movie) - ratio(a.movie)); break;
      case "alpha": arr.sort((a, b) => a.movie.title.localeCompare(b.movie.title)); break;
      case "custom": break;
    }
    return arr;
  }, [filtered, list]);

  const genres = useMemo(() => ["All", ...Array.from(new Set(items.map(i => i.movie.genre))).sort()], [items]);
  const years = useMemo(() => {
    const ys = new Set(items.map(i => (i.movie.watched_at ?? i.movie.created_at).slice(0, 4)));
    return ["All", ...Array.from(ys).sort((a, b) => b.localeCompare(a))];
  }, [items]);

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id || !isOwner) return;
    if (list?.sort_mode !== "custom") {
      toast.info("Switch sort to Custom to reorder.");
      return;
    }
    const oldIndex = items.findIndex(i => i.movie.id === active.id);
    const newIndex = items.findIndex(i => i.movie.id === over.id);
    const next = arrayMove(items, oldIndex, newIndex).map((it, idx) => ({ ...it, position: idx }));
    setItems(next);
    // persist positions
    const updates = next.map((it, idx) =>
      supabase.from("list_items").update({ position: idx }).eq("list_id", id).eq("movie_id", it.movie.id)
    );
    const results = await Promise.all(updates);
    if (results.some(r => r.error)) toast.error("Failed to save order");
  }

  async function removeItem(movieId: string) {
    const prev = items;
    setItems(items.filter(i => i.movie.id !== movieId));
    const { error } = await supabase.from("list_items").delete().eq("list_id", id).eq("movie_id", movieId);
    if (error) { setItems(prev); toast.error(error.message); }
  }

  async function setSortMode(mode: ListSortMode) {
    if (!list) return;
    setList({ ...list, sort_mode: mode });
    await supabase.from("lists").update({ sort_mode: mode }).eq("id", list.id);
  }

  async function ensureShareSlug() {
    if (!list) return null;
    if (list.share_slug) return list.share_slug;
    const slug = newShareSlug();
    const { error } = await supabase.from("lists").update({ share_slug: slug }).eq("id", list.id);
    if (error) { toast.error(error.message); return null; }
    setList({ ...list, share_slug: slug });
    return slug;
  }

  async function copyShareLink() {
    const slug = await ensureShareSlug();
    if (!slug) return;
    const url = `${window.location.origin}/lists/share/${slug}`;
    await navigator.clipboard.writeText(url);
    toast.success("Share link copied");
  }

  if (loading) return <div className="min-h-screen"><AppHeader user={user} /><p className="text-muted-foreground text-sm py-20 text-center">Loading…</p></div>;
  if (notFound || !list) return (
    <div className="min-h-screen">
      <AppHeader user={user} />
      <main className="mx-auto max-w-6xl px-6 py-20 text-center">
        <p className="text-muted-foreground">This list doesn't exist or you don't have access.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate({ to: "/lists" })}>Back to lists</Button>
      </main>
    </div>
  );

  const VIcon = list.visibility === "public" ? Globe : list.visibility === "shared" ? Link2 : Lock;

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />
      <AppHeader user={user} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Link to="/lists" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> All lists
        </Link>

        <header className="flex items-start gap-4 mb-8">
          <div className="text-5xl leading-none">{list.emoji ?? "🎬"}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-4xl truncate">{list.title}</h1>
              <VIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            {list.description && <p className="mt-2 text-muted-foreground">{list.description}</p>}
            <p className="mt-2 text-xs text-muted-foreground">{items.length} {items.length === 1 ? "movie" : "movies"}</p>
          </div>
          {isOwner && (
            <div className="flex flex-col sm:flex-row gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>Add movies</Button>
              {(list.visibility === "shared" || list.visibility === "public") && (
                <Button size="sm" variant="ghost" onClick={copyShareLink}><Copy className="h-3.5 w-3.5" /> Share link</Button>
              )}
              {list.visibility === "shared" && (
                <Button size="sm" variant="ghost" onClick={() => setInviteOpen(true)}><UserPlus className="h-3.5 w-3.5" /> Invites</Button>
              )}
            </div>
          )}
        </header>

        {/* Controls */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search in list…" className="pl-8" />
            </div>
            <Select value={list.sort_mode} onValueChange={(v) => isOwner ? setSortMode(v as ListSortMode) : null}>
              <SelectTrigger className="sm:w-44" disabled={!isOwner}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom order</SelectItem>
                <SelectItem value="date_added">Date added</SelectItem>
                <SelectItem value="rating">My rating</SelectItem>
                <SelectItem value="alpha">Alphabetically</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={genre} onValueChange={setGenre}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Genre" /></SelectTrigger>
              <SelectContent>{genres.map(g => <SelectItem key={g} value={g}>{g === "All" ? "All genres" : g}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y === "All" ? "All years" : y}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={watched} onValueChange={(v) => setWatched(v as typeof watched)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Watched + not</SelectItem>
                <SelectItem value="watched">Watched only</SelectItem>
                <SelectItem value="unwatched">Unwatched only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={minRating} onValueChange={setMinRating}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Any rating</SelectItem>
                <SelectItem value="6">≥ 6 / 10</SelectItem>
                <SelectItem value="7">≥ 7 / 10</SelectItem>
                <SelectItem value="8">≥ 8 / 10</SelectItem>
                <SelectItem value="9">≥ 9 / 10</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg py-20 text-center">
            <p className="text-muted-foreground italic mb-4">No movies in this list yet.</p>
            {isOwner && <Button onClick={() => setAddOpen(true)}>Add movies</Button>}
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-muted-foreground text-sm py-12 text-center">No movies match your filters.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={sorted.map(i => i.movie.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {sorted.map((it) => (
                  <SortableRow key={it.movie.id} item={it} isOwner={isOwner} canReorder={list.sort_mode === "custom"} onRemove={() => removeItem(it.movie.id)} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </main>

      {isOwner && <AddMoviesDialog open={addOpen} onOpenChange={setAddOpen} listId={list.id} userId={user.id} existingIds={new Set(items.map(i => i.movie.id))} onDone={() => { setAddOpen(false); load(); }} />}
      {isOwner && <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} listId={list.id} />}
    </div>
  );
}

function SortableRow({ item, isOwner, canReorder, onRemove }: { item: Item; isOwner: boolean; canReorder: boolean; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.movie.id, disabled: !isOwner || !canReorder });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const m = item.movie;
  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      {isOwner && canReorder && (
        <button {...attributes} {...listeners} aria-label="Drag" className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg truncate">{m.title}</h3>
          <Badge variant="secondary" className="font-normal">{m.genre}</Badge>
          {m.status === "watchlist" && <Badge variant="outline" className="font-normal">Watchlist</Badge>}
        </div>
        {m.notes && <p className="text-xs text-muted-foreground italic mt-1 line-clamp-1">"{m.notes}"</p>}
      </div>
      {m.rating_score != null && m.rating_max && (
        <div className="font-display text-primary shrink-0">
          {m.rating_score}<span className="text-muted-foreground text-sm">/{m.rating_max}</span>
        </div>
      )}
      {isOwner && (
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  );
}

function AddMoviesDialog({
  open, onOpenChange, listId, userId, existingIds, onDone,
}: { open: boolean; onOpenChange: (o: boolean) => void; listId: string; userId: string; existingIds: Set<string>; onDone: () => void }) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQ("");
    supabase.from("movies").select("*").eq("user_id", userId).order("created_at", { ascending: false })
      .then(({ data }) => setMovies((data ?? []) as Movie[]));
  }, [open, userId]);

  const available = movies.filter(m => !existingIds.has(m.id) && (!q || m.title.toLowerCase().includes(q.toLowerCase())));

  async function add() {
    if (selected.size === 0) return onOpenChange(false);
    setSaving(true);
    const { count } = await supabase.from("list_items").select("*", { count: "exact", head: true }).eq("list_id", listId);
    const start = count ?? 0;
    const rows = Array.from(selected).map((movie_id, idx) => ({ list_id: listId, movie_id, position: start + idx }));
    const { error } = await supabase.from("list_items").insert(rows);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Added ${rows.length}`);
    onDone();
  }

  function toggle(id: string) {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-display text-2xl">Add movies</DialogTitle></DialogHeader>
        <Input placeholder="Search your movies…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-80 overflow-y-auto space-y-1">
          {available.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nothing to add.</p>}
          {available.map((m) => (
            <button key={m.id} type="button" onClick={() => toggle(m.id)}
              className={`w-full flex items-center gap-3 rounded-md border p-2 text-left ${selected.has(m.id) ? "border-primary bg-primary/10" : "border-border"}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{m.title}</span>
                <span className="block text-xs text-muted-foreground">{m.genre}</span>
              </span>
              {selected.has(m.id) && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={add} disabled={saving || selected.size === 0}>{saving ? "Adding…" : `Add ${selected.size || ""}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface InviteRow { id: string; invitee_id: string; username: string | null }

function InviteDialog({ open, onOpenChange, listId }: { open: boolean; onOpenChange: (o: boolean) => void; listId: string }) {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("list_invites").select("id, invitee_id").eq("list_id", listId);
    const rows = (data ?? []) as { id: string; invitee_id: string }[];
    if (rows.length === 0) return setInvites([]);
    const { data: profs } = await supabase.from("profiles").select("id, username").in("id", rows.map(r => r.invitee_id));
    const nameOf = new Map((profs ?? []).map(p => [p.id, p.username as string]));
    setInvites(rows.map(r => ({ id: r.id, invitee_id: r.invitee_id, username: nameOf.get(r.invitee_id) ?? null })));
  }
  useEffect(() => { if (open) load(); }, [open, listId]);

  async function invite() {
    if (!username.trim()) return;
    setBusy(true);
    const { data: prof } = await supabase.from("profiles").select("id").eq("username", username.trim()).maybeSingle();
    if (!prof) { setBusy(false); return toast.error("No user with that username"); }
    const { error } = await supabase.from("list_invites").insert({ list_id: listId, invitee_id: prof.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    setUsername("");
    toast.success("Invited");
    load();
  }

  async function revoke(id: string) {
    const { error } = await supabase.from("list_invites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display text-2xl">Manage invites</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Button onClick={invite} disabled={busy}>Invite</Button>
        </div>
        <ul className="space-y-1 mt-2">
          {invites.length === 0 && <p className="text-sm text-muted-foreground">Nobody invited yet.</p>}
          {invites.map(i => (
            <li key={i.id} className="flex items-center gap-2 rounded-md border border-border p-2">
              <span className="flex-1 truncate">@{i.username ?? i.invitee_id.slice(0, 8)}</span>
              <Button size="sm" variant="ghost" onClick={() => revoke(i.id)}><X className="h-3.5 w-3.5" /></Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
