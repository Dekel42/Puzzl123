# Puzzl123 — Crossword Solver MVP

A mobile-first, single-page web app that uses your phone camera to scan a crossword puzzle and overlay the answers as an AR layer on top of the captured image.

Live: **https://puzzl123.web.app**

---

## What it does

1. **Camera view** — opens the rear camera in full-screen when the page loads.
2. **Scan** — tap the SCAN button to freeze a frame of the puzzle.
3. **Processing** — a 3-second overlay simulates an AI call (ad placement slot included).
4. **Solution view** — the captured image is shown with answer labels overlaid at their correct grid positions.
5. **Toggle** — switch freely between the live camera and the solution view using the button at the bottom.

> Answers are currently hardcoded mock data. The processing overlay and Firebase config are ready for a real AI/OCR backend to be wired in.

---

## Project structure

```
Puzzl123/
├── index.html       # Entire app — UI, logic, Firebase config placeholder
├── firebase.json    # Firebase Hosting config
├── .firebaserc      # Firebase project binding (puzzl123)
└── .gitignore
```

No build step, no dependencies. Everything runs directly in the browser.

---

## Firebase accounts & projects

| Account | Project ID | App |
|---|---|---|
| `omerdekelmigdal100@gmail.com` | `puzzl123` | **This app** |
| `omer.dekel.42@gmail.com` | `signals42a` | Signals (separate app) |
| `daklon100@gmail.com` | *(rainbow project)* | Rainbow (separate app) |

---

## How to deploy

Make sure you are in this project's directory, then run:

```bash
firebase deploy --only hosting --account omerdekelmigdal100@gmail.com
```

Or explicitly, from any directory:

```bash
firebase deploy --only hosting --project puzzl123 --account omerdekelmigdal100@gmail.com
```

### First-time setup

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Log in to the correct account:
   ```bash
   firebase login:add
   # sign in as omerdekelmigdal100@gmail.com in the browser
   ```

3. Deploy (command above).

---

## Wiring up real Firebase features

Open `index.html` and find the `firebaseConfig` block near the bottom. Replace the remaining placeholders:

```js
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",       // ← from Firebase Console
  ...
  messagingSenderId: "YOUR_SENDER_ID",     // ← from Firebase Console
  appId:             "YOUR_APP_ID"         // ← from Firebase Console
};
```

Then uncomment the two `import` / `initializeApp` lines below it.

Find your config values at:
**Firebase Console → Project settings → Your apps → SDK setup and configuration**

---

## GitHub

Repository: **https://github.com/Dekel42/Puzzl123**

After any change, commit and push:

```bash
git add .
git commit -m "your message"
git push
```
