import type { AssetResponseDto } from "@immich/sdk";
import { assetUrl } from "./client.js";

export function formatAsset(asset: AssetResponseDto, url?: string): string {
  const date = asset.fileCreatedAt.slice(0, 10);
  const names = asset.people?.map((p) => p.name).filter(Boolean) ?? [];
  const people = names.length ? ` [${names.join(", ")}]` : "";
  const place = [asset.exifInfo?.city, asset.exifInfo?.state, asset.exifInfo?.country].filter(Boolean).join(", ");
  const location = place ? ` (${place})` : "";
  return `${date}  ${asset.id}  ${asset.originalFileName}${people}${location}\n  ${url ?? assetUrl(asset.id)}`;
}

export function formatAssetDetail(asset: AssetResponseDto, url?: string): string {
  const lines: string[] = [];
  lines.push(`${asset.originalFileName}  (${asset.id})`);
  lines.push(`  ${url ?? assetUrl(asset.id)}`);
  lines.push(`type: ${asset.type}${asset.isFavorite ? ", favorite" : ""}${asset.isArchived ? ", archived" : ""}${asset.isTrashed ? ", trashed" : ""}`);
  if (asset.width && asset.height) lines.push(`dimensions: ${asset.width}x${asset.height}`);
  if (asset.duration) lines.push(`duration: ${asset.duration}`);
  lines.push(`taken: ${asset.fileCreatedAt}`);
  lines.push(`uploaded: ${asset.createdAt}`);
  lines.push(`modified: ${asset.fileModifiedAt}`);
  lines.push(`path: ${asset.originalPath}`);
  lines.push(`checksum: ${asset.checksum}`);
  if (asset.owner) lines.push(`owner: ${asset.owner.name} <${asset.owner.email}>`);

  const exif = asset.exifInfo;
  if (exif) {
    const camera = [exif.make, exif.model].filter(Boolean).join(" ");
    if (camera) lines.push(`camera: ${camera}${exif.lensModel ? ` (${exif.lensModel})` : ""}`);
    const settings = [
      exif.fNumber ? `f/${exif.fNumber}` : null,
      exif.exposureTime ? `${exif.exposureTime}s` : null,
      exif.iso ? `ISO ${exif.iso}` : null,
      exif.focalLength ? `${exif.focalLength}mm` : null,
    ].filter(Boolean);
    if (settings.length) lines.push(`settings: ${settings.join(", ")}`);
    if (exif.fileSizeInByte) lines.push(`file size: ${exif.fileSizeInByte} bytes`);
    const place = [exif.city, exif.state, exif.country].filter(Boolean).join(", ");
    if (place) lines.push(`location: ${place}`);
    if (exif.latitude != null && exif.longitude != null) {
      lines.push(`coordinates: ${exif.latitude}, ${exif.longitude}`);
    }
    if (exif.rating != null) lines.push(`rating: ${exif.rating}`);
    if (exif.description) lines.push(`description: ${exif.description}`);
  }

  const names = asset.people?.map((p) => p.name).filter(Boolean) ?? [];
  if (names.length) lines.push(`people: ${names.join(", ")}`);
  const tags = asset.tags?.map((t) => t.value) ?? [];
  if (tags.length) lines.push(`tags: ${tags.join(", ")}`);
  if (asset.stack) lines.push(`stack: ${asset.stack.assetCount} assets (primary ${asset.stack.primaryAssetId})`);

  return lines.join("\n");
}
