import { createElement, useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { loadCaptchaConfig, type CaptchaProps } from './captchaContract';

type Turnstile = { render: (element: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
function turnstile() { return (window as Window & { turnstile?: Turnstile }).turnstile; }
export default function LoginCaptcha({ attempt, onState }: CaptchaProps) {
  const host = useRef<HTMLDivElement>(null);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<'loading' | 'disabled' | 'required' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    let widget: string | undefined;
    let script: HTMLScriptElement | undefined;
    onState(false);
    const fail = () => { if (active) { onState(false); setState('error'); } };
    loadCaptchaConfig().then(config => {
      if (!active) return;
      if (!config.enabled) { setState('disabled'); onState(true); return; }
      setState('required');
      const render = () => {
        if (!active || !host.current) return;
        const api = turnstile();
        if (!api) { fail(); return; }
        try { widget = api.render(host.current, { sitekey: config.siteKey, callback: (token: string) => { if (active && typeof token === 'string' && token.length > 0 && token.length <= 2048) onState(true, token); }, 'expired-callback': () => { if (active) onState(false); }, 'error-callback': fail }); } catch { fail(); }
      };
      if (turnstile()) render();
      else {
        script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true; script.onload = render; script.onerror = fail;
        document.head.appendChild(script);
      }
    }).catch(fail);
    return () => { active = false; if (widget !== undefined) turnstile()?.remove(widget); script?.remove(); };
  }, [attempt, retry, onState]);
  return <View accessibilityLabel="ログインの安全確認" style={state === 'disabled' ? { display: 'none' } : undefined}>
    <Text>{state === 'error' ? '安全確認を読み込めません。通信状態を確認して再試行してください。' : 'ログインの安全確認'}</Text>
    {createElement('div', { ref: host })}
    <TouchableOpacity accessibilityRole="button" onPress={() => { onState(false); setState('loading'); setRetry(value => value + 1); }}><Text>安全確認を再読み込み</Text></TouchableOpacity>
  </View>;
}
