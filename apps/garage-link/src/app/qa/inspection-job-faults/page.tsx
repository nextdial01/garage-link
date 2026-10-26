'use client';
import {useActionState} from 'react';
import {runJobDiagnostic} from './actions';
export default function Page(){const [result,action,pending]=useActionState(runJobDiagnostic,null);return <main><h1>QAジョブ障害確認</h1><p>制御した依存先の障害です。本番DBの停止試験ではありません。</p><form action={action}><label>条件<select name="caseID"><option value="config_missing">service設定不足</option><option value="enumeration_failure">列挙RPC失敗</option></select></label><button disabled={pending}>確認</button></form>{result?<pre>{JSON.stringify(result,null,2)}</pre>:null}</main>;}
