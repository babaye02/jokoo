// Cloudinary URL transformation helper
// Applies `f_auto,q_auto` and resize/crop options to a Cloudinary secure_url.
// Non-Cloudinary URLs and Base64 data URIs are passed through unchanged.

const CLOUDINARY_HOST_RE = /^https:\/\/res\.cloudinary\.com\//i;

export type TransformOptions = {
  width?: number;
  height?: number;
  thumbnail?: boolean; // c_thumb,g_auto
  face?: boolean;       // g_face — useful for avatars
  crop?: "limit" | "fill" | "fit" | "thumb";
};

/**
 * Apply Cloudinary transformations to a secure_url.
 * Returns the original string if it's not a Cloudinary URL (Base64, external, etc.).
 */
export function cloudinaryTransform(url?: string | null, options: TransformOptions = {}): string | undefined {
  if (!url) return undefined;
  if (!CLOUDINARY_HOST_RE.test(url)) return url;

  const parts: string[] = ["f_auto", "q_auto"];

  const crop =
    options.thumbnail
      ? "c_thumb"
      : options.crop === "fill"
      ? "c_fill"
      : options.crop === "fit"
      ? "c_fit"
      : options.crop === "thumb"
      ? "c_thumb"
      : "c_limit";
  parts.push(crop);

  if (options.thumbnail || options.face) {
    parts.push(options.face ? "g_face" : "g_auto");
  }
  if (options.width) parts.push(`w_${Math.round(options.width)}`);
  if (options.height) parts.push(`h_${Math.round(options.height)}`);

  return url.replace("/image/upload/", `/image/upload/${parts.join(",")}/`);
}

/** Detects if a URI is a valid image source (http(s) URL or data:image base64). */
export function isValidImageSource(uri?: string | null): boolean {
  if (!uri) return false;
  return /^https?:\/\//i.test(uri) || /^data:image\//i.test(uri);
}
