# Pi Web Glassmorphism Theme

This Pi package ports the frosted-glass layer from `dsh-material3-theme` to
Pi Web. It adds translucent Material 3 surfaces, backdrop blur, a local or
HTTP wallpaper, and a browser-local wallpaper control panel.

Install it from Pi Web's **Plugins** panel with:

```text
npm:@agegr/pi-web-glassmorphism-theme
```

The package uses Pi's normal `themes` entry for package discovery and the
`piWeb` manifest for browser resources. Pi Web only loads those browser
resources while the package is enabled.

Wallpaper files are kept in the browser's IndexedDB. URLs are stored in
localStorage and are only loaded by the browser; the package does not upload
wallpaper data to the Pi server.
