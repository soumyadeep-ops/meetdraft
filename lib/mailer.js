// Uses Resend — free tier: 3,000 emails/month
// Sign up at resend.com, get API key, add RESEND_API_KEY to env
// Alternatively works with any SMTP via nodemailer

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'MeetDraft <onboarding@yourdomain.com>';

export async function sendInviteEmail({ to, name, inviteUrl }) {
  if (!RESEND_API_KEY) {
    // Log for manual sharing if no email service configured
    console.log(`[INVITE] ${to} → ${inviteUrl}`);
    return;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body { margin:0; padding:0; background:#f4f4f8; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrapper { max-width:560px; margin:40px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
    .header { background:linear-gradient(135deg, #6366f1, #818cf8); padding:40px 40px 32px; text-align:center; }
    .header h1 { color:#fff; font-size:26px; margin:0 0 6px; font-weight:700; letter-spacing:-0.5px; }
    .header p { color:rgba(255,255,255,0.8); font-size:14px; margin:0; }
    .body { padding:36px 40px; }
    .greeting { font-size:16px; color:#1a1a2e; font-weight:600; margin-bottom:12px; }
    .text { font-size:14px; color:#4a4a6a; line-height:1.7; margin-bottom:20px; }
    .btn { display:block; width:fit-content; margin:0 auto 28px; background:#6366f1; color:#fff !important; text-decoration:none; padding:14px 36px; border-radius:10px; font-size:15px; font-weight:600; letter-spacing:-0.2px; }
    .steps { background:#f8f8fc; border-radius:10px; padding:20px 24px; margin-bottom:24px; }
    .step { display:flex; align-items:flex-start; gap:12px; margin-bottom:12px; font-size:13px; color:#4a4a6a; line-height:1.5; }
    .step:last-child { margin-bottom:0; }
    .step-num { width:22px; height:22px; border-radius:50%; background:#6366f1; color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; }
    .url-box { background:#f4f4f8; border:1px solid #e0e0ee; border-radius:8px; padding:10px 14px; font-size:12px; color:#6b6b88; word-break:break-all; margin-bottom:24px; }
    .footer { border-top:1px solid #f0f0f8; padding:20px 40px; text-align:center; font-size:12px; color:#9999aa; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>👋 You're invited to MeetDraft</h1>
      <p>Automatic meeting summaries in your Gmail</p>
    </div>
    <div class="body">
      <div class="greeting">Hi ${name},</div>
      <p class="text">
        Your team is using MeetDraft to automatically generate meeting summary drafts in Gmail after every Zoom call.
        Set it up once in 60 seconds — you'll never have to write a recap email from scratch again.
      </p>

      <a href="${inviteUrl}" class="btn">Set Up My Account →</a>

      <div class="steps">
        <div class="step"><div class="step-num">1</div><div><strong>Connect Zoom</strong> — so we know when your meetings end</div></div>
        <div class="step"><div class="step-num">2</div><div><strong>Connect Gmail</strong> — so we can create drafts in your inbox</div></div>
        <div class="step"><div class="step-num">3</div><div><strong>Done!</strong> — after every meeting, check your Gmail Drafts</div></div>
      </div>

      <p class="text" style="font-size:13px; color:#9999aa;">
        This link is unique to you. If you didn't expect this, you can safely ignore it.
      </p>
      <p style="font-size:12px; color:#c0c0d0; margin:0;">Or copy this link: </p>
      <div class="url-box">${inviteUrl}</div>
    </div>
    <div class="footer">
      MeetDraft · Sent by your team admin · <a href="${inviteUrl}" style="color:#6366f1;">View invite</a>
    </div>
  </div>
</body>
</html>
  `.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: "You're invited to MeetDraft — set up in 60 seconds",
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend error: ${JSON.stringify(err)}`);
  }

  return res.json();
}
