import bcrypt from 'bcryptjs';
import { getConfig } from '../config';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, getConfig().auth.bcryptRounds);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummyHash: string | undefined;

/** Burns the same time as a real check, so timing doesn't reveal unknown accounts. */
export async function verifyAgainstDummy(plain: string): Promise<void> {
  dummyHash ??= await hashPassword('not-a-real-password');
  await bcrypt.compare(plain, dummyHash);
}
