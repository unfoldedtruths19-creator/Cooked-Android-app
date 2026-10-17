import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

export const LEGAL_URLS = {
  terms: 'https://cookedapp.dpdns.org/terms',
  privacy: 'https://cookedapp.dpdns.org/privacy',
  contact: 'https://cookedapp.dpdns.org/contact',
  deleteAccount: 'https://cookedapp.dpdns.org/delete-account',
} as const;

/**
 * Opens a canonical COOKED legal/support URL using an in-app browser overlay
 * on native platforms, with smooth fallback to external browser linking.
 */
export async function openLegalUrl(url: string): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await openBrowserAsync(url, {
        presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
      });
      return;
    }
  } catch (err) {
    console.warn('[legal] In-app browser failed, falling back to external linking:', err);
  }

  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      await Linking.openURL(url);
    }
  } catch (err) {
    console.error('[legal] Failed to open URL:', url, err);
  }
}
