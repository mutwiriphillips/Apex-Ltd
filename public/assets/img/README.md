# Imagery

This folder is intentionally empty. The homepage photo slots (hero, sports, track,
stadium, etc.) fall back to the designed vector panels when no `/assets/imagery.json` is
present, so nothing is broken or blurry.

The earlier placeholder photos were low resolution (about 500 px, stretched to
full width) and were removed. To add imagery later:

1. Use only high-quality photography you have the rights to (1600 px wide or more,
   WebP/AVIF, under about 250 KB each). Never use generated images to represent real
   registered athletes.
2. Put the files here and add a `public/assets/imagery.json` mapping a slot key to
   `{ "src": "/assets/img/<file>", "alt": "...", "pos": "50% 50%" }`.
   Keys: hero, football, rugby, basketball, efootball, track, tower, stadium, roof.
   Add a `founder` key only with a real, consented photo.
3. Delete a key to fall back to the designed panel for that slot.

Athlete profile photos are separate: athletes upload them from their account and
staff approve them before they appear.
