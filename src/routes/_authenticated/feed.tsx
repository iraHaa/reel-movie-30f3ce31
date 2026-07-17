import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Star, Heart, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({ meta: [{ title: "Feed – Reel Movie" }, { name: "robots", content: "noindex" }] }),
  component: FeedPage,
});

interface ProfileLite {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_public: boolean;
}

interface FeedMovie {
  id: string;
  title: string;
  genre: string;
  status: string;
  rating_score: number | null;
  rating_max: number | null;
  notes: string | null;
  is_favorite: boolean;
  watched_at: string | null;
  created_at: string;
  user_id: string;
}

function FeedPage() {
  const { user } = Route.useRouteContext();
  const [following, setFollowing] = useState<ProfileLite[]>([]);
  const [feedItems, setFeedItems] = useState<FeedMovie[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileLite>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileLite[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: fRows } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
      const ids = (fRows ?? []).map((r) => r.following_id);
      if (ids.length === 0) { setLoading(false); return; }

      const { data: profs } = await supabase.from("profiles").select("id, username, display_name, avatar_url, is_public").in("id", ids);
      const list = (profs ?? []) as ProfileLite[];
      setFollowing(list);
      const map: Record<string, ProfileLite> = {};
      list.forEach((p) => { map[p.id] = p; });
      setProfileMap(map);

      // Signed avatar urls
      const urls: Record<string, string> = {};
      await Promise.all(list.filter((p) => p.avatar_url).map(async (p) => {
        const { data } = await supabase.storage.from("avatars").createSignedUrl(p.avatar_url!, 60 * 60);
        if (data?.signedUrl) urls[p.id] = data.signedUrl;
      }));
      setAvatarUrls(urls);

      const publicIds = list.filter((p) => p.is_public).map((p) => p.id);
      if (publicIds.length > 0) {
        const { data: mv } = await supabase
          .from("movies")
          .select("*")
          .in("user_id", publicIds)
          .order("created_at", { ascending: false })
          .limit(50);
        setFeedItems((mv ?? []) as FeedMovie[]);
      }
      setLoading(false);
    })();
  }, [user.id]);

  // People search
  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_public")
        .eq("is_public", true)
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .neq("id", user.id)
        .limit(10);
      setSearchResults((data ?? []) as ProfileLite[]);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [search, user.id]);

  const grouped = useMemo(() => feedItems, [feedItems]);

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />
      <AppHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10">
        <h1 className="font-display text-3xl sm:text-4xl mb-6">Feed</h1>

        <section className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Find people by username or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {search.trim() && (
            <div className="mt-3 border border-border rounded-lg bg-card divide-y divide-border">
              {searching && <p className="p-3 text-sm text-muted-foreground">Searching…</p>}
              {!searching && searchResults.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground italic">No public profiles found.</p>
              )}
              {searchResults.map((p) => (
                <Link key={p.id} to="/u/$username" params={{ username: p.username }} className="flex items-center gap-3 p-3 hover:bg-secondary/50 transition-colors">
                  <Avatar profile={p} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.display_name || p.username}</p>
                    <p className="text-xs text-muted-foreground">@{p.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <Tabs defaultValue="activity">
          <TabsList className="grid grid-cols-2 w-full sm:w-auto">
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="following">Following ({following.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="mt-6">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : following.length === 0 ? (
              <EmptyState msg="You aren't following anyone yet. Search for people above to get started." />
            ) : grouped.length === 0 ? (
              <EmptyState msg="No recent activity from the people you follow." />
            ) : (
              <ul className="space-y-4">
                {grouped.map((item) => {
                  const author = profileMap[item.user_id];
                  if (!author) return null;
                  return (
                    <li key={item.id} className="border border-border rounded-lg bg-card p-4">
                      <div className="flex items-start gap-3">
                        <AvatarImg profile={author} url={avatarUrls[author.id]} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <Link to="/u/$username" params={{ username: author.username }} className="font-medium hover:text-primary">
                              {author.display_name || author.username}
                            </Link>{" "}
                            <span className="text-muted-foreground">
                              {item.status === "watched" ? "watched" : "added to watchlist"}
                            </span>{" "}
                            <span className="font-display">{item.title}</span>
                            {item.is_favorite && <Heart className="inline h-3.5 w-3.5 ml-1 text-primary fill-primary" />}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Badge variant="secondary" className="font-normal">{item.genre}</Badge>
                            {item.rating_score != null && (
                              <span className="text-sm text-primary font-display inline-flex items-center gap-1">
                                <Star className="h-3.5 w-3.5 fill-primary" />
                                {item.rating_score}/{item.rating_max}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
                              {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                          </div>
                          {item.notes && <p className="mt-2 text-xs text-muted-foreground italic line-clamp-2">"{item.notes}"</p>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="following" className="mt-6">
            {following.length === 0 ? (
              <EmptyState msg="You aren't following anyone yet." />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {following.map((p) => (
                  <li key={p.id}>
                    <Link to="/u/$username" params={{ username: p.username }} className="flex items-center gap-3 border border-border rounded-lg bg-card p-3 hover:bg-secondary/50 transition-colors">
                      <AvatarImg profile={p} url={avatarUrls[p.id]} />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.display_name || p.username}</p>
                        <p className="text-xs text-muted-foreground">@{p.username}{!p.is_public && " · private"}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Avatar({ profile }: { profile: ProfileLite }) {
  const initial = (profile.display_name || profile.username || "?").charAt(0).toUpperCase();
  return (
    <div className="h-10 w-10 shrink-0 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-display">
      {initial}
    </div>
  );
}

function AvatarImg({ profile, url }: { profile: ProfileLite; url?: string }) {
  if (url) return <img src={url} alt={`${profile.username} profile`} className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  return <Avatar profile={profile} />;
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="text-center border border-dashed border-border rounded-lg p-8">
      <Users className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}
