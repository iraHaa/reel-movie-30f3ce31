import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Heart, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { AuthGateDialog } from "@/components/AuthGateDialog";
import { MovieForm } from "@/components/MovieForm";
import { useAuth } from "@/hooks/useAuth";
import type { Movie } from "@/components/MovieCard";
import { toast } from "sonner";

export const Route = createFileRoute("/movie/$id")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: MovieDetail,
});

function MovieDetail() {
  const { user } = useAuth();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("movies").select("*").eq("id", id).maybeSingle();
    if (error) toast.error(error.message);
    setMovie(data as Movie | null);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const isOwner = !!user && !!movie && movie.user_id === user.id;

  async function toggleFavorite() {
    if (!movie) return;
    if (!isOwner) return setGateOpen(true);
    const { error } = await supabase
      .from("movies")
      .update({ is_favorite: !movie.is_favorite })
      .eq("id", movie.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function remove() {
    if (!movie) return;
    if (!confirm(`Delete "${movie.title}"?`)) return;
    const { error } = await supabase.from("movies").delete().eq("id", movie.id);
    if (error) return toast.error(error.message);
    toast.success("Removed.");
    navigate({ to: "/dashboard" });
  }

  const backTo = user ? "/dashboard" : "/discover";

  if (loading) {
    return (
      <div className="min-h-screen">
        <AppHeader user={user} />
        <p className="mx-auto max-w-6xl px-6 py-20 text-center text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (!movie) {
    return (
      <div className="min-h-screen">
        <AppHeader user={user} />
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <p className="text-muted-foreground">Movie not found.</p>
          <Button asChild variant="ghost" className="mt-4">
            <Link to={backTo}><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
        </div>
      </div>
    );
  }

  const genres = movie.genres && movie.genres.length ? movie.genres : [movie.genre];

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />
      <AppHeader user={user} />
      <AuthGateDialog open={gateOpen} onOpenChange={setGateOpen} />

      <main className="mx-auto max-w-6xl px-6 pt-8 pb-16">
        <Button asChild variant="ghost" size="sm" className="mb-6">
          <Link to={backTo}><ArrowLeft className="h-4 w-4" /> Back</Link>
        </Button>

        <div className="grid gap-8 md:grid-cols-[240px_1fr]">
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-border bg-secondary shadow-xl">
            {movie.poster_url ? (
              <img src={movie.poster_url} alt={`${movie.title} poster`} className="h-full w-full object-cover" />
            ) : null}
          </div>

          <div className="pt-2">
            <h1 className="font-display text-4xl md:text-5xl leading-tight">
              {movie.title}
              {movie.release_year && (
                <span className="text-muted-foreground text-2xl ml-2">({movie.release_year})</span>
              )}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {movie.runtime && <span>{movie.runtime} min</span>}
              {movie.runtime && genres.length > 0 && <span aria-hidden>·</span>}
              <div className="flex flex-wrap gap-1.5">
                {genres.map((g) => (
                  <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>
                ))}
              </div>
              {movie.imdb_rating != null && (
                <>
                  <span aria-hidden>·</span>
                  <span>IMDb {movie.imdb_rating}/10</span>
                </>
              )}
            </div>

            <div className="mt-5 flex items-center gap-3">
              {movie.status === "watched" && movie.rating_score != null ? (
                <div className="font-display text-3xl text-primary leading-none">
                  {movie.rating_score}
                  <span className="text-muted-foreground text-lg">/{movie.rating_max}</span>
                </div>
              ) : (
                <Badge variant="outline" className="font-normal">
                  {movie.status === "watchlist" ? "In watchlist" : "Watched"}
                </Badge>
              )}
              <button
                onClick={toggleFavorite}
                aria-label={movie.is_favorite ? "Remove from favorites" : "Add to favorites"}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <Heart className={`h-5 w-5 ${movie.is_favorite ? "fill-primary text-primary" : ""}`} />
              </button>
              {isOwner && (
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={remove} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {movie.overview && (
              <section className="mt-6">
                <h2 className="font-display text-xl mb-2">Overview</h2>
                <p className="text-foreground/90 leading-relaxed">{movie.overview}</p>
              </section>
            )}

            {(movie.director || movie.actors) && (
              <section className="mt-6 grid gap-4 sm:grid-cols-2">
                {movie.director && (
                  <div>
                    <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Director</h3>
                    <p className="mt-1">{movie.director}</p>
                  </div>
                )}
                {movie.actors && (
                  <div>
                    <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Cast</h3>
                    <p className="mt-1">{movie.actors}</p>
                  </div>
                )}
              </section>
            )}

            {movie.notes && (
              <section className="mt-6 rounded-md border border-border bg-card/50 p-4">
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                  {isOwner ? "Your notes" : "Notes"}
                </h3>
                <p className="mt-2 italic text-foreground/90">"{movie.notes}"</p>
              </section>
            )}
          </div>
        </div>
      </main>

      {isOwner && (
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Edit movie</DialogTitle>
            </DialogHeader>
            <MovieForm
              defaultStatus={movie.status}
              userId={user!.id}
              movie={movie}
              onSaved={() => { setEditing(false); load(); }}
              onCancel={() => setEditing(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
