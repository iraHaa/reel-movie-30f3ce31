import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Movie } from "@/components/MovieCard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Viewing calendar – Reel Movie" }, { name: "robots", content: "noindex" }] }),
  component: CalendarPage,
});

function keyOf(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function CalendarPage() {
  const { user } = Route.useRouteContext();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<Date>(new Date());
  const [selected, setSelected] = useState<Date | undefined>(new Date());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("movies")
        .select("*")
        .eq("status", "watched");
      if (data) setMovies(data as Movie[]);
      setLoading(false);
    })();
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, Movie[]>();
    movies.forEach((mv) => {
      const d = mv.watched_at ?? mv.created_at;
      if (!d) return;
      const k = keyOf(d);
      m.set(k, [...(m.get(k) ?? []), mv]);
    });
    return m;
  }, [movies]);

  const watchedDates = useMemo(
    () => Array.from(byDay.keys()).map((k) => new Date(k + "T00:00:00")),
    [byDay],
  );

  const monthMovies = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    return movies
      .filter((mv) => {
        const d = new Date(mv.watched_at ?? mv.created_at);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .sort((a, b) =>
        (b.watched_at ?? b.created_at).localeCompare(a.watched_at ?? a.created_at),
      );
  }, [movies, month]);

  const selectedMovies = selected ? (byDay.get(keyOf(selected)) ?? []) : [];

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />
      <AppHeader user={user} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="font-display text-4xl mb-2">Viewing calendar</h1>
        <p className="text-muted-foreground mb-8">
          Browse the movies you've watched by day, month, and year.
        </p>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardContent className="p-4 sm:p-6 flex justify-center">
                <Calendar
                  mode="single"
                  selected={selected}
                  onSelect={setSelected}
                  month={month}
                  onMonthChange={setMonth}
                  modifiers={{ watched: watchedDates }}
                  modifiersClassNames={{
                    watched:
                      "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary",
                  }}
                  className={cn("p-0 pointer-events-auto")}
                />
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-xl">
                    {selected
                      ? selected.toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Pick a day"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedMovies.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      No movies watched on this day.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {selectedMovies.map((mv) => (
                        <li key={mv.id} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-display text-lg leading-tight truncate">{mv.title}</p>
                            <Badge variant="secondary" className="mt-1 font-normal">{mv.genre}</Badge>
                          </div>
                          {mv.rating_score != null && (
                            <span className="font-display text-primary text-lg shrink-0">
                              {mv.rating_score}
                              <span className="text-muted-foreground text-sm">/{mv.rating_max}</span>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-xl">
                    {month.toLocaleString(undefined, { month: "long", year: "numeric" })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    {monthMovies.length} movie{monthMovies.length === 1 ? "" : "s"} watched
                  </p>
                  {monthMovies.length > 0 && (
                    <ul className="space-y-2 max-h-72 overflow-auto pr-1">
                      {monthMovies.map((mv) => {
                        const d = new Date(mv.watched_at ?? mv.created_at);
                        return (
                          <li key={mv.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate">{mv.title}</span>
                            <span className="text-muted-foreground shrink-0">
                              {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
