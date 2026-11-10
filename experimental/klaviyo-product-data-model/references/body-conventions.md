# Body conventions

The Klaviyo tools have typed input schemas. Use them for what is valid: field names, enums, required keys. This file does not repeat them. It covers what a schema cannot say: which of the many valid shapes to choose, and the contents of the two payloads the schemas leave free-form.

Every call also needs `model` set to the model you are running as.

## Names and numbering

- `{NAME}` is the spec's `name`, `{KEY_FIELD}` is `key_field`, and `{KEY}` is one business's value for it.
- **Property IDs follow field order.** The first field is property 1, the second is 2, and so on. Use the same number in the schema, the source mapping and every segment condition. Never renumber.
- External IDs are `{NAME}:business:{KEY}` for a business profile and `{NAME}:seat:{email lowercased}` for a seat. They cannot be changed once set.

## Object type and source mapping

- Create the schema as a **draft**, with `required` from the spec (field names, not property IDs). Activation is a separate step and cannot be undone.
- Give each property `id`, `name` and `type` from the spec's field. If the field has a `description`, carry it into the property. If it has none, leave `description` out.
- Give each property a `simple` property mapping with `id_path: "$.id"` and `data_path: "$['object_record']['<field name>']"`, using the data source's ID as `source_id`.
- The profile link is one relationship, named `profile`, mapped as `type: "profile"` with `id_path: "$.id"` and one related-ID path: `identifier_type: "external-id"`, `path: "$['relationships']['profile'][*]['external_id']"`. Link by external ID only, which is what this skill was tested with.
- Get the relationship ID from `meta.relationship_id` on the profile object schema, not from the Klaviyo UI.
- Before you activate, run section C of `checklist.md`.

## Profiles

- A business profile has `external_id` and no email. Its properties are the marker, `profile_kind: "business"`, and `{KEY_FIELD}: {KEY}`, plus anything in `business_profile.properties`.
- With `business_profile.has_email`, the business profile also gets `email` set to the business's `owner_email`, in the same create call. Never add an email to a business profile that already exists, and never use a seat's address.
- A seat profile has `email`, `external_id`, and properties `profile_kind: "seat"`, then `seat_defaults`, then the seat's own properties. If the spec sets `kind_property`, use that name in place of `profile_kind`.
- Create profiles **before** records, so the links have something to attach to. Create one seat first and read it back.

## Records (free-form: the schema only says `object`)

One record per business. It is replaced whole on every write, so it carries every field and the **full** list of linked profiles. A profile left out is unlinked.

```json
{"id": "{KEY}",
 "object_record": {"<field>": "<value>", "...": "every spec field, including stored percentages"},
 "relationships": {"profile": [
   {"external_id": "{NAME}:seat:{email}"},
   {"external_id": "{NAME}:business:{KEY}"}]}}
```

The bulk call wraps each as `{"type": "data-source-record", "attributes": {"record": <the above>}}` and points `relationships.data-source` at the data source.

## Subscription

Marketing email consent only: `subscriptions.email.marketing.consent: "SUBSCRIBED"`, with `custom_source: "{NAME} demo sample seats"`. The MCP server asks the user to confirm the first subscription call. Pass that on and wait.

## Sample events (free-form properties)

- Send by `external_id` to a profile this run created, never to an existing one.- Properties are the spec entry's `properties` plus `sample: true`.
- Set `unique_id` to `{NAME}-sample-{event}-{target lowercased}`, where the target is the seat email or the business key. Sending the same event twice then records it once.

## Segments

Condition groups are AND'd. Conditions inside one group are OR'd. Use one group per requirement:

1. **Linked to a record whose field meets the condition.** One condition of type `profile-has-custom-object`, with `object_type_id`, `object_type_relationship_id`, a count filter of `numeric greater-than 0`, and `filters: [{property_id, filter}]` for the detector's `when`.
2. **The audience marker.** A `profile-property` condition: `properties['profile_kind']` equals the detector's `audience` (`seat` or `business`). This keeps business profiles out of audiences meant for people.3. **One group per `who` entry.** `properties['<key>']` equals the value.
4. **An `unless` rule, if any.** One group with two OR'd `profile-has-custom-object` conditions on the same field: a `date at-least {within_days} day` filter, or an `existence not-set` filter. It has not been run in an account.

Operators for `when.op`: `>=` greater-than-or-equal, `>` greater-than, `<=` less-than-or-equal, `<` less-than, `==` equals, `!=` not-equals. Use a `numeric` filter for int and float fields and a `string` filter for string fields. String fields allow only `==` and `!=`.

Name it `{NAME}: {detector description, or its name}`.

## Flows

- Every flow is a **draft**. Never set a live status.
- Use `temporary_id` on actions, never `id`. The entry action is `action-1`, or `delay-1` if there is a delay.
- `reentry_criteria` is `{duration: reentry_days (default 30), unit: "day"}`.
- A state detector's trigger is the segment. An event detector's trigger is the event's metric.
- A `delay` becomes a `time-delay` action in front, linked to `action-1`.
- An email action is a **marketing** email: `transactional: false`, `smart_sending_enabled: false`, `from_label: {NAME}`, no template. Many accounts cannot send transactional email, and marketing email reaches only subscribed profiles.
- An `internal_alert` action sends to `then.to`, with `from_email` defaulting to the first address and `subject_line` defaulting to the detector's description.
- Name the flow `{NAME}: {detector description, or its name}`.
- Klaviyo adds the account's default reply-to address. It may also assign a template to internal-alert actions; email actions may come back with none, so check each action before calling the flow done.
