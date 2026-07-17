import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import type { Movie } from "@/components/MovieCard";

export const Route = createFileRoute("/_authenticated/stats")({
  head: () => ({ meta: [{ title: "Statistics – Reel Movie" }, { name: "robots", content: "noindex" }] }),
  component: StatsPage,
});

const CHART_COLORS = [
  "hsl(var(--primary))",
  "#7dd3a0",
  "#5eb887",
  "#3fa06e",
  "#2d8a5a",
  "#a3e0be",
  "#c4ecd4",
  "#8fbf9f",
];

function StatsPage() {
  const { user } = Route.useRouteContext();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("movies").select("*").eq("user_id", user.id);
      if (data) setMovies(data as Movie[]);
      setLoading(false);
    })();
  }, [user.id]);

  const stats = useMemo(() => {
    const watched = movies.filter((m) => m.status === "watched");
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    const dateOf = (mv: Movie) => new Date(mv.watched_at ?? mv.created_at);

    const thisYear = watched.filter((mv) => dateOf(mv).getFullYear() === y);
    const thisMonth = thisYear.filter((mv) => dateOf(mv).getMonth() === m);

    const ratios = watched
      .filter((mv) => mv.rating_score != null && mv.rating_max)
      .map((mv) => (mv.rating_score! / mv.rating_max!) * 10);
    const avgRating = ratios.length
      ? ratios.reduce((a, b) => a + b, 0) / ratios.length
      : null;

    const genreCount = new Map<string, number>();
    watched.forEach((mv) => genreCount.set(mv.genre, (genreCount.get(mv.genre) ?? 0) + 1));
    const genres = Array.from(genreCount.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Last 12 months activity
    const monthly: { label: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(y, m - i, 1);
      const label = d.toLocaleString(undefined, { month: "short" });
      const count = watched.filter((mv) => {
        const wd = dateOf(mv);
        return wd.getFullYear() === d.getFullYear() && wd.getMonth() === d.getMonth();
      }).length;
      monthly.push({ label, count });
    }

    return {
      totalWatched: watched.length,
      thisYearCount: thisYear.length,
      thisMonthCount: thisMonth.length,
      avgRating,
      genres,
      monthly,
      favoritesCount: movies.filter((mv) => mv.is_favorite).length,
    };
  }, [movies]);

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />
      <AppHeader user={user} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="font-display text-4xl mb-8">Your viewing statistics</h1>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : stats.totalWatched === 0 ? (
          <div className="border border-dashed border-border rounded-lg py-20 text-center">
            <p className="text-muted-foreground italic">
              Log some watched movies to see your stats appear here.
            </p>
          </div>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
              <StatCard label="Total watched" value={stats.totalWatched} />
              <StatCard label="This year" value={stats.thisYearCount} />
              <StatCard label="This month" value={stats.thisMonthCount} />
              <StatCard
                label="Average rating"
                value={stats.avgRating != null ? `${stats.avgRating.toFixed(1)}/10` : "—"}
                hint={stats.avgRating != null ? `${stats.favoritesCount} favorites` : undefined}
              />
            </section>

            <div className="grid gap-6 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle className="font-display text-2xl">Activity, last 12 months</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.monthly}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                        <Tooltip
                          cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                          contentStyle={{
                            background: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="font-display text-2xl">Favorite genres</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.genres.slice(0, 8)}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {stats.genres.slice(0, 8).map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {stats.genres.slice(0, 5).map((g, i) => (
                      <li key={g.name} className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                          {g.name}
                        </span>
                        <span className="text-muted-foreground">{g.value}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-display text-4xl text-primary mt-2">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
