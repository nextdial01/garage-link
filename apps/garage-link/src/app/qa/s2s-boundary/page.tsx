'use client';
import {useActionState} from 'react';import{runBoundary}from'./actions';
const cases=['past299','past300','past301','future299','future300','future301'];
export default function Page(){const[result,action,pending]=useActionState(runBoundary,null);return <main><h1>QA署名時刻境界</h1><p>同じ認証処理へ要求単位の固定時計を渡します。HTTP到達時間の試験とは分けて記録します。</p><form action={action}><select name="caseID">{cases.map(id=><option key={id}>{id}</option>)}</select><button disabled={pending}>1件確認</button></form>{result?<pre>{JSON.stringify(result,null,2)}</pre>:null}</main>;}
