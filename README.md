# Sadece Senin İçin ❤️

An interactive, cinematic short film in four scenes. A glowing seed is planted with one touch, grown into a rosebud with five more, and brought into bloom by pressing and holding. Then a letter is typed out beneath the open rose.

All on-screen text is in Turkish. The site is plain HTML, CSS and vanilla JavaScript: no build step, no backend, no API keys.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure, meta tags for iPhone, accessibility labels |
| `style.css` | Ambient lighting, typography, ring, finale, reduced-motion rules |
| `script.js` | Scene logic, procedural 3D rose renderer, particles, Web Audio music |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | Rose favicon and home-screen icon |

## The four scenes

1. **Tohum (the seed).** Tap the glowing seed. A ripple runs out and the seed sinks to the ground.
2. **Büyüme (growing).** Each tap grows the plant: the stem lengthens, leaves unfold from bronze to green, and a rosebud forms inside its green sepals. This takes 5 taps, and each tap shows one of the messages.
3. **Açma (blooming).** Press and hold anywhere for about 4 seconds. The rose opens in real time, outer petals first. If you let go early, the progress pauses and waits for you.
4. **Açılış (the reveal).** A burst of petals, hearts and light, a warmer background, and the letter typed out character by character. A heart and the "Bir daha yaşayalım" replay button follow.

The rose is not an image. Every petal is a curved 3D surface: cupped, wrapped, with curled edges. Each one is projected and painted on the canvas every frame with its own gradients, shading, veins and contact shadows.

## Controls

- **Touch / mouse / pen:** tap to grow, press and hold to bloom.
- **Keyboard:** `Space` or `Enter` taps. In the bloom scene, hold either key down.
- **Music:** the ♪ button in the top corner. The music is a soft music-box and string-pad piece made live in the browser with the Web Audio API. There are no audio files, so there is nothing to license. On iPhone, the ringer/silent switch has to be on ring for sound.
- **Reduced motion:** if the device has "Reduce Motion" turned on, there are fewer particles and no parallax, and transitions are faster. The letter appears at once instead of being typed.

## Deploying to GitHub Pages

1. Create a new repository on GitHub, for example `sadece-senin-icin`.
2. Upload every file in this folder to the root of the repository. You can drag them into the web page ("Add file → Upload files"), or use git:
   ```bash
   git init
   git add .
   git commit -m "Sadece senin için"
   git branch -M main
   git remote add origin https://github.com/KULLANICI_ADIN/sadece-senin-icin.git
   git push -u origin main
   ```
3. In the repository go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose **main** and **/ (root)**, then **Save**.
5. Wait a minute or two. The site will be at `https://KULLANICI_ADIN.github.io/sadece-senin-icin/`.

All asset paths are relative, so the site works from a sub-path like this one with no changes.

### Try it locally first

Opening `index.html` directly works. A local server is closer to GitHub Pages:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Tips for the moment

- Open it on her iPhone in Safari. For a fully fullscreen experience, use **Share → Add to Home Screen** and launch it from the icon.
- Turn the volume up and tap ♪ before handing her the phone. The music starts after a tap, as browsers require.
- The font (Cormorant Garamond) loads from Google Fonts. Offline, an elegant system serif is used instead.

## Customising

All Turkish text lives in the `TEXT` object at the top of `script.js`. The hold length is `HOLD_SECONDS`, and the petal layers are in `LAYERS` if you want a fuller or wilder bloom.
