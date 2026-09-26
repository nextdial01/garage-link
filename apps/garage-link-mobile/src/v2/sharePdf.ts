import { File, Paths } from 'expo-file-system';
import type { FilePrintResult } from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** Share a rendered PDF from an app-scoped cache path on Android. */
export async function sharePrintedPdf(result: FilePrintResult, dialogTitle: string) {
  if (!await Sharing.isAvailableAsync()) {
    throw new Error('共有機能を利用できません。');
  }

  let uri = result.uri;
  if (Platform.OS === 'android') {
    if (!result.base64) {
      throw new Error('共有用PDFを準備できませんでした。');
    }

    const shareFile = new File(
      Paths.cache,
      `garage-link-shared-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`,
    );
    shareFile.write(result.base64, { encoding: 'base64' });
    if (!shareFile.exists || shareFile.size <= 0) {
      if (shareFile.exists) shareFile.delete();
      throw new Error('共有用PDFを準備できませんでした。');
    }
    uri = shareFile.uri;
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle,
  });
}
