# TerminalDeck film: web media

Encoded 2026-09-30 from the Remotion masters in `hype-video/out/` (1920x1080 at 60 fps, 80 s; sources were not newer than the renders). All files probe correctly and decode fully with ffmpeg with no errors. MP4s use faststart (moov first).

| File | Size | Duration | Streams |
|---|---|---|---|
| terminaldeck-film.mp4 | 23.9 MB | 80.0 s | H.264 High 1920x1080 60 fps, 2-pass ~2.2 Mb/s; AAC 160k |
| terminaldeck-film-720.mp4 | 9.7 MB | 80.0 s | H.264 1280x720 30 fps, 2-pass ~850 kb/s; AAC 112k |
| terminaldeck-film.webm | 21.4 MB | 80.0 s | VP9 1920x1080 60 fps, 2-pass ~2.0 Mb/s; Opus 128k |
| terminaldeck-film-vertical.mp4 | 23.9 MB | 80.0 s | H.264 1080x1920 60 fps, 2-pass ~2.2 Mb/s; AAC 160k |
| teaser.mp4 | 3.5 MB | 15.0 s | H.264 1920x1080 60 fps, muted, seamless loop |
| teaser.webm | 3.4 MB | 15.0 s | VP9 1920x1080 60 fps, muted, seamless loop |
| poster.jpg | 160 KB | - | 1920x1080 JPEG q85 (Poster comp) |
| og-image.png | 861 KB | - | 1200x630 PNG (OgImage comp) |

Suggested markup:

```html
<video controls playsinline preload="metadata" poster="/media/poster.jpg">
  <source src="/media/terminaldeck-film.webm" type="video/webm">
  <source src="/media/terminaldeck-film.mp4" type="video/mp4">
</video>
<video autoplay muted loop playsinline poster="/media/poster.jpg">
  <source src="/media/teaser.webm" type="video/webm">
  <source src="/media/teaser.mp4" type="video/mp4">
</video>
```

To rebuild, run the scripts in `hype-video/package.json` (`render`, `render:vertical`, `render:teaser`, `poster`, `og`), then run the two-pass ffmpeg encodes again.
