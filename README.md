# immich-cli

A small CLI over [`@immich/sdk`](https://www.npmjs.com/package/@immich/sdk) for querying an Immich photo library: search photos by free text (CLIP smart search), person, album, or date range.

## Setup

```
npm install
npm run build
```

Set credentials as environment variables (create an API key in Immich under Account Settings):

```
export IMMICH_INSTANCE_URL=https://photos.example.com/api
export IMMICH_API_KEY=...
```

Put `dist/index.js` on `PATH` as `immich` (e.g. `npm link`, or symlink it) so the skill's example commands work verbatim.

## Commands

```
immich search [query] [-p <person>]... [-a <album>] [--after <iso8601>] [--before <iso8601>] [--favorite] [--order <asc|desc>] [-n <limit>] [--json] [--share]
immich people [name] [--unnamed] [--json]
immich albums [name]
immich info <id> [--key <shareKey>] [--json] [--raw]
```

`search` with a `query` runs Immich's smart (CLIP) search; without one it runs a plain metadata/filter search. Both accept the same `-p`/`-a`/`--after`/`--before`/`--favorite` filters and can be combined freely. Results always include EXIF and people. `--order asc|desc` sorts by date (metadata search only, ignored for a text/`--like` query since CLIP ranks by similarity); combine with `-n 1` for "most recent" or "first ever" lookups. Output reports how many results are shown out of the total matches. `--share` creates a public Immich share link for the matched photos and prints its URL.

`info` fetches full metadata (EXIF, GPS, people, tags, stack) for a single asset by ID.

`people` prints each person's birth date when known, useful for computing date ranges around events like birthdays.
