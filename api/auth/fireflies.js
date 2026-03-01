import sql from '../../../lib/db.js';
import { validateFirefliesKey } from '../../../lib/fireflies.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email, apiKey } = req.body;
  if (!email || !apiKey) return res.status(400).json({ error: 'Missing fields' });

  const valid = await validateFirefliesKey(apiKey);
  if (!valid) return res.status(400).json({ error: 'Invalid Fireflies API key' });

  await sql`UPDATE users SET fireflies_api_key=${apiKey} WHERE email=${email}`;
  res.json({ ok: true });
}
