import { Link } from "@tanstack/react-router";
import { Compass, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";

export function PublicHeader() {
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <Film className="h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <p className="font-display text-2xl leading-none">Reel Movie</p>
            <p className="text-xs text-muted-foreground mt-1 italic">your private movie hub</p>
          </div>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/discover"><Compass className="h-4 w-4" /> Discover</Link>
          </Button>
          <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
          <Button asChild><Link to="/auth">Get started</Link></Button>
        </nav>
      </div>
    </header>
  );
}

export function SiteHeader() {
  const { user } = useAuth();
  if (user) return <AppHeader user={user} />;
  return <PublicHeader />;
}
