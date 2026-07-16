import { Trash2, Check, Pencil, Heart } from "lucide-react";
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
}

interface Props {
  movie: Movie;
  onChanged: () => void;
  onEdit: (movie: Movie) => void;
}

export function MovieCard({ movie, onChanged, onEdit }: Props) {
  async function remove() {
    if (!confirm(`Delete "${movie.title}"?`)) return;
    const { error } = await supabase.from("movies").delete().eq("id", movie.id);
    if (error) return toast.error(error.message);
    toast.success("Removed.");
    onChanged();
  }

  async function markWatched() {
    const { error } = await supabase
      .from("movies")
      .update({ status: "watched" })
      .eq("id", movie.id);
    if (error) return toast.error(error.message);
    toast.success("Moved to watched.");
    onChanged();
  }

  async function toggleFavorite() {
    const { error } = await supabase
      .from("movies")
      .update({ is_favorite: !movie.is_favorite })
      .eq("id", movie.id);
    if (error) return toast.error(error.message);
    onChanged();
  }

  return (
    <article className="group relative rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <button
        onClick={toggleFavorite}
        aria-label={movie.is_favorite ? "Remove from favorites" : "Add to favorites"}
        className="absolute top-3 right-3 text-muted-foreground hover:text-primary transition-colors"
      >
        <Heart className={`h-4 w-4 ${movie.is_favorite ? "fill-primary text-primary" : ""}`} />
      </button>

      <div className="flex items-start justify-between gap-3 pr-6">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl text-foreground leading-tight truncate">
            {movie.title}
          </h3>
          <Badge variant="secondary" className="mt-2 font-normal">{movie.genre}</Badge>
        </div>
        {movie.status === "watched" && movie.rating_score != null && (
          <div className="shrink-0 text-right">
            <div className="font-display text-3xl text-primary leading-none">
              {movie.rating_score}
              <span className="text-muted-foreground text-lg">/{movie.rating_max}</span>
            </div>
          </div>
        )}
      </div>

      {movie.notes && (
        <p className="mt-3 text-sm text-muted-foreground italic line-clamp-3">
          "{movie.notes}"
        </p>
      )}

      <div className="mt-4 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {movie.status === "watchlist" && (
          <Button size="sm" variant="secondary" onClick={markWatched}>
            <Check className="h-3.5 w-3.5" /> Mark watched
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onEdit(movie)} className="ml-auto text-muted-foreground hover:text-foreground">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={remove} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </article>
  );
}
