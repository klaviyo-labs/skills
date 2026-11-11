# Klaviyo form definitions: what to edit

A form's `definition` is the whole form: a list of `versions` (one per A/B variant, usually one), each with `steps` made of `rows` of `blocks`, plus `triggers`, `styles` and `properties`. This file covers the parts you change when adapting a copied form. Klaviyo's Forms API reference (Create Form and Update Form) has the full schema, at revision `2026-10-15`.

## Fields create rejects

Create Form rejects every `id` in the definition ("Not allowed on create"), and each version takes its name, status and A/B setting from the form. `scripts/forms.mjs prepare` removes them. Other `name` keys stay, such as `$source` in a button's `additional_fields`.

The form itself is created with `"status": "draft"` and `"ab_test": false`.

## Versions

| Field | What it does | When to change it |
|---|---|---|
| `type` | `popup`, `flyout`, `full_screen`, `banner` or `embed` | Pick a source form of the right type instead; the styles depend on it |
| `location` | Where a flyout or banner sits on the page | When the user asks |
| `triggers` | When and where the form shows | Always, for URL targeting; see below |
| `teasers` | The small tab that reopens a closed form | `prepare` drops them; add one back only if asked |
| `specialties` | `BACK_IN_STOCK` for a back-in-stock form | Leave it alone |
| `properties.show_close_button`, `click_outside_to_close` | How the shopper closes it | When the user asks |

## Triggers

`triggers` is a list, and by default the form shows when any of them matches (`properties.rule_based_trigger_evaluation`: `any` or `all`). The common ones:

```json
{ "type": "delay", "properties": { "seconds": 5 } }
{ "type": "scroll_percentage", "properties": { "percentage": 30 } }
{ "type": "unidentified_profiles" }
{ "type": "url_patterns", "properties": { "allow_list": ["*localhost*", "*127.0.0.1*", "*my-shop.vercel.app*"] } }
```

Every version keeps exactly one `url_patterns` trigger whose `allow_list` names only this storefront's hosts, as `*<host>*`. To limit the form to some pages, add a `deny_list` to the same trigger (`"*/account*"`) rather than adding hosts or paths to the allow list, so the host check still holds. `scripts/forms.mjs check` fails on any allow-list entry that isn't one of the hosts.

## Steps, rows and blocks

A step is one screen: usually a signup step and a success step. Each step has `rows`, and each row has `blocks`, each with a `type`: `html_text`, `image`, `email`, `phone_number`, `text` (a text input field), `button`, and so on.

- **Copy:** `html_text` blocks hold their copy as HTML in `properties.content`. Change the words and keep the markup.
- **Inputs:** an input's `properties.placeholder`, `label` and `error_messages` are its copy. Leave `property_name` alone: it's the profile property the input fills.
- **Images:** an `image` block's `properties.image` has `src`, `alt_text` and `asset_id`. Set `src` to the new image URL and clear `asset_id`, or Klaviyo keeps showing the image library asset.
- **The list:** a button's `action` (`next_step`, `close` and the other submitting actions) has `properties.list_id`, the list signups join. Set it on every submitting button to the list the user chose.
- **Removing a step:** drop an SMS or extra step from `steps`, and update any button whose action points at it.
- **Removing a block:** a row with no blocks is invalid, so remove the row too.

## Editing an existing form

Update Form replaces the whole definition and edits only draft versions. Keep every version, in order, with its `id`. Return live versions exactly as `get` returned them, and change only the draft. `scripts/forms.mjs update` checks all of this before sending.
