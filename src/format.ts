import type { AssetResponseDto } from "@immich/sdk";
import { assetUrl } from "./client.js";

export function formatAsset(asset: AssetResponseDto, url?: string): string {
  const date = asset.fileCreatedAt.slice(0, 10);
  const names = asset.people?.map((p) => p.name).filter(Boolean) ?? [];
  const people = names.length ? ` [${names.join(", ")}]` : "";
  return `${date}  ${asset.id}  ${asset.originalFileName}${people}\n  ${url ?? assetUrl(asset.id)}`;
}
