#!/usr/bin/env node
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command, Option } from "commander";
import {
  getAllAlbums,
  getAllPeople,
  getAssetInfo,
  searchAssets,
  searchPerson,
  searchRandom,
  searchSmart,
  createSharedLink,
  viewAsset,
  SharedLinkType,
  AssetMediaSize,
  AssetOrder,
  AssetTypeEnum,
  AssetVisibility,
  type AssetResponseDto,
} from "@immich/sdk";
import { initClient, shareUrl, assetUrl, rawUrl, formatError } from "./client.js";
import { resolveAlbum, resolvePerson, resolveTag } from "./resolve.js";
import { formatAsset, formatAssetDetail } from "./format.js";

const SHARE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ASSET_TYPES: Record<string, AssetTypeEnum> = {
  image: AssetTypeEnum.Image,
  video: AssetTypeEnum.Video,
  audio: AssetTypeEnum.Audio,
  other: AssetTypeEnum.Other,
};

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const program = new Command();

program
  .name("immich")
  .description("Query an Immich photo library")
  .version(version)
  .helpCommand(false);

interface SearchFilters {
  takenAfter?: string;
  takenBefore?: string;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  trashedAfter?: string;
  trashedBefore?: string;
  isFavorite?: boolean;
  isMotion?: boolean;
  isNotInAlbum?: boolean;
  isOffline?: boolean;
  isEncoded?: boolean;
  withDeleted?: boolean;
  personIds?: string[];
  albumIds?: string[];
  tagIds?: string[];
  city?: string;
  country?: string;
  state?: string;
  make?: string;
  model?: string;
  lensModel?: string;
  rating?: number | null;
  type?: AssetTypeEnum;
  visibility?: AssetVisibility;
  ocr?: string;
  size: number;
}

async function buildFilters(opts: {
  after?: string;
  before?: string;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  trashedAfter?: string;
  trashedBefore?: string;
  favorite?: boolean;
  motion?: boolean;
  notInAlbum?: boolean;
  offline?: boolean;
  encoded?: boolean;
  deleted?: boolean;
  person?: string[];
  album?: string;
  tag?: string[];
  city?: string;
  country?: string;
  state?: string;
  make?: string;
  model?: string;
  lens?: string;
  rating?: string;
  type?: "image" | "video" | "audio" | "other";
  visibility?: "archive" | "timeline" | "hidden" | "locked";
  ocr?: string;
  limit: string;
}): Promise<SearchFilters> {
  const filters: SearchFilters = { size: Number(opts.limit) };
  if (opts.after) filters.takenAfter = opts.after;
  if (opts.before) filters.takenBefore = opts.before;
  if (opts.createdAfter) filters.createdAfter = opts.createdAfter;
  if (opts.createdBefore) filters.createdBefore = opts.createdBefore;
  if (opts.updatedAfter) filters.updatedAfter = opts.updatedAfter;
  if (opts.updatedBefore) filters.updatedBefore = opts.updatedBefore;
  if (opts.trashedAfter) filters.trashedAfter = opts.trashedAfter;
  if (opts.trashedBefore) filters.trashedBefore = opts.trashedBefore;
  if (opts.favorite) filters.isFavorite = true;
  if (opts.motion) filters.isMotion = true;
  if (opts.notInAlbum) filters.isNotInAlbum = true;
  if (opts.offline) filters.isOffline = true;
  if (opts.encoded) filters.isEncoded = true;
  if (opts.deleted) filters.withDeleted = true;
  if (opts.city) filters.city = opts.city;
  if (opts.country) filters.country = opts.country;
  if (opts.state) filters.state = opts.state;
  if (opts.make) filters.make = opts.make;
  if (opts.model) filters.model = opts.model;
  if (opts.lens) filters.lensModel = opts.lens;
  if (opts.ocr) filters.ocr = opts.ocr;
  if (opts.type) filters.type = ASSET_TYPES[opts.type];
  if (opts.visibility) filters.visibility = opts.visibility as AssetVisibility;
  if (opts.rating) filters.rating = opts.rating === "unrated" ? null : Number(opts.rating);

  if (opts.person?.length) {
    const people = await Promise.all(opts.person.map(resolvePerson));
    filters.personIds = people.map((p) => p.id);
  }
  if (opts.album) {
    const album = await resolveAlbum(opts.album);
    filters.albumIds = [album.id];
  }
  if (opts.tag?.length) {
    const tags = await Promise.all(opts.tag.map(resolveTag));
    filters.tagIds = tags.map((t) => t.id);
  }
  return filters;
}

