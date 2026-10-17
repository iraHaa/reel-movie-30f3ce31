## TMDB integration
- Keep TMDB requests inside authenticated server-function handlers and read the token at request time; credentials must never be exposed through browser configuration.
- Keep best-effort TMDB helpers for cache seeding, but propagate sanitized request failures in interactive detail lookups so outages are not mislabeled as missing titles.