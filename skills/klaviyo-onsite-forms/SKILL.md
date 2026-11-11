---
name: klaviyo-onsite-forms
description: >
  Use this skill when someone with Klaviyo on a Vercel Shop or other headless storefront wants a
  Klaviyo signup form on it: "add a popup to my store", "create a Klaviyo flyout for 10% off",
  "change the popup copy", "publish the signup form", "take the popup down", or "why isn't my popup
  showing". Covers creating a popup, flyout, full-screen, banner or embedded form from an existing
  one, targeting it to only this storefront's hosts so other sites on the same Klaviyo account are
  untouched, editing its draft, publishing and unpublishing it, and checking it renders. Needs
  klaviyo.js already on the site, which klaviyo-vercel-shop adds.
disable-model-invocation: true
---

# Klaviyo onsite forms for a Vercel Shop storefront

This skill builds and manages Klaviyo onsite forms (popups, flyouts, full-screen forms, banners and embeds) for one storefront, from the terminal. The forms need no storefront code: `klaviyo.js` renders a form once it's live and its targeting matches the page, and Vercel Shop's Klaviyo integration tells `klaviyo.js` about client-side navigation so targeting re-evaluates without a reload.

A Klaviyo account is often shared with another storefront for the same Shopify store, such as the Shopify theme it's replacing. So this skill owns only forms named `Vercel Shop - <purpose>`, gives every version of every form a URL allow list naming only this storefront's hosts, and treats every other form as read-only.

Ask before creating, publishing, unpublishing or deleting anything: a published form shows to real shoppers.

## Step 0 — Check what's there

1. **`klaviyo.js` is on the storefront.** In Vercel Shop, `lib/klaviyo/client.ts` exists and `analytics.klaviyo.isEnabled` is on. If not, apply `klaviyo-vercel-shop` first: without it a form can be published but never renders.
2. **The Klaviyo MCP server is connected** (`https://mcp.klaviyo.com/mcp`). Its `get_forms`, `get_form`, `create_form` and `delete_form` tools read forms, create drafts and delete them.
3. **A private key for editing and publishing, if needed.** Changing an existing form and publishing go through the REST API, which needs a private key with `forms:read` and `forms:write`. Ask the user to `export KLAVIYO_API_KEY=...` in their own shell. Never take it in the chat, and never put it in `.env` files the storefront reads, the Vercel project or a commit. Without one, the user can edit and publish the draft in Klaviyo's form editor instead.

## Step 1 — Ask

Ask these together:

1. **What form?** Type (popup, flyout, full screen, banner, embed), offer, copy, when it shows (delay, scroll, exit intent) and on which pages.
2. **Which hosts does the storefront run on?** Usually `localhost`, `127.0.0.1`, the `.vercel.app` production domain and any custom domain. These go in every form's targeting. If the public key has a domain allowlist, each host must be on it too, or the form displays but doesn't submit.
3. **Which list do signups join?** Suggest the storefront's signup list (`NEXT_PUBLIC_KLAVIYO_LIST_ID`), so form signups get the same welcome flow as the footer form.

## Step 2 — Create the form as a draft

Don't write a form definition from scratch: it has many required fields. Start from a working one.

1. Call `get_forms`, pick a form of the type the user wants, preferably a simple one (a text block, an email field, a submit button and a success step), and call `get_form` on it. Save its output as `source.json`.
2. Make a clean draft from it:

   ```bash
   node <skill-dir>/scripts/forms.mjs prepare source.json \
     --name "Vercel Shop - <purpose>" \
     --hosts localhost,127.0.0.1,<project>.vercel.app \
     --out new-form.json
   ```

   This strips every `id`, drops each version's name, status, A/B setting and teasers, and replaces each version's URL targeting with only these hosts. The source form is untouched.
3. Edit `new-form.json` as the user asked, following `references/form-definition.md`: the copy, styles and images, the submit button's list, and the trigger.
4. Check the targeting again, then call `create_form` with the file's `name`, `status` (`draft`), `ab_test` (`false`) and `definition`:

   ```bash
   node <skill-dir>/scripts/forms.mjs check new-form.json --hosts localhost,127.0.0.1,<project>.vercel.app
   ```

Forms are always created as drafts. Tell the user its ID and that they can preview it in Klaviyo's form editor.

## Step 3 — Edit a form

Updating replaces the whole definition and changes only draft versions. A published form keeps a draft next to its live version, so edit the draft and publish again; the live version stays up until then.

```bash
node <skill-dir>/scripts/forms.mjs get <form-id> --out form.json
# edit only the draft versions in form.json
node <skill-dir>/scripts/forms.mjs update <form-id> --file form.json --hosts localhost,127.0.0.1,<project>.vercel.app
```

`update` refuses (exit 3) a form without the `Vercel Shop - ` prefix, a changed live version, an added or removed version, a missing version ID, or targeting outside the hosts. If it reports that the form changed since it was read, run `get` again, reapply the change and retry.

## Step 4 — Publish or take it down

Ask the user first. Publishing replaces the live version with the draft and shows it to shoppers.

```bash
node <skill-dir>/scripts/forms.mjs publish <form-id> --hosts localhost,127.0.0.1,<project>.vercel.app
node <skill-dir>/scripts/forms.mjs unpublish <form-id>
```

`publish` checks the prefix and that every version targets only these hosts, then waits until the form is live. A `400` explains what blocks publishing. A `409` means the form has an A/B test, which only Klaviyo's form editor can manage. To delete a form, unpublish it, then call `delete_form`.

## Step 5 — Check it renders

1. Open the storefront in a private window: Klaviyo hides forms from identified profiles, and from visitors who already submitted or closed them.
2. Wait for the trigger (the delay, scroll or exit intent). Changes can take a minute or two to reach Klaviyo's form cache.
3. Navigate client-side to a page the targeting excludes, and check that the form doesn't appear there.
4. Submit a new test address on a domain the user controls. The profile joins the list, and the form's submits show up in `query_form_values`.

If it doesn't render, read `references/troubleshooting.md`.

## Pitfalls

- **A form with no URL allow list.** It shows on every site that uses the account, including a live Shopify theme. `prepare`, `update` and `publish` enforce one on every version; don't publish another way to get around it.
- **Editing someone else's form.** Forms without the `Vercel Shop - ` prefix belong to another storefront or team. Read them, copy them, never change them.
- **Changing an image without clearing `asset_id`.** Klaviyo keeps showing the library image. Set `src` and clear `asset_id` together.
- **An empty row.** Removing every block from a row leaves an invalid definition. Remove the row.
- **A second `klaviyo.js`.** Forms on a page with two copies lose their state. Load it only through the storefront's integration.
- **A private key in the storefront.** It's for the developer's shell only. Anything the storefront needs works with the public key.

## Reference files

- `references/form-definition.md`: the parts of a form definition you'll edit, and the fields create rejects
- `references/troubleshooting.md`: why a form doesn't show, doesn't submit, or won't publish
- `scripts/forms.mjs`: prepare, check, get, update, publish and unpublish, with the prefix and targeting guards
