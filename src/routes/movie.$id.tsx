import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Film, Heart, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { AuthGateDialog } from "@/components/AuthGateDialog";
import { MovieForm } from "@/components/MovieForm";
import { useAuth } from "@/hooks/useAuth";
import {
  getPublicMovie,
  getSimilarMovies,
  type PublicMovie,
  type SimilarMovie,
} from "@/lib/movies.functions";
import type { Movie } from "@/components/MovieCard";
import { toast } from "sonner";

type MovieLoaderData = {
  movie: PublicMovie | null;
  similar: SimilarMovie[];
};

const SITE_URL = "https://reel-movie.lovable.app";

function truncate(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : max).trimEnd()}…`;
}

function movieTitle(movie: PublicMovie): string {
  const year = movie.release_year ? ` (${movie.release_year})` : "";
  const details = movie.imdb_rating != null ? "IMDb Rating, Cast & Details" : "Cast & Details";
  return `${movie.title}${year} – ${details} | Reel Movie`;
}

function movieDescription(movie: PublicMovie): string {
  if (movie.overview) return truncate(movie.overview);
  const year = movie.release_year ? ` (${movie.release_year})` : "";
  const genres = movie.genres.length ? `${movie.genres.join(", ")} · ` : "";
  return `${genres}See poster, cast, director and more for ${movie.title}${year} on Reel Movie.`;
}

function parseImdbVotes(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const votes = (raw as Record<string, unknown>).imdbVotes;
  if (typeof votes !== "string") return null;
  const digits = votes.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildJsonLd(movie: PublicMovie) {
  const canonical = `${SITE_URL}/movie/${movie.imdb_id}`;
  const votes = parseImdbVotes(movie.raw);
  const people = (value: string) =>
    value
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n && n !== "N/A")
      .map((name) => ({ "@type": "Person", name }));

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": movie.media_type === "series" ? "TVSeries" : "Movie",
    name: movie.title,
    url: canonical,
    sameAs: `https://www.imdb.com/title/${movie.imdb_id}/`,
  };
  if (movie.poster_url) ld.image = movie.poster_url;
  if (movie.release_year) ld.datePublished = String(movie.release_year);
  if (movie.genres.length) ld.genre = movie.genres;
  if (movie.overview) ld.description = movie.overview;
  if (movie.runtime) ld.duration = `PT${movie.runtime}M`;
  if (movie.director) ld.director = people(movie.director);
  if (movie.actors) ld.actor = people(movie.actors);
  // Only emit aggregateRating when the vote count is genuinely available in
  // the cached OMDb payload — never fabricate a rating count.
  if (movie.imdb_rating != null && votes != null) {
    ld.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: movie.imdb_rating,
      bestRating: 10,
      ratingCount: votes,
    };
  }
  return ld;
}

export const Route = createFileRoute("/movie/$id")({
  loader: async ({ params }): Promise<MovieLoaderData> => {
    const res = await getPublicMovie({ data: { id: params.id } });
    if (res.status === "redirect") {
      // Consolidate legacy per-row URLs onto the one canonical public URL.
      throw redirect({ to: "/movie/$id", params: { id: res.imdbId }, code: 301 });
    }
    if (res.status !== "found") return { movie: null, similar: [] };

    // Recommendations are fetched server-side so their links are part of the
    // SSR'd HTML and directly crawlable. Never let a recommendation failure
    // break the movie page itself.
    let similar: SimilarMovie[] = [];
    try {
      similar = await getSimilarMovies({
        data: {
          imdbId: res.movie.imdb_id,
          genres: res.movie.genres,
          director: res.movie.director,
          actors: res.movie.actors,
          limit: 5,
        },
      });
    } catch {
      // keep the page rendering without the section
    }
    return { movie: res.movie, similar };
  },
  head: ({ loaderData }) => {
    const movie = (loaderData as MovieLoaderData | null | undefined)?.movie ?? null;
    if (!movie) {
      return {
        meta: [{ title: "Movie not found | Reel Movie" }, { name: "robots", content: "noindex" }],
      };
    }

    const canonical = `${SITE_URL}/movie/${movie.imdb_id}`;
    const title = movieTitle(movie);
    const description = movieDescription(movie);
    const ogType = movie.media_type === "series" ? "video.tv_show" : "video.movie";
    const cardType = movie.poster_url ? "summary_large_image" : "summary";

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:site_name", content: "Reel Movie" },
        { property: "og:type", content: ogType },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: canonical },
        ...(movie.poster_url ? [{ property: "og:image", content: movie.poster_url }] : []),
        { name: "twitter:card", content: cardType },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        ...(movie.poster_url ? [{ name: "twitter:image", content: movie.poster_url }] : []),
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(buildJsonLd(movie)) }],
    };
  },
  component: MovieDetail,
});

