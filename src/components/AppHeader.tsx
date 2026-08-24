import { Link, useNavigate } from "@tanstack/react-router";
import { BarChart3, CalendarDays, Film, LogOut, User as UserIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

interface Props {
  user: User | null;
  action?: React.ReactNode;
}

export function AppHeader({ user, action }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initial = (user?.user_metadata?.display_name || user?.email || "?")
    .charAt(0)
    .toUpperCase();

  return (
    <header className="border-b border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
        <Link to={user ? "/dashboard" : "/"} className="flex items-center gap-3">
          <Film className="h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <p className="font-display text-2xl leading-none">Reel Movie</p>
            <p className="text-xs text-muted-foreground mt-1 italic">your private movie hub</p>
          </div>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/discover"><Users className="h-4 w-4" /> Discover</Link>
          </Button>
          {user && (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                <Link to="/stats"><BarChart3 className="h-4 w-4" /> Stats</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                <Link to="/calendar"><CalendarDays className="h-4 w-4" /> Calendar</Link>
              </Button>
            </>
          )}
          {action}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full bg-secondary text-secondary-foreground h-9 w-9">
                  {initial}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/dashboard"><Film className="h-4 w-4 mr-2" /> Dashboard</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/discover"><Users className="h-4 w-4 mr-2" /> Discover</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/stats"><BarChart3 className="h-4 w-4 mr-2" /> Stats</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/calendar"><CalendarDays className="h-4 w-4 mr-2" /> Calendar</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/profile"><UserIcon className="h-4 w-4 mr-2" /> Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth" search={{ mode: "login" }}>Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/auth" search={{ mode: "signup" }}>Sign up</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
