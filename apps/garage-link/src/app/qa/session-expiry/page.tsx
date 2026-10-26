'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { captureGarageExpiry, probeGarageExpiredBusinessRoutes } from './actions';

export default function GarageSessionExpiryPage() {
  const held = useRef<{ token: string; receipt: string } | null>(null);
  const captureStarted = useRef(false);
  const probeStarted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [consumed, setConsumed] = useState(false);
  const [captureConsumed, setCaptureConsumed] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => () => { held.current = null; }, []);
  return <main className="mx-auto max-w-2xl space-y-4 p-6">
    <h1>QA genuine GARAGE session expiry</h1>
    <p>The fixed normal mobile customer GET/PATCH is observed once with an unchanged genuinely expired access token. Browser cookie expiry and logout remain separate operations.</p>
    <button disabled={busy || !!held.current || consumed || captureConsumed} onClick={async () => {
      if (captureStarted.current) return;
      captureStarted.current = true;
      setCaptureConsumed(true);
      setBusy(true);
      try {
        const session = await createClient().auth.getSession();
        const token = session.data.session?.access_token;
        if (session.error || !token) { setMessage('CURRENT_SESSION_UNAVAILABLE'); return; }
        const captured = await captureGarageExpiry(token);
        if (captured.receipt) held.current = { token, receipt: captured.receipt };
        setMessage(JSON.stringify({ code: captured.code, seconds_until_expiry: captured.seconds_until_expiry, valid_get_status: captured.valid_get_status }));
      } catch { setMessage('UNKNOWN_CAPTURE'); }
      finally { setBusy(false); }
    }}>Capture genuine session and fixed business read once</button>
    <button disabled={busy || !held.current || consumed} onClick={async () => {
      if (probeStarted.current) return;
      probeStarted.current = true;
      setConsumed(true);
      setBusy(true);
      try {
        const captured = held.current;
        if (!captured) { setMessage('CURRENT_HELD_SESSION_UNAVAILABLE_NO_RETRY'); return; }
        const observed = await probeGarageExpiredBusinessRoutes(captured.token, captured.receipt);
        setMessage(JSON.stringify(observed));
      } catch { setMessage('UNKNOWN_BUSINESS_OUTCOME_NO_RETRY'); }
      finally { held.current = null; setBusy(false); }
    }}>After real expiry: fixed business GET/PATCH once</button>
    <button disabled={busy} onClick={() => { held.current = null; setMessage('MEMORY_DISCARDED'); }}>Discard held memory</button>
    <pre className="whitespace-pre-wrap">{message}</pre>
    <p>Capture performs one fixed normal business GET and requires 200 with the valid token. Wait for real expiry, then execute the fixed GET/PATCH within five minutes. Do not reload or retry after an attempt or unknown result. Tokens remain in existing browser memory and the server invocation only; no token, receipt, response body, or credentials are displayed. Bind the fixed QA customer and before/after state in the parent ledger.</p>
  </main>;
}
