// api/auth/zoom.js  — start Zoom OAuth
export default function handler(req, res) {
  const state = Math.random().toString(36).slice(2);
  // Store state in cookie (stateless for Vercel)
  res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`);
  const url = new URL('https://zoom.us/oauth/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.ZOOM_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${process.env.APP_URL}/api/auth/zoom/callback`);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
}
