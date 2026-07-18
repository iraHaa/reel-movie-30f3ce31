import { useEffect, useState } from "react";
import { ListPlus, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { MovieList } from "@/lib/lists";
import { Link } from "@tanstack/react-router";

interface Props {
  movieId: string;
  userId: string;
}

export function AddToListMenu({ movieId, userId }: Props) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<MovieList[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: ls }, { data: items }] = await Promise.all([
      supabase.from("lists").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
      supabase.from("list_items").select("list_id").eq("movie_id", movieId),
    ]);
    setLists((ls ?? []) as MovieList[]);
    setMemberOf(new Set((items ?? []).map((i) => i.list_id as string)));
    setLoading(false);
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function toggle(list: MovieList) {
    if (memberOf.has(list.id)) {
      const { error } = await supabase.from("list_items").delete()
        .eq("list_id", list.id).eq("movie_id", movieId);
      if (error) return toast.error(error.message);
      const next = new Set(memberOf); next.delete(list.id); setMemberOf(next);
      toast.success(`Removed from ${list.title}`);
    } else {
      const { count } = await supabase.from("list_items")
        .select("*", { count: "exact", head: true }).eq("list_id", list.id);
      const { error } = await supabase.from("list_items").insert({
        list_id: list.id, movie_id: movieId, position: count ?? 0,
      });
      if (error) return toast.error(error.message);
      const next = new Set(memberOf); next.add(list.id); setMemberOf(next);
      toast.success(`Added to ${list.title}`);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" aria-label="Add to list">
          <ListPlus className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Add to list</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading && <DropdownMenuItem disabled>Loading…</DropdownMenuItem>}
        {!loading && lists.length === 0 && (
          <DropdownMenuItem asChild>
            <Link to="/lists"><Plus className="h-4 w-4 mr-2" /> Create your first list</Link>
          </DropdownMenuItem>
        )}
        {lists.map((l) => {
          const inList = memberOf.has(l.id);
          return (
            <DropdownMenuItem key={l.id} onSelect={(e) => { e.preventDefault(); toggle(l); }}>
              <span className="mr-2">{l.emoji ?? "🎬"}</span>
              <span className="flex-1 truncate">{l.title}</span>
              {inList && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/lists"><Plus className="h-4 w-4 mr-2" /> Manage lists</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
