import { NextResponse } from 'next/server';

/** Retired routine OTP endpoint: never sends mail or creates trusted sessions. */
export async function POST() {
  return NextResponse.json({ code: 'ROUTINE_EMAIL_OTP_RETIRED' }, { status: 410, headers: { 'cache-control': 'no-store' } });
}
