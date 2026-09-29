import type { NextRequest } from 'next/server';
import { passwordLogin } from '@/lib/auth/password-login-handler';

export async function POST(request: NextRequest) {
  return passwordLogin(request, true);
}
