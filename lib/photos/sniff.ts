export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export type ImageKind = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const EXTENSION: Record<ImageKind, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function imageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12 || bytes.length > PHOTO_MAX_BYTES) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function extensionFor(kind: ImageKind): string {
  return EXTENSION[kind];
}

export function kindFromType(value: string): ImageKind | null {
  if (value === "image/jpg" || value === "image/jpeg") return "image/jpeg";
  if (value === "image/png" || value === "image/webp" || value === "image/gif") return value;
  return null;
}