async function printResults(assets: AssetResponseDto[], total: number | undefined, json: boolean, share: boolean, raw: boolean): Promise<void> {
  if (assets.length === 0) {
    console.log("no matching photos");
    return;
  }

  // Resolve per-asset URLs up front: a share deep link into the created
  // share (recipients need no login) if --share, else the private
  // authenticated web link (only useful to the logged-in owner). --raw
  // swaps either of these for the underlying image URL, carrying the share
  // key along so it still works without a login.
  let urlFor = (asset: AssetResponseDto) => assetUrl(asset.id);
  let shareKey: string | undefined;
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
    shareKey = link.key;
    urlFor = (asset: AssetResponseDto) => shareUrl(link.key, asset.id);
  }
  if (raw) {
    urlFor = (asset: AssetResponseDto) => rawUrl(asset.id, shareKey, asset.type);
  }

  if (json) {
    const body = total === undefined ? { items: assets.map((a) => ({ ...a, url: urlFor(a) })) } : { total, items: assets.map((a) => ({ ...a, url: urlFor(a) })) };
    console.log(JSON.stringify(body, null, 2));
  } else {
    console.log(assets.map((a) => formatAsset(a, urlFor(a))).join("\n"));
    if (total !== undefined) {
      console.log(`\n${assets.length} of ${total} matching photos`);
    }
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
  .addOption(new Option("--tag <name>", "filter by tag name or path (repeatable)").argParser(
    (v: string, prev: string[] = []) => [...prev, v],
  ))
  .option("--album <name>", "filter by album name (substring match)")
  .option("--city <name>", "filter by city name")
  .option("--country <name>", "filter by country name")
  .option("--state <name>", "filter by state/province name")
  .option("--make <name>", "filter by camera make")
  .option("--model <name>", "filter by camera model")
  .option("--lens <name>", "filter by lens model")
  .option("--ocr <text>", "filter by OCR text content")
  .addOption(new Option("--type <type>", "filter by asset type").choices(["image", "video", "audio", "other"]))
  .addOption(new Option("--visibility <state>", "filter by visibility").choices(["archive", "timeline", "hidden", "locked"]))
  .option("--rating <1-5|unrated>", "filter by star rating")
  .option("--after <iso8601>", "only photos taken at or after this timestamp")
  .option("--before <iso8601>", "only photos taken before this timestamp")
  .option("--created-after <iso8601>", "only assets created (uploaded) at or after this timestamp")
  .option("--created-before <iso8601>", "only assets created (uploaded) before this timestamp")
  .option("--updated-after <iso8601>", "only assets last updated at or after this timestamp")
  .option("--updated-before <iso8601>", "only assets last updated before this timestamp")
  .option("--trashed-after <iso8601>", "only assets trashed at or after this timestamp")
  .option("--trashed-before <iso8601>", "only assets trashed before this timestamp")
  .option("--favorite", "only favorited photos")
  .option("--motion", "only motion photos")
  .option("--not-in-album", "only photos not in any album")
  .option("--offline", "only offline assets")
  .option("--encoded", "only encoded video assets")
  .option("--deleted", "include trashed assets")
  .option("--like <assetId>", "find photos visually similar to this asset ID (reverse image search)")
  .option("--language <code>", "language of the search query, e.g. \"de\" (semantic search only)")
  .addOption(new Option("--order <asc|desc>", "sort by date; use desc + -n 1 for \"most recent\", asc + -n 1 for \"first ever\" (metadata search only, ignored for a text/--like query)").choices(["asc", "desc"]))
  .option("-n, --limit <n>", "max results", "20")
  .option("--json", "print raw JSON instead of a formatted list")
  .option("--share", "create a public share link for the results")
  .option("--raw", "link directly to the raw image instead of the Immich web UI")
  .action(async (query: string | undefined, opts) => {
    initClient();
    try {
      const filters = await buildFilters(opts);
      const isSmartSearch = Boolean(query || opts.like);
      if (opts.order && isSmartSearch) {
        console.error("immich: --order has no effect on a text/--like search; CLIP results are ranked by similarity, not sortable by date");
      }
      const result = isSmartSearch
        ? await searchSmart({
            smartSearchDto: { ...filters, query, queryAssetId: opts.like, language: opts.language, withExif: true },
          })
        : await searchAssets({
            metadataSearchDto: { ...filters, withPeople: true, withExif: true, order: opts.order as AssetOrder | undefined },
          });
      await printResults(result.assets.items, result.assets.total, Boolean(opts.json), Boolean(opts.share), Boolean(opts.raw));
    } catch (err) {
      console.error(`immich: ${formatError(err)}`);
      process.exitCode = 1;
    }
  });

program
  .command("random")
  .description("Show random photos")
  .option("-n, --limit <n>", "number of photos", "1")
  .option("--json", "print raw JSON instead of a formatted list")
  .option("--share", "create a public share link for the results")
  .option("--raw", "link directly to the raw image instead of the Immich web UI")
  .action(async (opts: { limit: string; json?: boolean; share?: boolean; raw?: boolean }) => {
    initClient();
    try {
      const assets = await searchRandom({ randomSearchDto: { size: Number(opts.limit), withExif: true, withPeople: true } });
      await printResults(assets, undefined, Boolean(opts.json), Boolean(opts.share), Boolean(opts.raw));
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
  .option("--json", "print raw JSON instead of a formatted list")
  .action(async (name: string | undefined, opts: { unnamed?: boolean; json?: boolean }) => {
    initClient();
    try {
      let people = name ? await searchPerson({ name }) : (await getAllPeople({})).people;
      if (!opts.unnamed) {
        people = people.filter((p) => p.name);
      }
      if (people.length === 0) {
        console.log("no matching people");
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(people, null, 2));
        return;
      }
      for (const p of people) {
        const birthday = p.birthDate ? `  born ${p.birthDate}` : "";
        console.log(`${p.id}  ${p.name || "(unnamed)"}${birthday}`);
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

program
  .command("info")
  .description("Show full metadata for an asset by ID")
  .argument("<id>", "asset ID")
  .option("--key <shareKey>", "shared link key, for accessing an asset via a share")
  .option("--json", "print raw JSON instead of a formatted summary")
  .option("--raw", "link directly to the raw image instead of the Immich web UI")
  .action(async (id: string, opts: { key?: string; json?: boolean; raw?: boolean }) => {
    initClient();
    try {
      const asset = await getAssetInfo({ id, key: opts.key });
      const url = opts.raw ? rawUrl(asset.id, opts.key, asset.type) : assetUrl(asset.id);
      if (opts.json) {
        console.log(JSON.stringify({ ...asset, url }, null, 2));
      } else {
        console.log(formatAssetDetail(asset, url));
      }
    } catch (err) {
      console.error(`immich: ${formatError(err)}`);
      process.exitCode = 1;
    }
  });

const VIEW_SIZES: Record<string, AssetMediaSize> = {
  thumbnail: AssetMediaSize.Thumbnail,
  preview: AssetMediaSize.Preview,
  fullsize: AssetMediaSize.Fullsize,
  original: AssetMediaSize.Original,
};

program
  .command("view")
  .description("Save a photo to a local file so it can be displayed, e.g. by an LLM's image tool")
  .argument("<id>", "asset ID")
  .option("--key <shareKey>", "shared link key, for accessing an asset via a share")
  .addOption(new Option("--size <size>", "image size to fetch").choices(Object.keys(VIEW_SIZES)).default("preview"))
  .option("-o, --output <path>", "write to this path instead of a temp file")
  .action(async (id: string, opts: { key?: string; size: string; output?: string }) => {
    initClient();
    try {
      const blob = await viewAsset({ id, key: opts.key, size: VIEW_SIZES[opts.size] });
      const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
      const path = opts.output ?? join(tmpdir(), `immich-${id}.${ext}`);
      await writeFile(path, Buffer.from(await blob.arrayBuffer()));
      console.log(path);
    } catch (err) {
      console.error(`immich: ${formatError(err)}`);
      process.exitCode = 1;
    }
  });

program.parseAsync();
