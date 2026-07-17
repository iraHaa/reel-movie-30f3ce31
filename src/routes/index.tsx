import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

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
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
      else setChecking(false);
    });
  }, [navigate]);

  if (checking) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Film className="h-6 w-6 text-primary" aria-hidden="true" />
            <div>
              <p className="font-display text-2xl leading-none">Reel Movie</p>
              <p className="text-xs text-muted-foreground mt-1 italic">your private movie hub</p>
            </div>
          </div>
          <nav aria-label="Primary" className="flex items-center gap-2">
            <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
            <Button asChild><Link to="/auth">Get started</Link></Button>
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-4xl px-6 py-20 text-center">
        <h1 className="font-display text-4xl sm:text-5xl md:text-7xl tracking-tight">
          Free <span className="italic text-primary">Movie Tracker</span> &amp; Watchlist App
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Track movies you've watched, rate your favorites, and organize your personal
          watchlist of films and TV shows — kept private just for you.
        </p>
        <div className="mt-10 flex flex-wrap gap-3 justify-center">
          <Button asChild size="lg"><Link to="/auth">Create free account</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/auth">Sign in</Link></Button>
        </div>

        <section aria-labelledby="features" className="mt-24 grid gap-6 md:grid-cols-3 text-left">
          <h2 id="features" className="sr-only">Features</h2>
          <Feature title="Watched & watchlist" body="Two tabs, one home. Log what you've seen and queue what's next." />
          <Feature title="Your own rating" body="Rate every film in the format you like — 8.5/10 or 4/5." />
          <Feature title="Private by default" body="Sign in and only you can see or edit your collection." />
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Reel Movie — a free movie tracker &amp; watchlist app.</p>
        </div>
      </footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="font-display text-xl">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2">{body}</p>
    </div>
  );
}
