# Content Security Policy hosts for Klaviyo on Vercel Shop

Stock Vercel Shop sets no Content Security Policy, so this file only matters if the storefront has added one, in `next.config.ts`, a proxy or middleware, or a `<meta>` tag. With a CSP that doesn't allow Klaviyo, `klaviyo.js` fails to load or loads without its forms, and the browser console shows the blocked host.

Add these to the existing directives. No `'unsafe-inline'` script exception is needed, because `lib/klaviyo/client.ts` builds Klaviyo's call queue from bundled code instead of the usual inline snippet.

| Directive | Hosts |
|---|---|
| `script-src` | `https://static.klaviyo.com https://static-tracking.klaviyo.com` |
| `connect-src` | `https://a.klaviyo.com https://fast.a.klaviyo.com https://static-forms.klaviyo.com` |
| `style-src` | `https://static-tracking.klaviyo.com https://fonts.googleapis.com` |
| `font-src` | `https://fonts.gstatic.com` |
| `img-src` | `https://d3k81ch9hvuctc.cloudfront.net` |

Klaviyo's forms can also load images and fonts that the user uploads in the form editor, so if a published form shows broken images, check the console for the blocked host and add it.

Check Klaviyo's current guidance on Content Security Policy before shipping. A blocked `static-tracking.klaviyo.com` is the usual reason forms stop rendering while events still arrive.
