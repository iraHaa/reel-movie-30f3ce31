import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Movie } from "@/components/MovieCard";
import { searchMovies, getMovieMeta, type OmdbSearchResult } from "@/lib/movies.functions";
import { Film, Loader2, Search } from "lucide-react";

interface Props {
  defaultStatus: "watched" | "watchlist";
  userId: string;
  movie?: Movie | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function MovieForm({ defaultStatus, userId, movie, onSaved, onCancel }: Props) {
  const editing = !!movie;
  const search = useServerFn(searchMovies);
  const fetchMeta = useServerFn(getMovieMeta);
  const navigate = useNavigate();

  const [query, setQuery] = useState(movie?.title ?? "");
  const [results, setResults] = useState<OmdbSearchResult[]>([]);
  const [library, setLibrary] = useState<Map<string, string>>(new Map());
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<OmdbSearchResult | null>(
    movie?.imdb_id
      ? {
          imdbID: movie.imdb_id,
          Title: movie.title,
          Year: movie.release_year?.toString() ?? "",
          Poster: movie.poster_url ?? "",
          Type: ((movie as { media_type?: string }).media_type === "series"
            ? "series"
            : "movie") as "movie" | "series",
        }
      : null,
  );

  const [status, setStatus] = useState<"watched" | "watchlist">(movie?.status ?? defaultStatus);
  const [score, setScore] = useState(movie?.rating_score?.toString() ?? "");
  const [max, setMax] = useState(movie?.rating_max?.toString() ?? "10");
  const [watchedAt, setWatchedAt] = useState(
    movie?.watched_at ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(movie?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const isWatched = status === "watched";
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("movies")
        .select("id, imdb_id")
        .eq("user_id", userId)
        .not("imdb_id", "is", null);
      if (cancelled || !data) return;
      const map = new Map<string, string>();
      for (const row of data) {
        if (row.imdb_id) map.set(row.imdb_id, row.id);
      }
      setLibrary(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, userId]);

  useEffect(() => {
    if (editing || selected) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const r = await search({ data: { query: query.trim() } });
        setResults(r);
      } catch (e) {
        console.error(e);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, editing, selected, search]);

  function pickResult(r: OmdbSearchResult) {
    const existingId = library.get(r.imdbID);
    if (existingId) {
      onCancel();
      navigate({ to: "/movie/$id", params: { id: existingId } });
      return;
    }
    setSelected(r);
    setQuery(r.Title);
    setResults([]);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing && !selected) {
      toast.error("Please search and pick a movie.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const payload = {
          status,
          notes: notes.trim() || null,
          rating_score: isWatched && score ? Number(score) : null,
          rating_max: isWatched && score ? Number(max) || 10 : null,
          watched_at: isWatched ? watchedAt || null : null,
        };
        const { error } = await supabase.from("movies").update(payload).eq("id", movie!.id);
        if (error) throw error;
        toast.success("Movie updated.");
      } else {
        // Fetch metadata (cached server-side)
        const meta = await fetchMeta({ data: { imdbId: selected!.imdbID } });
        const payload = {
          user_id: userId,
          title: meta.title,
          genre: meta.genres[0] ?? "Drama",
          genres: meta.genres,
          imdb_id: meta.imdb_id,
          release_year: meta.release_year,
          runtime: meta.runtime,
          overview: meta.overview,
          director: meta.director,
          actors: meta.actors,
          poster_url: meta.poster_url,
          imdb_rating: meta.imdb_rating,
          media_type: meta.media_type,
          status,
          notes: notes.trim() || null,
          rating_score: isWatched && score ? Number(score) : null,
          rating_max: isWatched && score ? Number(max) || 10 : null,
          watched_at: isWatched ? watchedAt || null : null,
        };
        const { error } = await supabase.from("movies").insert(payload);
        if (error) throw error;
        toast.success(isWatched ? "Added to your journal." : "Added to your watchlist.");
      }
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {!editing && !selected && (
        <div className="space-y-2">
          <Label htmlFor="q">Search a movie or TV series</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. In the Mood for Love"
              autoFocus
              className="pl-8"
            />
            {searching && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {results.length > 0 && (
            <ul className="max-h-72 overflow-y-auto rounded-md border border-border bg-popover divide-y divide-border">
              {[...results]
                .sort((a, b) => {
                  const ai = library.has(a.imdbID) ? 0 : 1;
                  const bi = library.has(b.imdbID) ? 0 : 1;
                  return ai - bi;
                })
                .map((r) => {
                  const inLib = library.has(r.imdbID);
                  return (
                    <li key={r.imdbID}>
                      <button
                        type="button"
                        onClick={() => pickResult(r)}
                        className="flex w-full items-center gap-3 p-2 text-left hover:bg-secondary/60"
                      >
                        <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-secondary flex items-center justify-center">
                          {r.Poster ? (
                            <img src={r.Poster} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Film className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{r.Title}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.Year}
                            <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                              {r.Type === "series" ? "Series" : "Movie"}
                            </span>
                          </p>
                          {inLib && (
                            <p className="mt-0.5 text-[11px] font-medium text-primary">
                              Already in your library — edit
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      )}

      {(editing || selected) && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-secondary/30 p-3">
          <div className="h-20 w-14 shrink-0 overflow-hidden rounded bg-secondary flex items-center justify-center">
            {selected?.Poster || movie?.poster_url ? (
              <img
                src={selected?.Poster || movie?.poster_url || ""}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <Film className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg">
              {selected?.Title ?? movie?.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {selected?.Year ?? movie?.release_year}
              {selected?.Type && (
                <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  {selected.Type === "series" ? "Series" : "Movie"}
                </span>
              )}
            </p>
          </div>
          {!editing && (
            <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
              Change
            </Button>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as "watched" | "watchlist")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="watched">Watched</SelectItem>
            <SelectItem value="watchlist">Watchlist</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isWatched && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Your rating</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                min="0"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="8.5"
                className="w-20"
              />
              <span className="text-muted-foreground font-display text-xl">/</span>
              <Input
                type="number"
                step="1"
                min="1"
                value={max}
                onChange={(e) => setMax(e.target.value)}
                className="w-20"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="watched_at">Watched on</Label>
            <Input
              id="watched_at"
              type="date"
              value={watchedAt}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setWatchedAt(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="A line you loved, the night you saw it…"
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving || (!editing && !selected)}>
          {saving ? "Saving…" : editing ? "Save changes" : "Save"}
        </Button>
      </div>
    </form>
  );
}
