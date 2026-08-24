import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import type { Movie } from "@/components/MovieCard";

export function PublicMovieCard({ movie }: { movie: Movie }) {
  return (
    <Link
      to="/movie/$id"
      params={{ id: movie.id }}
      className="rounded-lg border border-border bg-card p-4 block hover:border-primary/40 transition-colors"
    >
      <article>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg truncate">{movie.title}</h3>
            <Badge variant="secondary" className="mt-1.5 font-normal">{movie.genre}</Badge>
          </div>
          {movie.rating_score != null && (
            <div className="shrink-0 font-display text-2xl text-primary leading-none">
              {movie.rating_score}<span className="text-muted-foreground text-sm">/{movie.rating_max}</span>
            </div>
          )}
        </div>
        {movie.notes && <p className="mt-2 text-xs text-muted-foreground italic line-clamp-2">"{movie.notes}"</p>}
      </article>
    </Link>
  );
}
