const TMDB_LOGO_URL =
  "https://www.themoviedb.org/assets/v4/logos/v2/blue_square_1-5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4.svg";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="relative mx-auto max-w-6xl px-6 py-8 text-center text-xs text-muted-foreground">
        <p>
          &copy; {new Date().getFullYear()} Reel Movie. Made in Ukraine. This product uses the
          TMDB API but is not endorsed or certified by TMDB.
        </p>
        <a
          href="https://www.themoviedb.org/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Movie and TV data provided by The Movie Database (TMDB)"
          className="mt-4 flex justify-end md:absolute md:right-6 md:bottom-4 md:mt-0"
        >
          <img
            src={TMDB_LOGO_URL}
            alt="The Movie Database (TMDB)"
            width={190}
            height={81}
            loading="lazy"
            className="h-7 w-auto opacity-90 transition-opacity hover:opacity-100"
          />
        </a>
      </div>
    </footer>
  );
}
