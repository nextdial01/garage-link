import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { allowedCaptchaNavigation, captchaUrl, loadCaptchaConfig, readCaptchaMessage, type CaptchaProps } from './captchaContract';

export default function LoginCaptcha({ attempt, onState }: CaptchaProps) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<'loading' | 'disabled' | 'required' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    onState(false);
    loadCaptchaConfig().then(config => {
      if (!active) return;
      setState(config.enabled ? 'required' : 'disabled');
      onState(!config.enabled);
    }).catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [attempt, retry, onState]);
  if (state === 'disabled') return null;
  const url = state === 'required' ? captchaUrl() : '';
  return <View accessibilityLabel="ログインの安全確認">
    <Text>{state === 'error' ? '安全確認を読み込めません。通信状態を確認して再試行してください。' : 'ログインの安全確認'}</Text>
    {state === 'required' && <WebView key={`${attempt}-${retry}`} source={{ uri: url }} style={{ height: 110, width: '100%' }} javaScriptEnabled domStorageEnabled sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} incognito allowFileAccess={false} allowUniversalAccessFromFileURLs={false} setSupportMultipleWindows={false} onShouldStartLoadWithRequest={request => allowedCaptchaNavigation(request.url, url, request.isTopFrame)} onMessage={event => { const result = readCaptchaMessage(event.nativeEvent.url, url, event.nativeEvent.data); if (result) onState(result.ready, result.token); }} onError={() => { onState(false); setState('error'); }} onHttpError={() => { onState(false); setState('error'); }} />}
    <TouchableOpacity accessibilityRole="button" onPress={() => { onState(false); setState('loading'); setRetry(value => value + 1); }}><Text>安全確認を再読み込み</Text></TouchableOpacity>
  </View>;
}
