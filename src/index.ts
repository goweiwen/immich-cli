#!/usr/bin/env node
import { Command, Option } from "commander";
import {
  getAllAlbums,
  getAllPeople,
  searchAssets,
  searchPerson,
  searchSmart,
  createSharedLink,
  SharedLinkType,
  type AssetResponseDto,
} from "@immich/sdk";
import { initClient, shareUrl, assetUrl, formatError } from "./client.js";
import { resolveAlbum, resolvePerson } from "./resolve.js";
import { formatAsset } from "./format.js";

const SHARE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const program = new Command();

program
  .name("immich")
  .description("Query an Immich photo library")
  .version("0.1.0")
  .helpCommand(false);

interface SearchFilters {
  takenAfter?: string;
  takenBefore?: string;
  isFavorite?: boolean;
  personIds?: string[];
  albumIds?: string[];
  size: number;
}

async function buildFilters(opts: {
  after?: string;
  before?: string;
  favorite?: boolean;
  person?: string[];
  album?: string;
  limit: string;
}): Promise<SearchFilters> {
  const filters: SearchFilters = { size: Number(opts.limit) };
  if (opts.after) filters.takenAfter = opts.after;
  if (opts.before) filters.takenBefore = opts.before;
  if (opts.favorite) filters.isFavorite = true;

  if (opts.person?.length) {
    const people = await Promise.all(opts.person.map(resolvePerson));
    filters.personIds = people.map((p) => p.id);
  }
  if (opts.album) {
    const album = await resolveAlbum(opts.album);
    filters.albumIds = [album.id];
  }
  return filters;
}

async function printResults(assets: AssetResponseDto[], json: boolean, share: boolean): Promise<void> {
  if (assets.length === 0) {
    console.log("no matching photos");
    return;
  }

  // Resolve per-asset URLs up front: a share deep link into the created
  // share (recipients need no login) if --share, else the private
  // authenticated web link (only useful to the logged-in owner).
  let urlFor = (asset: AssetResponseDto) => assetUrl(asset.id);
  let expiresAt: string | undefined;
  if (share) {
    expiresAt = new Date(Date.now() + SHARE_LINK_TTL_MS).toISOString();
    const link = await createSharedLink({
      sharedLinkCreateDto: {
        type: SharedLinkType.Individual,
        assetIds: assets.map((a) => a.id),
        showMetadata: true,
        expiresAt,
      },
    });
    urlFor = (asset: AssetResponseDto) => shareUrl(link.key, asset.id);
  }

  if (json) {
    console.log(JSON.stringify(assets.map((a) => ({ ...a, url: urlFor(a) })), null, 2));
  } else {
    console.log(assets.map((a) => formatAsset(a, urlFor(a))).join("\n"));
  }
  if (expiresAt) {
    console.log(`\nshare link expires ${expiresAt}`);
  }
}

program
  .command("search")
  .description("Search photos: free-text semantic query, or filtered by person/album/date/favorite")
  .argument("[query]", "natural-language search text, e.g. \"cake\" or \"sunset over water\"")
  .addOption(new Option("-p, --person <name>", "filter by person name (repeatable)").argParser(
    (v: string, prev: string[] = []) => [...prev, v],
  ))
  .option("-a, --album <name>", "filter by album name (substring match)")
  .option("--after <iso8601>", "only photos taken at or after this timestamp")
  .option("--before <iso8601>", "only photos taken before this timestamp")
  .option("--favorite", "only favorited photos")
  .option("-n, --limit <n>", "max results", "20")
  .option("--json", "print raw JSON instead of a formatted list")
  .option("--share", "create a public share link for the results")
  .action(async (query: string | undefined, opts) => {
    initClient();
    try {
      const filters = await buildFilters(opts);
      const result = query
        ? await searchSmart({ smartSearchDto: { ...filters, query } })
        : await searchAssets({ metadataSearchDto: { ...filters, withPeople: true } });
      await printResults(result.assets.items, Boolean(opts.json), Boolean(opts.share));
    } catch (err) {
      console.error(`immich: ${formatError(err)}`);
      process.exitCode = 1;
    }
  });

program
  .command("people")
  .description("List people, or search by name")
  .argument("[name]", "substring to search for")
  .option("--unnamed", "also include unnamed people")
  .action(async (name: string | undefined, opts: { unnamed?: boolean }) => {
    initClient();
    try {
      let people = name ? await searchPerson({ name }) : (await getAllPeople({})).people;
      if (!opts.unnamed) {
        people = people.filter((p) => p.name);
      }
      if (people.length === 0) {
        console.log("no matching people");
      }
      for (const p of people) {
        console.log(`${p.id}  ${p.name || "(unnamed)"}`);
      }
    } catch (err) {
      console.error(`immich: ${formatError(err)}`);
      process.exitCode = 1;
    }
  });

program
  .command("albums")
  .description("List albums, or search by name")
  .argument("[name]", "substring to search for")
  .action(async (name: string | undefined) => {
    initClient();
    try {
      const albums = await getAllAlbums(name ? { name } : {});
      if (albums.length === 0) {
        console.log("no matching albums");
      }
      for (const a of albums) {
        console.log(`${a.id}  ${a.albumName}  (${a.assetCount} photos, ${a.startDate ?? "?"} to ${a.endDate ?? "?"})`);
      }
    } catch (err) {
      console.error(`immich: ${formatError(err)}`);
      process.exitCode = 1;
    }
  });

program.parseAsync();
