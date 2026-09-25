import { File as NativeFile } from 'expo-file-system';
import type { PhotoAsset } from './photoUpload';

export type { PhotoAsset } from './photoUpload';

/** Expo fetch consumes bytes-compatible files instead of legacy URI descriptors. */
export async function appendPhotoAsset(form: FormData, asset: PhotoAsset) {
  const file = new NativeFile(asset.uri);
  // Keep picker metadata while delegating bytes to the native file reader.
  const photo: Blob & { name: string } = {
    name: asset.fileName || file.name,
    type: asset.mimeType || file.type || 'image/jpeg',
    size: file.size,
    arrayBuffer: () => file.arrayBuffer(),
    bytes: () => file.bytes(),
    slice: (start, end, type) => file.slice(start, end, type),
    stream: () => file.stream(),
    text: () => file.text(),
  };
  form.append('file', photo);
}
