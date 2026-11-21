## Deploy to Netlify

1. Push this repo to GitHub.
2. In Netlify: **Add new site → Import an existing project →** pick the repo.
3. Leave **Build command** empty. **Publish directory** is `.` (it's already set in `netlify.toml`).
4. Click **Deploy**. Your site is live at `https://<name>.netlify.app`, with HTTPS, so the camera works.

No-Git option: `npx netlify-cli deploy --dir=. --prod`, or drag the folder onto https://app.netlify.com/drop.
