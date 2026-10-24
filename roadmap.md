# Roadmap

- [x] Add tmdb_id column to movie_cache (migration applied)
- [x] Wire tmdb_id into cache writes (getMovieMeta, seed script)
- [x] Add idempotent refreshMovieCache server function
- [x] Trigger cache refresh in batches until no stale rows remain (1,399/1,668 refreshed; 269 remainder are titles TMDB doesn't carry — kept, retried last on future runs)
- [x] Refresh personal movies/watchlist rows from TMDB (metadata only; ratings, notes, favorites, status preserved)
- [x] Verify: build green, saved-movie data intact
