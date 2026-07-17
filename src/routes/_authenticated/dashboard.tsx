import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { MovieCard, type Movie } from "@/components/MovieCard";
import { MovieForm } from "@/components/MovieForm";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Your movies – Reel Movie" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

type SortKey = "recent" | "oldest" | "title-asc" | "title-desc" | "rating-desc" | "rating-asc";
type TabKey = "watched" | "watchlist" | "favorites";

function Dashboard() {
  const { user } = Route.useRouteContext();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [tab, setTab] = useState<TabKey>("watched");
  const [genreFilter, setGenreFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("movies")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (!error && data) setMovies(data as Movie[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = movies
      .filter((m) => {
        if (tab === "favorites") return m.is_favorite;
        return m.status === tab;
      })
      .filter((m) => genreFilter === "All" || m.genre === genreFilter)
      .filter((m) =>
        !q ||
        m.title.toLowerCase().includes(q) ||
        m.genre.toLowerCase().includes(q) ||
        (m.notes ?? "").toLowerCase().includes(q),
      );

    const ratio = (m: Movie) =>
      m.rating_score != null && m.rating_max ? m.rating_score / m.rating_max : -1;

    const sorted = [...filtered];
    switch (sort) {
      case "recent": sorted.sort((a, b) => b.created_at.localeCompare(a.created_at)); break;
      case "oldest": sorted.sort((a, b) => a.created_at.localeCompare(b.created_at)); break;
      case "title-asc": sorted.sort((a, b) => a.title.localeCompare(b.title)); break;
      case "title-desc": sorted.sort((a, b) => b.title.localeCompare(a.title)); break;
      case "rating-desc": sorted.sort((a, b) => ratio(b) - ratio(a)); break;
      case "rating-asc": sorted.sort((a, b) => ratio(a) - ratio(b)); break;
    }
    return sorted;
  }, [movies, tab, genreFilter, search, sort]);

  const genresInTab = useMemo(() => {
    const set = new Set<string>();
    movies
      .filter((m) => tab === "favorites" ? m.is_favorite : m.status === tab)
      .forEach((m) => set.add(m.genre));
    return ["All", ...Array.from(set).sort()];
  }, [movies, tab]);

  useEffect(() => { setGenreFilter("All"); }, [tab]);

  const watchedCount = movies.filter((m) => m.status === "watched").length;
  const listCount = movies.filter((m) => m.status === "watchlist").length;
  const favCount = movies.filter((m) => m.is_favorite).length;

  function openAdd() { setEditing(null); setOpen(true); }
  function openEdit(m: Movie) { setEditing(m); setOpen(true); }

  const formStatus: "watched" | "watchlist" = tab === "watchlist" ? "watchlist" : "watched";

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />
      <AppHeader
        user={user}
        action={<Button onClick={openAdd}><Plus className="h-4 w-4" /> Add movie</Button>}
      />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section aria-labelledby="collection-title">
          <h1 id="collection-title" className="font-display text-4xl mb-8">Your movies</h1>

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <TabsList>
                  <TabsTrigger value="watched">Watched <span className="ml-2 text-xs text-muted-foreground">{watchedCount}</span></TabsTrigger>
                  <TabsTrigger value="watchlist">Watchlist <span className="ml-2 text-xs text-muted-foreground">{listCount}</span></TabsTrigger>
                  <TabsTrigger value="favorites">Favorites <span className="ml-2 text-xs text-muted-foreground">{favCount}</span></TabsTrigger>
                </TabsList>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, genre, notes…" className="pl-8 sm:w-64" />
                  </div>
                  <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                    <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Recently added</SelectItem>
                      <SelectItem value="oldest">Oldest first</SelectItem>
                      <SelectItem value="title-asc">Title A–Z</SelectItem>
                      <SelectItem value="title-desc">Title Z–A</SelectItem>
                      <SelectItem value="rating-desc">Rating high–low</SelectItem>
                      <SelectItem value="rating-asc">Rating low–high</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {genresInTab.map((g) => (
                  <button key={g} onClick={() => setGenreFilter(g)} className="focus:outline-none">
                    <Badge variant={genreFilter === g ? "default" : "outline"} className="cursor-pointer font-normal">{g}</Badge>
                  </button>
                ))}
              </div>
            </div>

            <TabsContent value="watched" className="mt-0">
              <Grid loading={loading} movies={visible} onChanged={load} onEdit={openEdit} emptyLabel="No watched movies yet — add the first one." />
            </TabsContent>
            <TabsContent value="watchlist" className="mt-0">
              <Grid loading={loading} movies={visible} onChanged={load} onEdit={openEdit} emptyLabel="Your watchlist is empty. What's next?" />
            </TabsContent>
            <TabsContent value="favorites" className="mt-0">
              <Grid loading={loading} movies={visible} onChanged={load} onEdit={openEdit} emptyLabel="Tap the heart on any movie to add it to favorites." />
            </TabsContent>
          </Tabs>
        </section>
      </main>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {editing ? "Edit movie" : formStatus === "watched" ? "Log a movie you watched" : "Add to your watchlist"}
            </DialogTitle>
          </DialogHeader>
          <MovieForm
            defaultStatus={formStatus}
            userId={user.id}
            movie={editing}
            onSaved={() => { setOpen(false); setEditing(null); load(); }}
            onCancel={() => { setOpen(false); setEditing(null); }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Grid({
  movies, loading, onChanged, onEdit, emptyLabel,
}: { movies: Movie[]; loading: boolean; onChanged: () => void; onEdit: (m: Movie) => void; emptyLabel: string }) {
  if (loading) return <p className="text-muted-foreground text-sm py-12 text-center">Loading…</p>;
  if (movies.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-lg py-20 text-center">
        <p className="text-muted-foreground italic">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {movies.map((m) => (
        <MovieCard key={m.id} movie={m} onChanged={onChanged} onEdit={onEdit} />
      ))}
    </div>
  );
}
