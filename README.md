# CallerCRM website

Marketing site, privacy policy and account-deletion page for CallerCRM (a CodeByAkshay product).
It uses plain HTML, CSS and JS, with no build step and no dependencies. It is hosted on GitHub Pages at **https://callercrm.codebyakshay.com**.

## Structure

```
index.html               Landing page
privacy/index.html       Privacy Policy          → /privacy/        (link this in Play Console)
delete-account/index.html Account deletion steps → /delete-account/ (Play "Delete account URL")
404.html                 GitHub Pages not-found page
assets/
  css/tokens.css         Colours, type sizes, spacing (the only place to change the brand look)
  css/base.css           Reset, typography, layout, scroll-reveal
  css/components.css     Buttons, pill, header/nav, footer
  css/mockups.css        Fake-app UI kit for the phone mockups (hero + product tour)
  css/home.css           Landing-page sections (hero, flow diagram, product tour, …)
  css/legal.css          Privacy / deletion page layout
  js/main.js             Header, mobile menu, reveal animations, hero demo, TOC highlight
  img/icons.svg          SVG icon sprite: <svg><use href="/assets/img/icons.svg#phone"/></svg>
  img/*.png              App icon in web sizes
CNAME                    Custom domain for GitHub Pages
.nojekyll                Serve files as-is (no Jekyll processing)
robots.txt, sitemap.xml  SEO
```

The header and footer markup is repeated in each HTML page (4 pages). If you change a nav link, change it in all of them:

```bash
grep -l 'class="site-header"' -r .
```

## App mockups: never use real screenshots

The phone graphics are HTML/CSS copies of the real screens with **made-up names and masked numbers**.
Real screenshots contain customers' names, phone numbers, emails and WhatsApp messages, so they must
never be published here. To show a new screen, copy one of the `<article class="spot">` blocks in
`index.html`, build the screen from the `.m-*` classes in `mockups.css`, and place numbered pins with
`<span class="pin" data-pin="1" style="--x:50%;--y:30%">1</span>` that match the `data-note` items.

## Preview locally

All paths are absolute (`/assets/...`), so use a local server rather than opening the file directly:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Deploy (GitHub Pages)

1. Create a GitHub repo (for example `callercrm-website`) and push this folder to `main`.
2. In the repo, go to **Settings → Pages → Source: Deploy from a branch → `main` / root**.
3. At your DNS provider for `codebyakshay.com`, add a **CNAME** record: `callercrm` → `<your-github-username>.github.io`.
4. Back in **Settings → Pages**, wait for the DNS check to pass, then tick **Enforce HTTPS**.

## Updating the privacy policy

- Edit `privacy/index.html` and change the **Effective** date in the header pill.
- Keep it true to what the app does. If the app starts collecting something new (a new permission, SDK or data field), update the "Data we collect", "Phone permissions" and "Sharing" sections, **and** the Play Console Data safety form.
- Retention promises (20 days for lead, call and WhatsApp data; 24–48 hours for agents who leave) also appear in `index.html` (Security + FAQ) and `delete-account/index.html`. Keep all three pages in sync.
