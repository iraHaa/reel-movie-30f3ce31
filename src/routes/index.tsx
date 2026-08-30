import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Clapperboard, Film, HelpCircle, Star, Tv, Workflow } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const SITE_URL = "https://reel-movie.lovable.app";
const PAGE_TITLE = "Reel Movie – Free Movie & TV Show Tracker";
const PAGE_DESCRIPTION =
  "Track movies you've watched, create your watchlist, discover new movies and TV shows, rate your favorites, and organize your collection with Reel Movie.";
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
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],

  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);



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
            <Button asChild variant="ghost"><Link to="/discover">Discover</Link></Button>
            <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
            <Button asChild><Link to="/auth">Get started</Link></Button>
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-5xl px-6 py-20">
        <div className="text-center">
          <h1 className="font-display text-4xl sm:text-5xl md:text-7xl tracking-tight">
            Track <span className="italic text-primary">Movies &amp; TV Shows</span> for Free
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Track movies and TV shows you've watched, rate your favorites, and organize your
            personal watchlist. Keep it private or share your profile with friends.
          </p>
          <div className="mt-10 flex flex-wrap gap-3 justify-center">
            <Button asChild size="lg"><Link to="/auth">Create free account</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/auth">Sign in</Link></Button>
          </div>
        </div>

        <section aria-labelledby="why" className="mt-24">
          <div className="flex items-center justify-center gap-3">
            <Star className="h-5 w-5 sm:h-6 sm:w-6 text-primary/80" aria-hidden="true" />
            <h2 id="why" className="font-display text-3xl sm:text-4xl text-center">Why Choose Reel Movie?</h2>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3 text-left">
            <Card title="Everything in one place" body="One movie tracking website for films and series — no spreadsheets, no scattered notes." />
            <Card title="No payments, no limits" body="Reel Movie is a free movie tracker app with no limits on your collection." />
            <Card title="Ratings that fit you" body="Add your own rating in */* format — 8.5/10 or 4/5, whatever you prefer." />
            <Card title="Movies and TV shows" body="A true movie and TV show tracker: log films, mini-series and long-running shows alike." />
            <Card title="Private or public" body="Keep your collection private, or open a public profile so friends can follow what you watch." />
            <Card title="Insightful stats" body="See your favorite genres, monthly activity and average ratings from your movies tracking history." />
          </div>
        </section>

        <section aria-labelledby="features" className="mt-24">
          <div className="flex items-center justify-center gap-3">
            <Clapperboard className="h-5 w-5 sm:h-6 sm:w-6 text-primary/80" aria-hidden="true" />
            <h2 id="features" className="font-display text-3xl sm:text-4xl text-center">Features</h2>
          </div>
          <div className="mt-10 grid gap-8 md:grid-cols-2 text-left">
            <Feature title="Watched list and watchlist" body="Two tabs, one home. Log what you've seen and queue what's next in your movies tracker." />
            <Feature title="Genre filters and search" body="Filter by genre, search your library instantly and sort by date, title or rating." />
            <Feature title="TV series tracker" body="Follow shows season after season with the same tools you use for movies." />
            <Feature title="Personal ratings" body="Rate every title in */* format and compare your scores with IMDb ratings." />
            <Feature title="Stats and calendar" body="Charts of your viewing activity plus a calendar to browse watch history by month and year." />
            <Feature title="Social discovery" body="Browse public profiles, follow other movie lovers and see what they're watching." />
          </div>
        </section>

        <section aria-labelledby="netflix" className="mt-24 max-w-3xl mx-auto text-left">
          <div className="flex items-start gap-3">
            <Tv className="h-5 w-5 sm:h-6 sm:w-6 text-primary/80 mt-1" aria-hidden="true" />
            <h2 id="netflix" className="font-display text-3xl sm:text-4xl">
              Track Movies You Watch on Netflix and Other Platforms
            </h2>
          </div>
          <p className="mt-6 text-muted-foreground leading-relaxed">
            Watching movies and TV shows across Netflix, Prime Video, Disney+, or other
            platforms? Keep your entire viewing history in one place. Track what you've
            watched, build your watchlist, and rate your favorites with Reel Movie.
          </p>
        </section>

        <section aria-labelledby="how" className="mt-24">
          <div className="flex items-center justify-center gap-3">
            <Workflow className="h-5 w-5 sm:h-6 sm:w-6 text-primary/80" aria-hidden="true" />
            <h2 id="how" className="font-display text-3xl sm:text-4xl text-center">How It Works</h2>
          </div>
          <ol className="mt-10 grid gap-6 md:grid-cols-4 text-left">
            <Step n={1} title="Create an account" body="Sign up with your email and confirm your address — no payment details needed." />
            <Step n={2} title="Search a title" body="Find any movie or TV series and add it to your collection with one click." />
            <Step n={3} title="Track your viewing" body="Mark titles as Watched or add them to your Watchlist. Drop a quick rating and personal note as you go." />
            <Step n={4} title="Share and connect" body="Share your movie collection with friends and explore profiles of other fans." />
          </ol>
        </section>

        <section aria-labelledby="faq" className="mt-24 max-w-3xl mx-auto">
          <div className="flex items-center justify-center gap-3">
            <HelpCircle className="h-5 w-5 sm:h-6 sm:w-6 text-primary/80" aria-hidden="true" />
            <h2 id="faq" className="font-display text-3xl sm:text-4xl text-center">FAQ</h2>
          </div>
          <div className="mt-10 space-y-6 text-left">
            {FAQ.map((f) => (
              <div key={f.q}>
                <h3 className="font-display text-xl">{f.q}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="cta" className="mt-24 rounded-lg border border-border bg-card p-10 text-center">
          <div className="flex items-center justify-center gap-3">
            <Film className="h-5 w-5 sm:h-6 sm:w-6 text-primary/80" aria-hidden="true" />
            <h2 id="cta" className="font-display text-3xl sm:text-4xl">
              Ready to organize your movie collection?
            </h2>
          </div>
          <div className="mt-8">
            <Button asChild size="lg"><Link to="/auth">Create free account</Link></Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Reel Movie. Made in Ukraine. Movie data from OMDb API.</p>
        </div>
      </footer>
    </div>
  );
}

const FAQ = [
  {
    q: "Is Reel Movie really free?",
    a: "Yes. Creating an account and using the movies tracker, watchlist, stats and calendar costs nothing.",
  },
  {
    q: "Can I track TV series as well as movies?",
    a: "Absolutely. Reel Movie works as a movie and TV show tracker app, so you can add both series and films to your collection.",
  },
  {
    q: "Can I track movies I watch on Netflix?",
    a: "Yes. You can track movies you watch on Netflix, Prime Video, Disney+ or anywhere else — just add the title to your library.",
  },
  {
    q: "How do ratings work?",
    a: "You add your own rating in */* format, such as 8.5/10 or 4/5, alongside the IMDb score shown on the details page.",
  },
  {
    q: "Is my collection private?",
    a: "Your library is private by default. You can switch your profile to public if you want others to follow your watchlist.",
  },
  {
    q: "How is this different from other online film trackers?",
    a: "Reel Movie combines a convenient movie tracking website with genre filters, personal ratings, stats, and social discovery in one free app.",
  },
  {
    q: "Where does the movie information come from?",
    a: "Posters, genres, cast, runtime, and release years are fetched automatically from OMDb — a public movie and TV series database.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. Reel Movie runs well in both desktop and mobile browsers, so your movie and TV series tracker is always at your fingertips.",
  },
];

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="font-display text-xl">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="rounded-lg border border-border bg-card p-6">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
        {n}
      </span>
      <h3 className="font-display text-lg mt-4">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2">{body}</p>
    </li>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-display text-xl">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2">{body}</p>
    </div>
  );
}

