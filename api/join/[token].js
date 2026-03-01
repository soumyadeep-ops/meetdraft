import sql from '../../../lib/db.js';

export default async function handler(req, res) {
  const { token } = req.query;
  if (!token) return res.redirect('/?error=invalid_link');

  const rows = await sql`
    SELECT email, name, onboarded FROM users WHERE invite_token=${token}
  `;

  if (!rows[0]) {
    return res.status(404).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:4rem;background:#0a0a0f;color:#e8e8f0">
        <h2>❌ This invite link is invalid or has been revoked.</h2>
        <p style="color:#6b6b88">Please ask your admin to resend your invite.</p>
      </body></html>
    `);
  }

  if (rows[0].onboarded) {
    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:4rem;background:#0a0a0f;color:#e8e8f0">
        <h2>✅ You're already set up!</h2>
        <p style="color:#6b6b88">Your account (${rows[0].email}) is connected. Check Gmail Drafts after your next meeting.</p>
      </body></html>
    `);
  }

  // Valid — store token in cookie, redirect to onboarding
  res.setHeader('Set-Cookie', [
    `invite_token=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`,
    `pending_email=${encodeURIComponent(rows[0].email)}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`,
  ]);

  res.redirect(`/?email=${encodeURIComponent(rows[0].email)}`);
}
