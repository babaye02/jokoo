// Cloudinary direct-upload helper (unsigned)
// Frontend uploads images directly to Cloudinary, avoiding routing large
// payloads through our FastAPI backend. Only the resulting `secure_url`
// (and optionally `public_id`) is sent to the backend afterwards.
//
// Docs: https://cloudinary.com/documentation/upload_images

import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

// ── Config from EXPO_PUBLIC_* env ──────────────────────────────────────────
const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME as string | undefined;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET as string | undefined;

export const CLOUDINARY_CONFIGURED = Boolean(CLOUD_NAME && UPLOAD_PRESET);

// ── Folders / logical categories ───────────────────────────────────────────
export type CloudinaryFolder =
  | "avatars"        // user & provider avatars
  | "covers"         // provider cover photos
  | "listings"       // service / prestation images
  | "gallery"        // provider gallery photos
  | "chat"           // chat attachments
  | "delivery"       // parcel delivery proof photos
  | "reports"        // babysitter / tutor reports
  | "admin";         // admin uploads (partners, ads, promos)

// ── Types ──────────────────────────────────────────────────────────────────
export type CloudinaryUploadResponse = {
  secure_url: string;
  public_id: string;
  resource_type?: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
};

export type PickedImage = {
  uri: string;
  name: string;
  type: string; // mime type
  size?: number;
  base64?: string;
  file?: File; // web only
};

// ── Constraints (mirror the Cloudinary preset restrictions) ────────────────
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];

// ── Pick an image via expo-image-picker ────────────────────────────────────
export type PickOptions = {
  aspect?: [number, number];
  allowsEditing?: boolean;
  quality?: number; // 0..1
};

export async function pickImageFromLibrary(opts: PickOptions = {}): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Autorisez l'accès à vos photos pour continuer.");
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: opts.allowsEditing ?? true,
    aspect: opts.aspect,
    quality: opts.quality ?? 0.85,
    selectionLimit: 1,
    // base64 kept off — we upload the file via multipart directly
    base64: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a: any = res.assets[0];
  return normalizeAsset(a);
}

export async function pickImageFromCamera(opts: PickOptions = {}): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Autorisez l'accès à la caméra pour continuer.");
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: opts.allowsEditing ?? false,
    aspect: opts.aspect,
    quality: opts.quality ?? 0.85,
    base64: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a: any = res.assets[0];
  return normalizeAsset(a);
}

function normalizeAsset(a: any): PickedImage {
  const type = (a.mimeType || "image/jpeg").toLowerCase();
  const size = a.fileSize as number | undefined;
  if (!ALLOWED_TYPES.includes(type)) {
    throw new Error("Format non supporté. Utilisez JPG, PNG, WEBP ou HEIC.");
  }
  if (size != null && size > MAX_BYTES) {
    throw new Error("Image trop lourde (max 10 Mo).");
  }
  return {
    uri: a.uri,
    name: a.fileName || `image-${Date.now()}.jpg`,
    type,
    size,
    file: a.file, // web
  };
}

// ── Upload directly to Cloudinary ──────────────────────────────────────────
export async function uploadToCloudinary(
  image: PickedImage,
  folder: CloudinaryFolder = "listings"
): Promise<CloudinaryUploadResponse> {
  return uploadMediaToCloudinary(image, folder, "image");
}

/**
 * Upload any media (image, video, raw) directly to Cloudinary.
 * Uses the /auto/upload endpoint so Cloudinary detects the resource type.
 */
export async function uploadMediaToCloudinary(
  media: PickedImage,
  folder: CloudinaryFolder = "listings",
  resourceType: "image" | "video" | "auto" = "auto"
): Promise<CloudinaryUploadResponse> {
  if (!CLOUDINARY_CONFIGURED) {
    throw new Error("Cloudinary n'est pas configuré (EXPO_PUBLIC_CLOUDINARY_*).");
  }
  const form = new FormData();

  if (Platform.OS === "web" && media.file) {
    form.append("file", media.file);
  } else {
    form.append("file", {
      uri: media.uri,
      name: media.name,
      type: media.type,
    } as any);
  }
  form.append("upload_preset", UPLOAD_PRESET as string);
  form.append("folder", `jokoo/${folder}`);

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
  const response = await fetch(endpoint, { method: "POST", body: form });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `Upload Cloudinary échoué (${response.status})`);
  }
  if (!body?.secure_url || !body?.public_id) {
    throw new Error("Réponse Cloudinary invalide (secure_url manquant).");
  }
  return body as CloudinaryUploadResponse;
}

// ── One-shot helper: pick + upload ─────────────────────────────────────────
export async function pickAndUpload(
  folder: CloudinaryFolder,
  opts: PickOptions = {}
): Promise<CloudinaryUploadResponse | null> {
  const img = await pickImageFromLibrary(opts);
  if (!img) return null;
  return uploadToCloudinary(img, folder);
}

export async function pickCameraAndUpload(
  folder: CloudinaryFolder,
  opts: PickOptions = {}
): Promise<CloudinaryUploadResponse | null> {
  const img = await pickImageFromCamera(opts);
  if (!img) return null;
  return uploadToCloudinary(img, folder);
}
