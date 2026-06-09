// Photo attachment helpers. Pick from iOS Photos / camera via Capacitor,
// upload to Supabase Storage, resolve public URLs for rendering.

import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import type { Attachment } from "../types";

const BUCKET = "message-attachments";

// Open the iOS native sheet (camera / photo library / cancel). Returns a
// data URL plus dimensions, or null if the user cancels.
export type PickedPhoto = {
  dataUrl: string;
  format: string; // 'jpeg', 'png', etc.
  width: number;
  height: number;
};

export async function pickPhoto(
  source: "library" | "camera" | "prompt" = "prompt",
): Promise<PickedPhoto | null> {
  if (!Capacitor.isNativePlatform()) {
    // Web fallback: file input
    return await pickPhotoWeb();
  }
  try {
    const photo = await Camera.getPhoto({
      quality: 75,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source:
        source === "library"
          ? CameraSource.Photos
          : source === "camera"
            ? CameraSource.Camera
            : CameraSource.Prompt,
      width: 2048,
      // height capped via aspect by maxSize; Capacitor scales the longest edge
      correctOrientation: true,
    });
    if (!photo.dataUrl) return null;
    // Resolve actual rendered dimensions for layout.
    const dims = await imageDims(photo.dataUrl);
    return {
      dataUrl: photo.dataUrl,
      format: photo.format ?? "jpeg",
      width: dims.width,
      height: dims.height,
    };
  } catch (e) {
    // User cancel returns a rejection; just return null.
    console.warn("[attachments] pickPhoto cancelled or errored", e);
    return null;
  }
}

async function pickPhotoWeb(): Promise<PickedPhoto | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const dataUrl = await readAsDataUrl(file);
      const dims = await imageDims(dataUrl);
      resolve({
        dataUrl,
        format: file.type.split("/")[1] ?? "jpeg",
        width: dims.width,
        height: dims.height,
      });
    };
    input.click();
  });
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function imageDims(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

// Convert data URL → Blob for upload.
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Upload a picked photo. Returns the Attachment shape ready to attach to a
// message insert. Path layout: <threadId>/<v4-uuid>.<ext>. Random UUID
// makes the path unguessable so the public bucket model is safe enough.
export async function uploadAttachment(
  threadId: string,
  picked: PickedPhoto,
): Promise<Attachment> {
  const ext = picked.format.toLowerCase();
  const id = crypto.randomUUID();
  const path = `${threadId}/${id}.${ext}`;
  const blob = dataUrlToBlob(picked.dataUrl);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      cacheControl: "31536000",
      contentType: blob.type,
      upsert: false,
    });
  if (error) throw error;
  return {
    kind: "image",
    path,
    width: picked.width,
    height: picked.height,
  };
}

// Resolve a public URL for rendering. Bucket is public so this is just a
// CDN URL — no signing, no expiry, fast.
export function attachmentUrl(att: Attachment): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(att.path);
  return data.publicUrl;
}
