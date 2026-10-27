# CyberPath — From Zero to Cybersecurity

A no-build learning website for complete beginners. It includes 48 lessons in 9 phases, practical exercises, quizzes, and browser-based progress tracking.

## Open the course

Double-clicking **`index.html`** opens the full reading, practical work, quizzes, and progress tracking. No package installation or build command is needed. For **inline video playback**, use the local server because YouTube blocks embedded players on `file://` pages.

Open a terminal in the project folder and run:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765/ in your browser. Stop the server later with Ctrl+C.

When opened directly from disk, lessons show a video thumbnail and direct YouTube link instead of a broken player. Videos, Google Fonts, and external resource links need an internet connection; system fonts are used if Google Fonts is unavailable.

**Choose one opening method and keep using it.** Browser storage for `file://` and `http://127.0.0.1:8765` is separate. Use **Save backup** before switching, then **Restore backup** at the new location.

## How to study

- Aim for up to **1 hour a day**, usually one or two lessons. The cards number lessons, not days.
- Follow the phases in order because later practical steps use earlier skills.
- Most lessons take 20–30 minutes. VM setup, downloads, and external labs can take an hour or more; taking longer is expected.
- Each lesson follows: analogy → selected video → read → three practical steps → three quiz questions.
- Every lesson has its own beginner video with the title, channel, duration, and verification date displayed below the player. Use the YouTube fallback if an embed cannot play.
- To complete a lesson, tick all three practical steps and score at least **2/3** in the quiz. Retries have no penalty.
- **Continue** returns to your unfinished lesson when possible, otherwise it finds the next incomplete lesson.

Lesson 16 recommends **Ubuntu Desktop in a virtual machine** because later commands, logs, and graphical tools are written for that route. Read its resource checklist before installing anything. WSL and macOS terminals are not identical substitutes.

Required practical work runs against **localhost inside your own practice VM**. No external platform account, paid room, or remote target is required to complete a lesson. TryHackMe, Hack The Box, and PortSwigger rooms are clearly labeled optional extensions; when using them, stay inside their supplied lab targets and rules.

## Progress and backups

Progress, practical ticks, and quiz scores save automatically in this browser using `localStorage`.

- **Save backup** downloads a JSON progress file with a format version and export date.
- **Restore backup** validates and imports that file. It asks before replacing existing completed lessons.
- **Reset** deletes current progress after confirmation. Save a backup first if you may want it later.
- If saved data is malformed, CyberPath preserves a recovery copy where browser storage is available and shows a warning instead of failing with an empty roadmap.

Clearing browser site data or using private browsing can remove progress. Keep a backup if the work matters to you.

## The path

0. How Computers Actually Work
1. Using a Computer Like a Pro
2. Networking
3. Linux
4. How the Web Works
5. Cybersecurity Fundamentals
6. Defensive Security (Blue Team)
7. Pen Testing (guided labs only)
8. Reverse Engineering & Next Steps

**Golden rule:** only practise security testing on systems you own or labs that explicitly authorise it, and stay within their instructions and scope. Platform room availability and pricing can change; use the official links in the lessons and check before starting.

## Development checks

The website has no runtime dependencies or build step. The tests use Node.js's built-in test runner; Node.js 20 or newer is recommended.

```bash
npm test
```

The tests validate lesson structure, the complete 48-video catalog, quiz answer indexes and displayed answer positions, resource URLs, practical-step markup, full-content search, backup normalisation, and that required labs do not depend on external accounts. No `npm install` is required.

Run the network-dependent external check separately:

```bash
npm run test:external
```

It verifies every resource URL and every selected video through YouTube's oEmbed endpoint. Sites that deliberately block automated requests are reported as warnings for manual verification. The last full check was completed on **2026-10-27**, when all 48 videos were public, unrestricted, and permitted embedding.
