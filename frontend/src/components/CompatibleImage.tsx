// Backward-compatible image display component.
// Handles both new Cloudinary HTTPS URLs and legacy Base64 data URIs stored
// in MongoDB. Applies Cloudinary transformations (f_auto, q_auto, resize)
// automatically for CDN-hosted images.

import React from "react";
import { Image, ImageProps, ImageStyle, StyleProp } from "react-native";
import { cloudinaryTransform, isValidImageSource, TransformOptions } from "@/src/media/transform";

export type CompatibleImageProps = Omit<ImageProps, "source"> & {
  uri?: string | null;
  fallbackUri?: string | null;
  transform?: TransformOptions;
  style?: StyleProp<ImageStyle>;
};

export function CompatibleImage({
  uri,
  fallbackUri,
  transform,
  ...rest
}: CompatibleImageProps) {
  const primary = isValidImageSource(uri) ? uri : null;
  const fb = isValidImageSource(fallbackUri) ? fallbackUri : null;
  const source = primary || fb;
  if (!source) return null;

  const finalUri = transform ? cloudinaryTransform(source, transform) : source;
  return <Image {...rest} source={{ uri: finalUri as string }} />;
}
