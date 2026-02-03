# Wordle Clone (Power-Ups Mode) - MVP

This repository contains an initial MVP of a Wordle-like game with core gameplay implemented in vanilla JavaScript. The project focuses on the essential gameplay loop, input validation, duplicate-letter handling, daily puzzle selection, animations, and persistence.

## What is included
- `index.html` - main HTML file
- `styles.css` - styles and animations
- `app.js` - core game logic and UI interactions
- `words/answers.json` - sample answer pool (replace with a 2k-3k list for production)
- `words/valid-guesses.json` - sample valid-guess dictionary (create or replace with a 10k-12k list)

## Run locally
1. Open `index.html` in a browser (Chrome, Firefox, Safari, Edge).
2. For production use a simple HTTP server (some browsers block local fetch of JSON files)
   - e.g., `npx http-server` or `python -m http.server` in this folder

## Next steps (recommended)
- Add full word lists (replace `words/*.json` with full datasets)
- Implement power-ups UI and logic (Hint / Swap / Skip) — reveals a correct letter, swap two letters in the active row, or eliminate an incorrect alphabet letter respectively (max 2 power-ups per game)
- Add statistics and share functionality
- Add settings, accessibility options, and dark mode
- Add unit tests

## Notes on daily word selection
The app uses a fixed epoch (Jan 1, 2022) and selects the answer by days since epoch modulo the length of `answers.json`. Ensure list length is stable for consistent puzzle numbers.

---

Feel free to ask for additions (power-ups, statistics, deployment scripts, tests) and I will continue building the features iteratively.