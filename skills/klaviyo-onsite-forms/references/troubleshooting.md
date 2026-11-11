# Troubleshooting Klaviyo onsite forms on a headless storefront

Klaviyo onsite forms are rendered by `klaviyo.js` in the shopper's browser. When one doesn't show, check in this order: is `klaviyo.js` loaded, is the form live, does its targeting match this visitor and page, and is anything blocking it.

| Symptom | Likely cause | Fix |
|---|---|---|
| No form, and no `klaviyo.js` in the Network tab | Klaviyo isn't on the storefront, or consent hasn't been granted | Apply `klaviyo-vercel-shop`; accept the consent banner |
| `klaviyo.js` loads, but no form | The form is a draft | Publish it (with the user's approval) |
| Live, but not shown to you | You're identified, or you already submitted or closed it | Use a private window |
| Live, but not on this host | The `url_patterns` allow list doesn't include it | Add the host and publish again |
| Live, but not after client-side navigation | `PAGE_CHANGE` isn't reaching `klaviyo.js` | In Vercel Shop, check `components/analytics/klaviyo-client.tsx` is unchanged |
| Shows only after a long time | The trigger is a long delay, deep scroll or exit intent | Check `triggers` |
| Changes don't appear | Klaviyo's form cache, or the draft wasn't published | Wait a couple of minutes; publish the draft |
| Form renders unstyled, or not at all, with console errors | A Content Security Policy blocks `static-tracking.klaviyo.com` or the form's fonts and images | Allow Klaviyo's hosts in the CSP |
| Submit fails with `403` | The public key's domain allowlist doesn't include this host | The user adds it in Klaviyo (Settings, API keys) |
| Submit works, but the profile isn't on the list | The list uses double opt-in, or the button points at another list | Check the inbox; check the button's `list_id` |
| Form shows on another site that uses the same account | A version has no allow list, or one that matches too much | Unpublish, fix the targeting with `forms.mjs check`, publish again |
| `create_form` rejects the definition | An `id`, a version `name`, `status` or `ab_test`, or an empty row | Run `forms.mjs prepare` again, and remove empty rows |
| `update` exits 3 | A guard: wrong prefix, changed live version, version count or IDs, targeting, or the form changed since it was read | The message says which; for a changed form, `get` again and reapply |
| `publish` returns `400` | Something in the draft blocks publishing | Klaviyo's message names it |
| `publish` or `unpublish` returns `409` | The form has an A/B test | Only Klaviyo's form editor can manage it |
| `401` or `403` from the REST API | `KLAVIYO_API_KEY` is unset, wrong, or lacks `forms:read` and `forms:write` | The user makes a key with those scopes and exports it in their shell |
