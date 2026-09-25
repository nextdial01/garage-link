export type PhotoAsset = { uri: string; fileName?: string | null; mimeType?: string | null; file?: File };

/** Metro selects photoUpload.native.ts on devices; browsers keep File/Blob uploads. */
export async function appendPhotoAsset(form: FormData, asset: PhotoAsset) {
  const file = asset.file || await (await fetch(asset.uri)).blob();
  form.append('file', file, asset.fileName || 'garage-photo.jpg');
}
