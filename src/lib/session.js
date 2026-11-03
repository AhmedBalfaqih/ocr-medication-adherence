import { SignJWT, jwtVerify } from 'jose';

const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

// Never sign with a missing or short secret
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');
  return new TextEncoder().encode(secret);
}

// FR2 Keep the user logged in for seven days
export async function setSession(response, user) {
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());
  response.cookies.set('session', token, { ...COOKIE, maxAge: MAX_AGE_SECONDS });
}

// FR13 Log out with the same cookie options
export function clearSession(response) {
  response.cookies.set('session', '', { ...COOKIE, maxAge: 0 });
}

// Throws when the token is forged, expired or malformed
export async function readSession(token) {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
  const userId = Number(payload.sub);
  if (!Number.isInteger(userId)) throw new Error('Session has no user id.');
  return { userId };
}
