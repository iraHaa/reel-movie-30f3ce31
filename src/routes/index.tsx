import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Film, Search } from "lucide-react";
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

const SITE_URL = "https://reel-movie.lovable.app";
const PAGE_TITLE = "Reel Movie – Free Movie Tracker & Watchlist App";
const PAGE_DESCRIPTION =
  "Track movies you've watched, create your personal watchlist, discover new films and TV shows, rate your favorites, and organize your movie collection with Reel Movie.";
const OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/357267f1-21d6-49e8-bbb2-07c67db05fa8/id-preview-292d5071--bb508a7d-37d8-4c55-b97d-9a557bcb4cd5.lovable.app-1780415684573.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL + "/" },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: PAGE_TITLE },
      { name: "twitter:description", content: PAGE_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: SITE_URL + "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Reel Movie",
          url: SITE_URL,
          description: PAGE_DESCRIPTION,
          applicationCategory: "EntertainmentApplication",
          operatingSystem: "Any",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
        }),
      },
    ],
  }),
  component: Index,
});


type SortKey = "recent" | "oldest" | "title-asc" | "title-desc" | "rating-desc" | "rating-asc";

function Index() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [tab, setTab] = useState<"watched" | "watchlist">("watched");
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
      .order("created_at", { ascending: false });
    if (!error && data) setMovies(data as Movie[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = movies
      .filter((m) => m.status === tab)
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
      case "recent":
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
        break;
      case "oldest":
        sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
        break;
      case "title-asc":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "title-desc":
        sorted.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case "rating-desc":
        sorted.sort((a, b) => ratio(b) - ratio(a));
        break;
      case "rating-asc":
        sorted.sort((a, b) => ratio(a) - ratio(b));
        break;
    }
    return sorted;
  }, [movies, tab, genreFilter, search, sort]);

  const genresInTab = useMemo(() => {
    const set = new Set<string>();
    movies.filter((m) => m.status === tab).forEach((m) => set.add(m.genre));
    return ["All", ...Array.from(set).sort()];
  }, [movies, tab]);

  useEffect(() => { setGenreFilter("All"); }, [tab]);

  const watchedCount = movies.filter((m) => m.status === "watched").length;
  const listCount = movies.filter((m) => m.status === "watchlist").length;

  function openAdd() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(m: Movie) {
    setEditing(m);
    setOpen(true);
  }

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />

      <header className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Film className="h-6 w-6 text-primary" aria-hidden="true" />
            <div>
              <p className="font-display text-2xl leading-none">Reel Movie</p>
              <p className="text-xs text-muted-foreground mt-1 italic">your private movie hub</p>
            </div>
          </div>
          <nav aria-label="Primary">
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add movie
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="mb-10 text-center" aria-labelledby="hero-title">
          <h1
            id="hero-title"
            className="font-display text-5xl md:text-6xl tracking-tight"
          >
            Free Movie Tracker &amp; <span className="italic text-primary">Watchlist App</span>
          </h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Track movies you've watched, rate your favorites, and organize your personal watchlist of films and TV shows.
          </p>
        </section>

        <section aria-labelledby="collection-title">
          <h2 id="collection-title" className="sr-only">Your movie collection</h2>


        <Tabs value={tab} onValueChange={(v) => setTab(v as "watched" | "watchlist")}>
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TabsList>
                <TabsTrigger value="watched">
                  Watched <span className="ml-2 text-xs text-muted-foreground">{watchedCount}</span>
                </TabsTrigger>
                <TabsTrigger value="watchlist">
                  Watchlist <span className="ml-2 text-xs text-muted-foreground">{listCount}</span>
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search title, genre, notes…"
                    className="pl-8 sm:w-64"
                  />
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
                <button
                  key={g}
                  onClick={() => setGenreFilter(g)}
                  className="focus:outline-none"
                >
                  <Badge
                    variant={genreFilter === g ? "default" : "outline"}
                    className="cursor-pointer font-normal"
                  >
                    {g}
                  </Badge>
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
        </Tabs>
        </section>
      </main>

      <footer className="border-t border-border/60 mt-16">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Reel Movie — a free movie tracker &amp; watchlist app.</p>
        </div>
      </footer>


      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {editing
                ? "Edit movie"
                : tab === "watched" ? "Log a movie you watched" : "Add to your watchlist"}
            </DialogTitle>
          </DialogHeader>
          <MovieForm
            defaultStatus={tab}
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
  if (loading) {
    return <p className="text-muted-foreground text-sm py-12 text-center">Loading…</p>;
  }
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