function SimilarMovieCard({ movie }: { movie: SimilarMovie }) {
  // Plain anchor on purpose: keeps the link a standard crawlable <a href>
  // for search-engine bots (Googlebot, Ahrefs) instead of an SPA navigation.
  return (
    <a
      href={`/movie/${movie.imdb_id}`}
      className="group block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-secondary">
        {movie.poster_url ? (
          <img
            src={movie.poster_url}
            alt={`${movie.title} poster`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Film className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-display text-base leading-tight text-foreground line-clamp-2">
          {movie.title}
          {movie.release_year && (
            <span className="text-muted-foreground font-sans ml-1">({movie.release_year})</span>
          )}
        </h3>
      </div>
    </a>
  );
}

function MovieDetail() {
  const { movie: cached, similar } = Route.useLoaderData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [personal, setPersonal] = useState<Movie | null>(null);
  const [editing, setEditing] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  const imdbId = cached?.imdb_id ?? null;

  // The page itself is public (shared cache). Only the signed-in owner's own
  // list entry — rating, notes, favorite, status — is loaded separately.
  const loadPersonal = useCallback(async () => {
    if (!user || !imdbId) {
      setPersonal(null);
      return;
    }
    const { data } = await supabase
      .from("movies")
      .select("*")
      .eq("imdb_id", imdbId)
      .eq("user_id", user.id)
      .maybeSingle();
    setPersonal((data as Movie | null) ?? null);
  }, [user, imdbId]);

  useEffect(() => {
    loadPersonal();
  }, [loadPersonal]);

  if (!cached) {
    const backTo = user ? "/dashboard" : "/discover";
    return (
      <div className="min-h-screen">
        <AppHeader user={user} />
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <p className="text-muted-foreground">Movie not found.</p>
          <Button asChild variant="ghost" className="mt-4">
            <Link to={backTo}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const movie = cached;
  const isOwner = !!user && !!personal && personal.user_id === user.id;
  const genres = movie.genres.length ? movie.genres : [];

  async function toggleFavorite() {
    if (!personal || !isOwner) return setGateOpen(true);
    const { error } = await supabase
      .from("movies")
      .update({ is_favorite: !personal.is_favorite })
      .eq("id", personal.id);
    if (error) return toast.error(error.message);
    loadPersonal();
  }

  async function remove() {
    if (!personal || !isOwner) return;
    if (!confirm(`Delete "${movie.title}"?`)) return;
    const { error } = await supabase.from("movies").delete().eq("id", personal.id);
    if (error) return toast.error(error.message);
    toast.success("Removed.");
    navigate({ to: "/dashboard" });
  }

  const backTo = user ? "/dashboard" : "/discover";

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />
      <AppHeader user={user} />
      <AuthGateDialog open={gateOpen} onOpenChange={setGateOpen} />

      <main className="mx-auto max-w-6xl px-6 pt-8 pb-16">
        <Button asChild variant="ghost" size="sm" className="mb-6">
          <Link to={backTo}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>

        <div className="grid gap-8 md:grid-cols-[240px_1fr]">
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-border bg-secondary shadow-xl">
            {movie.poster_url ? (
              <img
                src={movie.poster_url}
                alt={`${movie.title} poster`}
                className="h-full w-full object-cover"
              />
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
                  <Badge key={g} variant="secondary" className="font-normal">
                    {g}
                  </Badge>
                ))}
              </div>
              {movie.imdb_rating != null && (
                <>
                  <span aria-hidden>·</span>
                  <span>IMDb {movie.imdb_rating}/10</span>
                </>
              )}
            </div>

            {personal && (
              <div className="mt-5 flex items-center gap-3">
                {personal.status === "watched" && personal.rating_score != null ? (
                  <div className="font-display text-3xl text-primary leading-none">
                    {personal.rating_score}
                    <span className="text-muted-foreground text-lg">/{personal.rating_max}</span>
                  </div>
                ) : (
                  <Badge variant="outline" className="font-normal">
                    {personal.status === "watchlist" ? "In watchlist" : "Watched"}
                  </Badge>
                )}
                <button
                  onClick={toggleFavorite}
                  aria-label={personal.is_favorite ? "Remove from favorites" : "Add to favorites"}
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  <Heart
                    className={`h-5 w-5 ${personal.is_favorite ? "fill-primary text-primary" : ""}`}
                  />
                </button>
                {isOwner && (
                  <div className="ml-auto flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={remove}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}

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
                    <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                      Director
                    </h3>
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

            {personal?.notes && (
              <section className="mt-6 rounded-md border border-border bg-card/50 p-4">
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                  {isOwner ? "Your notes" : "Notes"}
                </h3>
                <p className="mt-2 italic text-foreground/90">"{personal.notes}"</p>
              </section>
            )}
          </div>
        </div>

        {similar.length > 0 && (
          <section className="mt-14" aria-label="You might also like">
            <h2 className="font-display text-2xl mb-4">You Might Also Like</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              {similar.map((m) => (
                <SimilarMovieCard key={m.imdb_id} movie={m} />
              ))}
            </div>
          </section>
        )}
      </main>

      {isOwner && personal && (
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Edit movie</DialogTitle>
            </DialogHeader>
            <MovieForm
              defaultStatus={personal.status}
              userId={user!.id}
              movie={personal}
              onSaved={() => {
                setEditing(false);
                loadPersonal();
              }}
              onCancel={() => setEditing(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
