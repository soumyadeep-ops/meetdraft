import { exchangeZoomCode, getZoomProfile } from '../../../lib/zoom.js';
import sql from '../../../lib/db.js';

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=zoom_denied');

  try {
    const redirectUri = `${process.env.APP_URL}/api/auth/zoom/callback`;
    const tokens = await exchangeZoomCode(code, redirectUri);
    const profile = await getZoomProfile(tokens.access_token);
    const expiry = Date.now() + tokens.expires_in * 1000;

    // zoom_email = the email that will appear as host_email in Zoom webhooks
    // This is the Zoom account email — might be shared across people
    const zoomEmail = profile.email;

    // Get the pre-set Gmail from invite cookie (set during /join/[token])
    const cookies = Object.fromEntries(
      (req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(s => decodeURIComponent(s || '')))
    );
    const invitedEmail = cookies.pending_email;

    // If they came from an invite link, we already know their Gmail — just store Zoom tokens
    // If not, we'll use their Zoom email as the fallback Gmail identity (can be changed later)
    const gmailEmail = invitedEmail || zoomEmail;

    await sql`
      INSERT INTO users (email, name, zoom_email, zoom_user_id, zoom_access_token, zoom_refresh_token, zoom_token_expiry)
      VALUES (${gmailEmail}, ${profile.display_name}, ${zoomEmail}, ${profile.id}, ${tokens.access_token}, ${tokens.refresh_token}, ${expiry})
      ON CONFLICT (email) DO UPDATE SET
        zoom_email         = ${zoomEmail},
        zoom_user_id       = ${profile.id},
        zoom_access_token  = excluded.zoom_access_token,
        zoom_refresh_token = excluded.zoom_refresh_token,
        zoom_token_expiry  = excluded.zoom_token_expiry
    `;

    res.setHeader('Set-Cookie', [
      `pending_email=${encodeURIComponent(gmailEmail)}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`,
      `zoom_email=${encodeURIComponent(zoomEmail)}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`,
    ]);

    res.redirect(`/?zoom_done=1&email=${encodeURIComponent(gmailEmail)}&zoom_email=${encodeURIComponent(zoomEmail)}`);
  } catch (err) {
    console.error('Zoom callback error:', err);
    res.redirect('/?error=zoom_failed');
  }
}
