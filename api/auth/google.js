import { getGoogleClient } from '../../../lib/gmail.js';

export default function handler(req, res) {
  const email = req.query.email || '';
  const state = Math.random().toString(36).slice(2);
  res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax`);
  const client = getGoogleClient();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/userinfo.email'],
    state,
    login_hint: email,
  });
  res.redirect(url);
}
