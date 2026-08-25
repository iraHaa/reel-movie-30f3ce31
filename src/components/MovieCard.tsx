import { Trash2, Check, Heart, Film } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Movie {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  status: "watched" | "watchlist";
  rating_score: number | null;
  rating_max: number | null;
  notes: string | null;
  is_favorite: boolean;
  created_at: string;
  watched_at: string | null;
  imdb_id: string | null;
  release_year: number | null;
  runtime: number | null;
  overview: string | null;
  director: string | null;
  actors: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  imdb_rating: number | null;
  genres: string[] | null;
}

interface Props {
  movie: Movie;
  onChanged: () => void;
  /** Viewing someone else's movie (or as a guest): hide owner-only actions. */
  readOnly?: boolean;
  /** Called when a guest/non-owner tries an action that needs an account. */
  onRequireAuth?: () => void;
}

export function MovieCard({ movie, onChanged, readOnly = false, onRequireAuth }: Props) {

  async function remove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${movie.title}"?`)) return;
    const { error } = await supabase.from("movies").delete().eq("id", movie.id);
    if (error) return toast.error(error.message);
    toast.success("Removed.");
    onChanged();
  }

  async function markWatched(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const { error } = await supabase
      .from("movies")
      .update({ status: "watched" })
      .eq("id", movie.id);
    if (error) return toast.error(error.message);
    toast.success("Moved to watched.");
    onChanged();
  }

  async function toggleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) return onRequireAuth?.();
    const { error } = await supabase
      .from("movies")
      .update({ is_favorite: !movie.is_favorite })
      .eq("id", movie.id);
    if (error) return toast.error(error.message);
    onChanged();
  }


  const genres = movie.genres && movie.genres.length ? movie.genres : [movie.genre];

  return (
    <Link
      to="/movie/$id"
      params={{ id: movie.imdb_id ?? movie.id }}
      className="group relative block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
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

        <button
          onClick={toggleFavorite}
          aria-label={movie.is_favorite ? "Remove from favorites" : "Add to favorites"}
          className="absolute top-1.5 right-1.5 rounded-full bg-background/70 p-1.5 text-muted-foreground backdrop-blur transition-colors hover:text-primary"
        >
          <Heart className={`h-4 w-4 ${movie.is_favorite ? "fill-primary text-primary" : ""}`} />
        </button>

        {movie.status === "watched" && movie.rating_score != null && (
          <div className="absolute bottom-1.5 left-1.5 rounded-md bg-background/80 px-1.5 py-0.5 font-display text-sm leading-none text-primary backdrop-blur">
            {movie.rating_score}
            <span className="text-muted-foreground text-xs">/{movie.rating_max}</span>
          </div>
        )}
      </div>

      <div className="p-3 pb-1">
        <h3 className="font-display text-[19px] leading-tight text-foreground line-clamp-2">
          {movie.title}
          {movie.release_year && (
            <span className="text-muted-foreground font-sans text-[18px] ml-1">({movie.release_year})</span>
          )}
        </h3>
        <div className="mt-2 flex flex-wrap gap-1">
          {genres.slice(0, 3).map((g) => (
            <Badge key={g} variant="secondary" className="font-normal text-[15px] px-1 py-0">{g}</Badge>
          ))}
        </div>

        {!readOnly && (
          <div className="mt-0.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {movie.status === "watchlist" && (
              <Button size="sm" variant="secondary" className="h-6 px-2 text-xs" onClick={markWatched}>
                <Check className="h-3 w-3" /> Watched
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 ml-auto text-muted-foreground hover:text-destructive" onClick={remove}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </Link>
  );
}
