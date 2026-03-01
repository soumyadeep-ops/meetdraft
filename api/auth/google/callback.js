import { getGoogleClient } from '../../../lib/gmail.js';
import sql from '../../../lib/db.js';

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=google_denied');

  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent))
  );
  const email = cookies.pending_email;
  if (!email) return res.redirect('/?error=session_lost');

  try {
    const client = getGoogleClient();
    const { tokens } = await client.getToken(code);

    await sql`
      UPDATE users SET
        google_access_token=${tokens.access_token},
        google_refresh_token=${tokens.refresh_token},
        onboarded=TRUE,
        invite_token=NULL
      WHERE email=${email}
    `;

    // Clear cookies
    res.setHeader('Set-Cookie', [
      'pending_email=; HttpOnly; Path=/; Max-Age=0',
      'invite_token=; HttpOnly; Path=/; Max-Age=0',
    ]);
    res.redirect(`/?done=1&email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect(`/?zoom_done=1&email=${encodeURIComponent(email)}&error=google_failed`);
  }
}
