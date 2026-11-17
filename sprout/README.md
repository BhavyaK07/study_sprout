# Sprout

Plans your free time around classes or work, fits in study blocks and personal goals, and fills your Google Calendar. It runs entirely in the browser: you sign in with Google, your plan is saved in a private app folder in your Google Drive, and calendar changes go straight to Google Calendar. No server, no subscription.

## Try it first, without signing in

From this folder:

```sh
python -m http.server 8080
```

Open <http://localhost:8080/?demo>. Demo mode uses made-up calendars stored in your browser, so you can go through the survey and see the app before any setup.

## Files

| File | What it is |
|---|---|
| `index.html`, `app.css` | The page and its styling |
| `app.js` | Sign-in, saved data, the planner, calendar filling |
| `ui.js` | The screens: survey, Today, Week, Stats, Setup |
| `demo.js` | The pretend Google account used at `?demo` |
| `config.js` | Your Google sign-in ID (the one thing you fill in) |
| `manifest.webmanifest`, `sw.js`, icons | Let you add it to your phone's home screen |

## 1. Create the Google sign-in ID (about 10 minutes, free)

Use your **personal** Google account.

1. Go to <https://console.cloud.google.com/>, open the project picker, and choose **New project**. Name it `Sprout`.
2. Open **APIs & Services → Library** and enable **Google Calendar API** and **Google Drive API**.
3. Open **Google Auth Platform** (also called **OAuth consent screen**) and click **Get started**:
   - App name `Sprout`, support email: yours.
   - Audience: **External**.
   - Contact email: yours. Finish.
4. In **Audience → Test users**, add every Google address that will sign in: your personal one, and your work one if you want Sprout to see your work calendar.
5. In **Clients**, click **Create client**:
   - Application type: **Web application**
   - **Authorized redirect URIs**: add the address where Sprout will live, exactly, including the final slash. Add both:
     - `http://localhost:8080/`
     - `https://YOUR-GITHUB-USERNAME.github.io/sprout/`
   - Leave "Authorized JavaScript origins" empty. Create.
6. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) into `config.js`:

   ```js
   window.SPROUT_CONFIG = { googleClientId: 'PASTE-IT-HERE' };
   ```

   Do not download or paste the client secret. Sprout does not use one.

If you open Sprout before doing this, it shows the exact redirect address to use for wherever it is running.

The app stays in Google's "Testing" mode, which is fine for personal use. Google shows an "unverified app" warning at sign-in: click **Continue**. Leave every permission box ticked. In Testing mode Google also asks you to sign in again about once a week.

Sprout asks for these permissions:

| Permission | Why |
|---|---|
| See your calendar list | To show your calendars so you can choose |
| See and edit events | To read busy time and add your plan (main account only) |
| See events (read-only) | For any extra account you connect, such as work |
| Its own app folder in Drive | To save your plan. It cannot see your other files |

## 2. Run it on your computer

```sh
python -m http.server 8080
```

Open <http://localhost:8080> and sign in.

## 3. Put it online (GitHub Pages, free)

1. Create a public repository on GitHub named `sprout` and upload these files.
2. In the repository open **Settings → Pages**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, and save.
3. After a minute it is live at `https://YOUR-GITHUB-USERNAME.github.io/sprout/`. That address must match a redirect URI from step 1.

## 4. Add it to your iPhone

Open the link in **Safari**, tap **Share**, then **Add to Home Screen**. Sign in once inside the home-screen app; it keeps its own sign-in, separate from Safari.

## Personal and work calendars

Sign in with your personal account: that is where Sprout adds your plan. Then in **Setup → Calendars and accounts**, tap **Connect another Google account** and choose your work account. Sprout only asks Google for permission to *look at* that account, so it cannot change your work calendar even by mistake.

If your company blocks outside apps, the work sign-in will be refused. In that case share the work calendar to your personal account instead (Google Calendar → Settings → your calendar → Share with specific people → "See all event details"), and it will appear under your personal account.

## Staying motivated

- **XP and levels.** Checking off a block earns 10 XP, a fully finished day earns 25 more, and focus sessions earn a point a minute. Levels run from Seed to Forest.
- **Daily quests.** Three small targets each day, picked from what is on your plan. Finishing all three earns a bonus.
- **A forgiving streak.** Doing at least one thing in a day keeps your streak; you do not have to finish everything. Fully finished days still earn bonus XP and a flower.
- **Streak freezes.** Every 7-day streak earns a freeze (you can hold two). If a whole day goes by with nothing checked off, a freeze is used automatically and your streak carries on.
- **Moving blocks.** On a wide screen, drag a block in the Week view to a new time or day. On a phone, tap the clock next to a block. Sprout asks whether to move just that one or every future one, and updates your calendar.
- **Your garden.** The last four weeks as a grid: a flower for each fully finished day.

## The Study tab

Shown for students (and "both"). It has:

- **Today's queue.** What to study today and for how long, picked for you. Topics come back on their own: rate a session low and it returns tomorrow, rate it high and it waits longer each time. Courses with a deadline close, or that you rate shaky, move up and get more weekly study time in your calendar.
- **Deadlines.** Exams and due dates found in your main account's calendars (event titles containing words like "due", "exam", "midterm", "quiz", "assignment"), plus assignments you add yourself.
- **Focus timer.** Each session is tagged to a course and topic, earns XP, and asks you to rate your confidence from 1 to 5 afterwards.
- **Explain-it coach.** Tap the microphone next to a topic and explain it out loud. The coach corrects mistakes and asks follow-up questions.

The coach uses Google's Gemini with your own free key:

1. Open <https://aistudio.google.com/apikey>, sign in, and create an API key.
2. In Sprout, go to **Setup → Explain-it coach** and paste it.

The key is stored on that device only (add it again on your phone). What you say or type is sent to Google; on the free plan Google may use it to improve its models. To use a different Gemini model, set `geminiModel` in `config.js`.

## What to know

- Sprout updates your calendar while it is open on some device: when you open it, every two minutes while it stays open, and right after any change.
- Google sign-ins last about an hour. Sprout renews them by itself when you open it; if Google refuses, it shows a **Reconnect** button.
- Sprout only ever moves or deletes events it created. They carry a private tag in Google Calendar so it can tell them apart from yours.
- After every update Sprout reads your calendar back and counts its events, so "In sync" means they are really there.
- **Setup → Calendar updates → Remove Sprout's events** deletes every upcoming Sprout event and pauses filling.
