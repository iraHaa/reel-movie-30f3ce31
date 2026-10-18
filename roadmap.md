# Roadmap

- [x] Add tmdb_id column to movie_cache (migration applied)
- [x] Wire tmdb_id into cache writes (getMovieMeta, seed script)
- [x] Add idempotent refreshMovieCache server function
- [ ] Trigger cache refresh in batches until no stale rows remain
- [ ] Refresh personal movies/watchlist rows from TMDB (metadata only; preserve user ratings, notes, favorites, status)
- [ ] Verify: build green, stale-row count = 0, spot-check refreshed rows
