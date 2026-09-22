// src/services/image-for-ai.ts
//
// Turning a photograph on the phone into something the assistant can look at.
//
// The wire format is a base64 data URI inside the JSON body - that is what the
// AI Service accepts, and it is why the whole path has a size problem worth
// taking seriously. Base64 is about a third larger than the bytes it carries,
// so a 6 MB photograph becomes an 8 MB string, and three of them at once
// becomes a request big enough to be refused, to time out on a phone network,
// or to sit in memory three times over while it is decoded.
//
// So every image is shrunk before it is encoded. The detector runs at 640px:
// a 4000px photograph carries no information it can use, and costs a hundred
// times the bytes to say the same thing. 1280px is generous headroom over what
// the model sees, and brings a typical phone photo to a few hundred kilobytes.

import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/** The service refuses a fourth image. */
export const AI_MAX_IMAGES = 3;

/** Comfortably above what the detector can use, far below what a phone takes. */
const TARGET_WIDTH = 1280;

/** Visually indistinguishable at this size, and roughly a third of the bytes. */
const JPEG_QUALITY = 0.7;

/**
 * The service's own ceiling is 8 MiB per image after decoding. Anything that
 * still exceeds it after shrinking is not a photograph of an appliance, and is
 * dropped rather than sent to be rejected.
 */
const MAX_ENCODED_CHARS = Math.floor(8 * 1024 * 1024 * 1.37);

/**
 * A photograph the customer picked, kept in two forms.
 *
 * `uri` is the original on the device, and it is kept on purpose: when a send
 * fails on a weak connection the only useful retry is a smaller picture, and
 * you cannot make a smaller picture out of one that has already been encoded.
 */
export interface PickedImage {
  uri: string;
  dataUri: string;
}

export interface PickResult {
  images: PickedImage[];
  /** Set when something the customer chose could not be used. */
  problemVi?: string;
}

/** What to try when the network will not carry the first attempt. */
const RETRY_WIDTH = 640;
const RETRY_QUALITY = 0.45;

async function encode(
  uri: string,
  width: number = TARGET_WIDTH,
  quality: number = JPEG_QUALITY,
): Promise<string | null> {
  try {
    const shrunk = await manipulateAsync(uri, [{ resize: { width } }], {
      compress: quality,
      format: SaveFormat.JPEG,
      base64: true,
    });
    if (!shrunk.base64 || shrunk.base64.length > MAX_ENCODED_CHARS) {
      return null;
    }
    return `data:image/jpeg;base64,${shrunk.base64}`;
  } catch {
    return null;
  }
}

/**
 * The same photographs, small enough to get through a bad connection.
 *
 * 640px at quality 0.45 is roughly a tenth of the bytes of the first attempt
 * and still above what the detector sees, which runs at 640px. Used only after
 * a send has already failed: sending everything this small by default would
 * cost accuracy on the ordinary case to buy nothing.
 */
export async function shrinkForRetry(images: PickedImage[]): Promise<string[]> {
  const smaller: string[] = [];
  for (const image of images) {
    const encoded = await encode(image.uri, RETRY_WIDTH, RETRY_QUALITY);
    if (encoded) smaller.push(encoded);
  }
  return smaller;
}

/** Ask for photographs from the library, shrink them, encode them. */
export async function pickImagesForAi(alreadyHave: number): Promise<PickResult> {
  const room = AI_MAX_IMAGES - alreadyHave;
  if (room <= 0) {
    return { images: [], problemVi: `Mỗi lần em xem được tối đa ${AI_MAX_IMAGES} ảnh thôi ạ.` };
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {
      images: [],
      problemVi: 'Anh/chị cho phép FixHome truy cập thư viện ảnh để gửi ảnh thiết bị giúp em ạ.',
    };
  }

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: room > 1,
    selectionLimit: room,
    quality: 1,
  });
  if (picked.canceled) return { images: [] };

  const images: PickedImage[] = [];
  let dropped = 0;
  for (const asset of picked.assets.slice(0, room)) {
    const encoded = await encode(asset.uri);
    if (encoded) images.push({ uri: asset.uri, dataUri: encoded });
    else dropped += 1;
  }

  return {
    images,
    problemVi: dropped > 0 ? 'Có ảnh em không đọc được, anh/chị thử ảnh khác giúp em nhé.' : undefined,
  };
}

/** The same, from the camera. */
export async function takePhotoForAi(alreadyHave: number): Promise<PickResult> {
  if (alreadyHave >= AI_MAX_IMAGES) {
    return { images: [], problemVi: `Mỗi lần em xem được tối đa ${AI_MAX_IMAGES} ảnh thôi ạ.` };
  }

  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return {
      images: [],
      problemVi: 'Anh/chị cho phép FixHome dùng camera để chụp thiết bị giúp em ạ.',
    };
  }

  const shot = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (shot.canceled || !shot.assets[0]) return { images: [] };

  const asset = shot.assets[0];
  const encoded = await encode(asset.uri);
  return encoded
    ? { images: [{ uri: asset.uri, dataUri: encoded }] }
    : { images: [], problemVi: 'Ảnh vừa chụp em không đọc được, anh/chị chụp lại giúp em nhé.' };
}
