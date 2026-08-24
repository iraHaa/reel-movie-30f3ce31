import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/PublicHeader";
import { PublicMovieCard } from "@/components/PublicMovieCard";
import { publicHead } from "@/lib/site";
import { fetchPublicMoviePage } from "@/lib/public-content";

export const Route = createFileRoute("/movie/$id")({
  loader: async ({ params }) => {
    const data = await fetchPublicMoviePage(params.id);
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData?.movie) {
      return publicHead({
        title: "Movie not found – Reel Movie",
        description: "This movie is not available.",
        path: "/discover",
        noindex: true,
      });
    }
    const { movie, profile } = loaderData;
    const name = profile.display_name || profile.username;
    const description = movie.notes?.trim()
      || `${movie.title} (${movie.genre}) on ${name}'s public Reel Movie profile.`;
    return publicHead({
      title: `${movie.title} – Reel Movie`,
      description,
      path: `/movie/${movie.id}`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Movie",
        name: movie.title,
        genre: movie.genre,
        description,
        url: `https://reel-movie.lovable.app/movie/${movie.id}`,
      },
    });
  },
  component: MoviePage,
  notFoundComponent: MovieNotFound,
});

function MovieNotFound() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-16 text-center">
        <h1 className="font-display text-3xl mb-2">Movie not found</h1>
        <p className="text-sm text-muted-foreground mb-6">This movie doesn't exist or belongs to a private profile.</p>
        <Button asChild variant="outline"><Link to="/discover">Back to Discover</Link></Button>
      </main>
    </div>
  );
}

function MoviePage() {
  const { movie, profile, more } = Route.useLoaderData();
  const ownerName = profile.display_name || profile.username;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/u/$username" params={{ username: profile.username }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> {ownerName}
          </Link>
        </Button>

        <article className="rounded-lg border border-border bg-card p-6 sm:p-8">
          <h1 className="font-display text-3xl sm:text-5xl">{movie.title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <Badge variant="secondary" className="font-normal">{movie.genre}</Badge>
            {movie.status === "watchlist" && (
              <span className="text-xs text-muted-foreground">On watchlist</span>
            )}
            {movie.watched_at && (
              <span className="text-xs text-muted-foreground">
                Watched {new Date(movie.watched_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
              </span>
            )}
          </div>
          {movie.rating_score != null && (
            <p className="font-display text-5xl text-primary mt-6 leading-none">
              {movie.rating_score}<span className="text-muted-foreground text-2xl">/{movie.rating_max}</span>
            </p>
          )}
          {movie.notes && (
            <p className="mt-6 text-muted-foreground italic">"{movie.notes}"</p>
          )}
          <p className="mt-8 text-sm text-muted-foreground">
            Logged by{" "}
            <Link to="/u/$username" params={{ username: profile.username }} className="text-foreground underline hover:text-primary">
              @{profile.username}
            </Link>
            {" "}on{" "}
            <Link to="/discover" className="underline hover:text-primary">Discover</Link>.
          </p>
        </article>

        {more.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-2xl mb-4">More from @{profile.username}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {more.map((m) => <PublicMovieCard key={m.id} movie={m} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
