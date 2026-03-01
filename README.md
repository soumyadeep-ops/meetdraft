# MeetDraft v2 — Setup Guide
> Zoom meetings → AI summary → Gmail draft. Scalable team solution. 100% free.

---

## Stack 
- **Frontend**: Vercel (free) — onboarding pages + admin panel
- **Backend**: Vercel Serverless Functions
- **Database**: Neon PostgreSQL (free tier)
- **Integrations**: Zoom OAuth, Google OAuth, Fireflies.ai (optional)

---

## What It Does

1. Each employee does a **60-second onboarding** (connect Zoom + Gmail)
2. They host meetings normally on their own Zoom account
3. Meeting ends → automatic pipeline:
   - Zoom webhook fires
   - System fetches AI summary (Zoom AI or Fireflies, you choose)
   - Gmail draft created in host's inbox — To: all participants
4. Employee sees the draft, reviews, hits send

**As admin you can:**
- Toggle summary source between Zoom AI and Fireflies
- Build rich email templates with drag-and-drop sections
- Assign templates to all users, a group, or specific individuals
- View all connected users + their connection status
- See full meeting history with draft status and summaries

---

## Step 1: Clone & Install

```bash
git clone <your-repo>
cd meetdraft
npm install
npm install -g vercel
vercel login
```

---

## Step 2: Create Neon Database (free)

1. Go to [neon.tech](https://neon.tech) → New Project
2. Copy the **Connection String** (looks like `postgresql://user:pass@host/db?sslmode=require`)
3. Save as `DATABASE_URL`

---

## Step 3: Create Zoom OAuth App

1. [marketplace.zoom.us](https://marketplace.zoom.us) → Develop → Build App → **OAuth**
2. Redirect URL: `https://YOUR_APP.vercel.app/api/auth/zoom/callback`
3. Scopes: `recording:read`, `meeting:read`
4. Features → Event Subscriptions:
   - Endpoint: `https://YOUR_APP.vercel.app/api/webhooks/zoom`
   - Event: `recording.completed`
   - Copy the **Secret Token**
5. Note **Client ID** and **Client Secret**

---

## Step 4: Create Google OAuth App

1. [console.cloud.google.com](https://console.cloud.google.com) → New Project
2. Enable **Gmail API**
3. Credentials → OAuth Client ID → Web Application
4. Redirect URI: `https://YOUR_APP.vercel.app/api/auth/google/callback`
5. OAuth Consent Screen → **Internal** (no verification needed for Workspace!)
6. Scope: `gmail.compose`
7. Note **Client ID** and **Client Secret**

---

## Step 5: Deploy to Vercel

```bash
# Set all environment variables
vercel env add ZOOM_CLIENT_ID
vercel env add ZOOM_CLIENT_SECRET
vercel env add ZOOM_WEBHOOK_SECRET
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
vercel env add DATABASE_URL
vercel env add APP_URL          # https://your-app.vercel.app
vercel env add ADMIN_SECRET     # choose any strong password

# Deploy
vercel --prod
```

After deploy, run the DB init:
```bash
vercel env pull .env.local
node scripts/init-db.js
```

---

## Step 6: Enable Zoom Cloud Recording

Each employee (or you as admin if Zoom Business):
- Zoom Settings → Recording → **Cloud Recording** ON
- Zoom Settings → Recording → **Audio transcript** ON
- *(For Zoom AI Summary)*: Zoom Settings → AI Companion → **Meeting Summary** ON

---

## Step 7: Onboard Employees

Send this message:

> "Hey team! We've set up automatic meeting summaries. Visit **[YOUR_APP_URL]**, connect your Zoom and Gmail — takes 60 seconds. After every meeting, you'll get a summary draft in your Gmail ready to send."

Optionally: if they use Fireflies, they can also add their Fireflies API key on the onboarding page.

---

## Admin Panel

Visit: `https://YOUR_APP.vercel.app/admin`

**Overview** — Stats: users, drafts created, errors, recent meetings

**Summary Source** — Toggle between Zoom AI and Fireflies (one click, instant)

**Users** — See all connected users, their Zoom/Gmail/Fireflies status, assign groups and templates

**Templates** — Build email templates with drag-and-drop sections:
  - Custom text (opening, closing)
  - Meeting Details block
  - Summary block
  - Action Items block
  - Next Steps block
  - Assign to: All users / Group / Specific users

**Meeting History** — Every meeting logged with summary, participants, draft status

---

## Template Placeholders (for subject line)

| Placeholder | Value |
|---|---|
| `{{meeting_topic}}` | Meeting title from Zoom |
| `{{meeting_date}}` | Date/time in IST |
| `{{host_email}}` | Host's email |

---

## Fireflies Setup (Optional)

Employees who use Fireflies:
1. Go to [app.fireflies.ai](https://app.fireflies.ai) → Settings → API → Copy API Key
2. On the onboarding success page, they can paste their Fireflies API key
3. When Fireflies is the active source, their meetings use Fireflies summaries
4. Others fall back to Zoom

---

## Free Tier Limits

| Service | Free Limit |
|---|---|
| Vercel | 100GB bandwidth, unlimited functions |
| Neon | 0.5GB storage, 190 compute hours/month |
| Zoom OAuth | Unlimited (your users' own accounts) |
| Google OAuth | Unlimited (Internal Workspace app) |
| Fireflies | User's own free/paid plan |

This setup comfortably handles teams of 50–100 people on free tiers.
