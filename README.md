<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your NovelTranslator app

This project now uses a server-side Gemini proxy so your API key stays on the server in local dev and on Vercel.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `GEMINI_API_KEY` in [.env.local](.env.local)
3. Run the app:
   `npm run dev`

## Deploy on Vercel

1. Push the repo to GitHub
2. Import the repo in Vercel
3. Add `GEMINI_API_KEY` in Project Settings -> Environment Variables
4. Deploy

Important:
- Keep `GEMINI_API_KEY` only in server-side environment variables
- Do not expose it through Vite `define`, `VITE_*`, or client-side code
