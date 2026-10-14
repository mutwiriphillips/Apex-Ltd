# Photography slots

The homepage shows designed sport-themed panels until you add real photos.
To add one: put the file in this folder and list it in `manifest.json`:

```json
{
  "hero":       { "src": "/assets/img/hero.webp", "alt": "Kenyan footballer sprinting down the wing" },
  "football":   { "src": "/assets/img/football.webp", "alt": "..." },
  "rugby":      { "src": "/assets/img/rugby.webp", "alt": "..." },
  "basketball": { "src": "/assets/img/basketball.webp", "alt": "..." },
  "efootball":  { "src": "/assets/img/efootball.webp", "alt": "..." },
  "management": { "src": "/assets/img/management.webp", "alt": "..." },
  "founder":    { "src": "/assets/img/founder.webp", "alt": "Ray Phillips Mutwiri" }
}
```

Optional per entry: `"srcset"` and `"sizes"` for responsive widths.

Recommended crops (WebP or AVIF, under ~250 KB each):
hero 1200x1500 portrait (shown 4:5 on desktop, 16:11 on mobile, keep the athlete centred) ·
sport cards 800x1000 portrait · management 1200x960 · founder 800x1000.

Use only photos you own or have licensed. Never use generated or stock images to
represent a real registered athlete. Athlete photos need a backend upload feature (see README).
