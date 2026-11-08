import { Asset } from 'expo-asset';
import type { CameraOrderAsset } from './arrival-proof-controller';

/**
 * DEV ONLY (PO 09/11/2026): a bundled placeholder image sent as the check-in face so a tester can pass the
 * "face photo before repair" step without a camera. Only the dev screen button uses it (guarded by __DEV__).
 * It goes through the old single-photo route, so the server must have FACE_CHECKIN_ENFORCE off.
 */
export async function devFacePlaceholder(): Promise<CameraOrderAsset> {
  const asset = Asset.fromModule(require('../../../../assets/icon.png'));
  await asset.downloadAsync();
  return { source: 'camera', uri: asset.localUri ?? asset.uri, name: 'dev-skip-face.png', type: 'image/png', sizeBytes: 1 };
}
