import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Film } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { MovieList } from "@/lib/lists";
import type { Movie } from "@/components/MovieCard";

export const Route = createFileRoute("/lists/share/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: "Shared list – Reel Movie" },
      { name: "description", content: `A shared movie list on Reel Movie.` },
      { property: "og:title", content: "Shared list on Reel Movie" },
      { property: "og:description", content: "Someone shared their movie list with you." },
    ],
    links: [
      { rel: "canonical", href: `https://reel-movie.lovable.app/lists/share/${params.slug}` },
    ],
  }),
  component: SharedList,
});

function SharedList() {
  const { slug } = Route.useParams();
  const [list, setList] = useState<MovieList | null>(null);
  const [items, setItems] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: l }, { data: m }] = await Promise.all([
        supabase.rpc("get_list_by_share_slug", { _slug: slug }),
        supabase.rpc("get_list_items_by_share_slug", { _slug: slug }),
      ]);
      const row = (l as MovieList[] | null)?.[0] ?? null;
      setList(row);
      setItems((m ?? []) as Movie[]);
      setLoading(false);
    })();
  }, [slug]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-6 py-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <Film className="h-6 w-6 text-primary" aria-hidden="true" />
            <div>
              <p className="font-display text-2xl leading-none">Reel Movie</p>
              <p className="text-xs text-muted-foreground mt-1 italic">your private movie hub</p>
            </div>
          </Link>
          <Link to="/auth" className="text-sm text-primary hover:underline">Sign in</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {loading ? (
          <p className="text-muted-foreground text-sm py-20 text-center">Loading…</p>
        ) : !list ? (
          <div className="border border-dashed border-border rounded-lg py-20 text-center">
            <p className="text-muted-foreground italic">This shared list is not available.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-4 mb-8">
              <div className="text-5xl leading-none">{list.emoji ?? "🎬"}</div>
              <div>
                <h1 className="font-display text-4xl">{list.title}</h1>
                {list.description && <p className="text-muted-foreground mt-2">{list.description}</p>}
                <p className="text-xs text-muted-foreground mt-2">{items.length} {items.length === 1 ? "movie" : "movies"}</p>
              </div>
            </div>
            {items.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-12">Empty list.</p>
            ) : (
              <ul className="space-y-2">
                {items.map(m => (
                  <li key={m.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-lg truncate">{m.title}</h2>
                        <Badge variant="secondary" className="font-normal">{m.genre}</Badge>
                      </div>
                      {m.notes && <p className="text-xs text-muted-foreground italic mt-1 line-clamp-1">"{m.notes}"</p>}
                    </div>
                    {m.rating_score != null && m.rating_max && (
                      <div className="font-display text-primary shrink-0">
                        {m.rating_score}<span className="text-muted-foreground text-sm">/{m.rating_max}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
