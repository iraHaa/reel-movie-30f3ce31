import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Users, UserPlus, UserMinus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { AuthGateDialog } from "@/components/AuthGateDialog";
import { useAuth } from "@/hooks/useAuth";
import { setPendingAction, takePendingAction } from "@/lib/auth-gate";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const TITLE = "Discover Movie Lovers – Reel Movie";
const DESC =
  "Browse public Reel Movie profiles, see what people are watching and rating, and follow movie lovers with taste like yours.";

export const Route = createFileRoute("/discover")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DiscoverPage,
});

interface ProfileLite {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_public: boolean;
  show_followers: boolean;
  show_following: boolean;
}

interface Stats {
  followers: number;
  following: number;
  watched: number;
}

function DiscoverPage() {
  const { user } = useAuth();
  const [people, setPeople] = useState<ProfileLite[]>([]);
  const [followingList, setFollowingList] = useState<ProfileLite[]>([]);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, is_public, show_followers, show_following")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(200);

      const list = ((profs ?? []) as ProfileLite[]).filter((p) => p.is_public && p.id !== user?.id);
      setPeople(list);

      const ids = list.map((p) => p.id);

      const [{ data: myFollows }, { data: followRows }, { data: watchedRows }] = await Promise.all([
        user
          ? supabase.from("follows").select("following_id").eq("follower_id", user.id)
          : Promise.resolve({ data: [] as { following_id: string }[] }),
        ids.length
          ? supabase.from("follows").select("follower_id, following_id")
          : Promise.resolve({ data: [] as { follower_id: string; following_id: string }[] }),
        ids.length
          ? supabase.from("movies").select("user_id").in("user_id", ids).eq("status", "watched")
          : Promise.resolve({ data: [] as { user_id: string }[] }),
      ]);

      const mine = new Set((myFollows ?? []).map((r) => r.following_id));
      setFollowingIds(mine);

      const s: Record<string, Stats> = {};
      ids.forEach((id) => { s[id] = { followers: 0, following: 0, watched: 0 }; });
      (followRows ?? []).forEach((r) => {
        if (s[r.following_id]) s[r.following_id].followers += 1;
        if (s[r.follower_id]) s[r.follower_id].following += 1;
      });
      (watchedRows ?? []).forEach((r) => { if (s[r.user_id]) s[r.user_id].watched += 1; });
      setStats(s);

      const urls: Record<string, string> = {};
      await Promise.all(
        list.filter((p) => p.avatar_url).map(async (p) => {
          const { data } = await supabase.storage.from("avatars").createSignedUrl(p.avatar_url!, 60 * 60);
          if (data?.signedUrl) urls[p.id] = data.signedUrl;
        }),
      );
      setAvatarUrls(urls);

      const followedIds = [...mine];
      if (followedIds.length) {
        const { data: fp } = await supabase
          .from("profiles")
          .select("id, username, display_name, bio, avatar_url, is_public, show_followers, show_following")
          .in("id", followedIds);
        setFollowingList((fp ?? []) as ProfileLite[]);
      } else {
        setFollowingList([]);
      }

      setLoading(false);
    })().catch(() => setLoading(false));
  }, [user?.id]);

  const doFollow = useCallback(
    async (profileId: string, username: string, isFollowing: boolean) => {
      if (!user) return;
      setBusy(profileId);
      const { error } = isFollowing
        ? await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profileId)
        : await supabase.from("follows").insert({ follower_id: user.id, following_id: profileId });
      setBusy(null);
      if (error) return toast.error(error.message);

      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.delete(profileId); else next.add(profileId);
        return next;
      });
      setStats((prev) => ({
        ...prev,
        [profileId]: prev[profileId]
          ? { ...prev[profileId], followers: Math.max(0, prev[profileId].followers + (isFollowing ? -1 : 1)) }
          : prev[profileId],
      }));
      setFollowingList((prev) => {
        if (isFollowing) return prev.filter((x) => x.id !== profileId);
        const p = people.find((x) => x.id === profileId);
        return p ? [...prev, p] : prev;
      });
      if (!isFollowing) toast.success(`Following @${username}`);
    },
    [user, people],
  );

  // Resume a follow that was attempted before signing in.
  useEffect(() => {
    if (!user || loading) return;
    const pending = takePendingAction();
    if (pending?.type === "follow" && !followingIds.has(pending.profileId)) {
      doFollow(pending.profileId, pending.username ?? "user", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  function onToggle(p: ProfileLite) {
    if (!user) {
      setPendingAction({ type: "follow", profileId: p.id, username: p.username });
      setGateOpen(true);
      return;
    }
    doFollow(p.id, p.username, followingIds.has(p.id));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) => p.username.toLowerCase().includes(q) || (p.display_name ?? "").toLowerCase().includes(q),
    );
  }, [people, search]);

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />
      <AppHeader user={user} />
      <AuthGateDialog open={gateOpen} onOpenChange={setGateOpen} />
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-10">
        <h1 className="font-display text-3xl sm:text-4xl mb-2">Discover</h1>
        <p className="text-sm text-muted-foreground mb-6">Browse people with public profiles and follow their taste in movies.</p>

        <Tabs defaultValue="discover">
          <TabsList className="grid grid-cols-2 w-full sm:w-auto">
            <TabsTrigger value="discover">Discover</TabsTrigger>
            <TabsTrigger value="following">Following ({followingIds.size})</TabsTrigger>
          </TabsList>

          <TabsContent value="discover" className="mt-6">
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search people by username or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <EmptyState msg="No public profiles found." />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <UserCard
                      profile={p}
                      avatar={avatarUrls[p.id]}
                      stats={stats[p.id]}
                      isFollowing={followingIds.has(p.id)}
                      busy={busy === p.id}
                      onToggle={() => onToggle(p)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="following" className="mt-6">
            {!user ? (
              <EmptyState msg="Sign in to keep track of the people you follow." />
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : followingList.length === 0 ? (
              <EmptyState msg="You aren't following anyone yet. Discover people above to get started." />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {followingList.map((p) => (
                  <li key={p.id}>
                    <UserCard
                      profile={p}
                      avatar={avatarUrls[p.id]}
                      stats={stats[p.id]}
                      isFollowing={followingIds.has(p.id)}
                      busy={busy === p.id}
                      onToggle={() => onToggle(p)}
                    />
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

function UserCard({
  profile,
  avatar,
  stats,
  isFollowing,
  busy,
  onToggle,
}: {
  profile: ProfileLite;
  avatar?: string;
  stats?: Stats;
  isFollowing: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const s = stats ?? { followers: 0, following: 0, watched: 0 };
  return (
    <article className="h-full flex flex-col border border-border rounded-xl bg-card p-4">
      <div className="flex items-center gap-3">
        <AvatarImg profile={profile} url={avatar} />
        <div className="min-w-0">
          <p className="font-medium truncate">{profile.display_name || profile.username}</p>
          <p className="text-xs text-muted-foreground truncate">
            @{profile.username}
            {!profile.is_public && " · private"}
          </p>
        </div>
      </div>

      {profile.bio && <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{profile.bio}</p>}

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {profile.show_followers !== false && <Stat label="Followers" value={s.followers} />}
        {profile.show_following !== false && <Stat label="Following" value={s.following} />}
        <Stat label="Watched" value={s.watched} />
      </dl>

      <div className="mt-4 flex gap-2 pt-1">
        <Button size="sm" variant={isFollowing ? "secondary" : "default"} className="flex-1" disabled={busy} onClick={onToggle}>
          {isFollowing ? <UserMinus className="h-4 w-4 mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
          {isFollowing ? "Following" : "Follow"}
        </Button>
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link to="/u/$username" params={{ username: profile.username }}>View profile</Link>
        </Button>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary/40 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-display text-lg leading-tight">{value}</dd>
    </div>
  );
}

function AvatarImg({ profile, url }: { profile: ProfileLite; url?: string }) {
  if (url) return <img src={url} alt={`${profile.username} profile`} className="h-12 w-12 shrink-0 rounded-full object-cover" />;
  const initial = (profile.display_name || profile.username || "?").charAt(0).toUpperCase();
  return (
    <div className="h-12 w-12 shrink-0 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-display">
      {initial}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="text-center border border-dashed border-border rounded-lg p-8">
      <Users className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}
