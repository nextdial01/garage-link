'use client';

import { Suspense } from 'react';
import { GarageLoginForm } from '@/components/auth/GarageLoginForm';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
          読み込み中...
        </main>
      }
    >
      <GarageLoginForm />
    </Suspense>
  );
}
