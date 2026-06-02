import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { MovieCard, type Movie } from "@/components/MovieCard";
import { MovieForm } from "@/components/MovieForm";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [tab, setTab] = useState<"watched" | "watchlist">("watched");
  const [genreFilter, setGenreFilter] = useState<string>("All");
  const [open, setOpen] = useState(false);
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
    return movies
      .filter((m) => m.status === tab)
      .filter((m) => genreFilter === "All" || m.genre === genreFilter);
  }, [movies, tab, genreFilter]);

  const genresInTab = useMemo(() => {
    const set = new Set<string>();
    movies.filter((m) => m.status === tab).forEach((m) => set.add(m.genre));
    return ["All", ...Array.from(set).sort()];
  }, [movies, tab]);

  useEffect(() => { setGenreFilter("All"); }, [tab]);

  const watchedCount = movies.filter((m) => m.status === "watched").length;
  const listCount = movies.filter((m) => m.status === "watchlist").length;

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />

      <header className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Film className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-display text-2xl leading-none">Reel</h1>
              <p className="text-xs text-muted-foreground mt-1 italic">your private film journal</p>
            </div>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add film
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="mb-10 text-center">
          <h2 className="font-display text-5xl md:text-6xl tracking-tight">
            The films you've <span className="italic text-primary">lived with</span>.
          </h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Keep what you've seen, what you've rated, and what's still waiting in the dark.
          </p>
        </section>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "watched" | "watchlist")}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
            <TabsList>
              <TabsTrigger value="watched">
                Watched <span className="ml-2 text-xs text-muted-foreground">{watchedCount}</span>
              </TabsTrigger>
              <TabsTrigger value="watchlist">
                Watchlist <span className="ml-2 text-xs text-muted-foreground">{listCount}</span>
              </TabsTrigger>
            </TabsList>

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
            <Grid loading={loading} movies={visible} onChanged={load} emptyLabel="No watched films yet — add the first one." />
          </TabsContent>
          <TabsContent value="watchlist" className="mt-0">
            <Grid loading={loading} movies={visible} onChanged={load} emptyLabel="Your watchlist is empty. What's next?" />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {tab === "watched" ? "Log a film you watched" : "Add to your watchlist"}
            </DialogTitle>
          </DialogHeader>
          <MovieForm
            defaultStatus={tab}
            onSaved={() => { setOpen(false); load(); }}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Grid({
  movies, loading, onChanged, emptyLabel,
}: { movies: Movie[]; loading: boolean; onChanged: () => void; emptyLabel: string }) {
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
        <MovieCard key={m.id} movie={m} onChanged={onChanged} />
      ))}
    </div>
  );
}
