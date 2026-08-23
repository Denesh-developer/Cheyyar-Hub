Cheyyar Hub identity badge fix

Replace:
  src/App.jsx
  src/App.css

Developer UID is hard-coded as fallback:
TtgTvNZ0XXRdem1B2bn1hXA4tzs2

Behavior:
- Developer: orange/amber shield DEV badge, no orange verified tick.
- Verified users: orange circular check.
- Verified check is shown beside the display name and username/handle wherever user identity is displayed.

After replacing files:
1. Stop Vite (Ctrl+C)
2. npm run dev
3. Browser Ctrl+Shift+R
