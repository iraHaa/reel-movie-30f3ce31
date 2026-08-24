import { createFileRoute, Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { SiteHeader } from "@/components/PublicHeader";
import { publicHead } from "@/lib/site";
import { avatarSrc, fetchPublicProfiles, type PublicProfileCard } from "@/lib/public-content";

export const Route = createFileRoute("/discover")({
  loader: async () => {
    const profiles = await fetchPublicProfiles(100);
    const avatars = await Promise.all(profiles.map((p) => avatarSrc(p.avatar_url)));
    return {
      profiles: profiles.map((p, i) => ({ ...p, avatarSrc: avatars[i] })),
    };
  },
  head: ({ loaderData }) =>
    publicHead({
      title: "Discover public movie profiles – Reel Movie",
      description:
        "Browse public Reel Movie profiles. See what people are watching, their ratings, and their movie collections.",
      path: "/discover",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Discover public movie profiles",
        url: "https://reel-movie.lovable.app/discover",
        mainEntity: {
          "@type": "ItemList",
          itemListElement: (loaderData?.profiles ?? []).slice(0, 50).map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `https://reel-movie.lovable.app/u/${p.username}`,
            name: p.display_name || p.username,
          })),
        },
      },
    }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const { profiles } = Route.useLoaderData();

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10">
        <h1 className="font-display text-3xl sm:text-4xl mb-2">Discover</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Public profiles on Reel Movie — what people are watching and rating.
        </p>

        {profiles.length === 0 ? (
          <div className="text-center border border-dashed border-border rounded-lg p-8">
            <Compass className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No public profiles yet.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {profiles.map((p) => (
              <li key={p.id}>
                <ProfileCard profile={p} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function ProfileCard({ profile }: { profile: PublicProfileCard & { avatarSrc: string | null } }) {
  const initial = (profile.display_name || profile.username || "?").charAt(0).toUpperCase();
  return (
    <Link
      to="/u/$username"
      params={{ username: profile.username }}
      className="flex items-start gap-3 border border-border rounded-lg bg-card p-4 hover:bg-secondary/50 transition-colors"
    >
      {profile.avatarSrc ? (
        <img src={profile.avatarSrc} alt={`${profile.username} profile`} className="h-12 w-12 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-display">
          {initial}
        </div>
      )}
      <div className="min-w-0">
        <p className="font-medium truncate">{profile.display_name || profile.username}</p>
        <p className="text-xs text-muted-foreground">@{profile.username}</p>
        {profile.bio && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{profile.bio}</p>}
      </div>
    </Link>
  );
}
