# Spec format

A JSON file describing a business-and-seats model: one custom object with one record per business, seats as profiles linked to their business, and an optional singleton profile per business for business-level events. `assets/example-business.json` is a complete example. `checklist.md` lists what to check in it.

## The shape

- **Business** is a custom object type. One record per business holds the business-level fields once (plan, seat limit, `sales_contacted_at`, `lead_acquired_at`).
- **Seats** are profiles, one per person, with an email and an external ID `{name}:seat:{email}`. Each is linked to its business's record by that external ID. A person is a seat in only one business.
- **Business profile** is one profile per business with an external ID and no email. Business-level events such as `lead_acquired` land on it. It is also linked to the business's record, so those events can filter on business fields.

## Top-level keys

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Short product name. Every title and every business profile's external ID starts with it, so cleanup can find everything. No colons or surrounding spaces. |
| `object_title` | yes | Title of the object type and data source. Must start with `name`. |
| `description` | no | Free text shown on the object type. |
| `key_field` | yes | The string field holding each business's unique key. |
| `required` | no | Fields Klaviyo must reject records without. |
| `fields` | yes | The business object's properties. Order sets property IDs. |
| `seat_count_field` | no | Name of the `int` field holding a business's seat count (for example `seats_used`). Check that a sample business's value matches from the number of seats listed for it, so a record never says 9 seats while only 3 profiles exist. |
| `business_profile` | no | `{properties, has_email?}`. Include it (even as `{}`) to get a business profile per business. Omit it and business events have no profile to land on. Set `has_email: true` to give each business profile an email, so business-level events can notify the business. See below. |
| `seat_properties` | no | Properties set on each seat's profile, declared as `{name, type, allowed?}`. |
| `seat_defaults` | no | Extra values set on every seat's profile. |
| `subscribe_sample_seats` | no | `true` to subscribe the sample seats to email marketing (needs the user's approval). |
| `kind_property` | no | Profile property marking a profile `seat` or `business`. Default `profile_kind`. |
| `detectors` | no | Situations to detect. Each becomes one segment and one draft flow. See below. |
| `events` | no | Events the product should send: `{name, level, properties[]}`, level `business` or `seat`. Not sent by this skill. |
| `sample_events` | no | Events this skill sends on sample profiles so event detectors can be built: `{event, to, properties?}`. See below. |
| `scenarios` | no | Messages the user wants: `{description, uses_fields[]}`. Each field must exist in `fields` or `seat_properties`. |
| `businesses` | no | The sample data. At most 500. Leave it out for a run that creates only the object, segments and flows: no profiles, records or consent are touched, and `sample_events` and `subscribe_sample_seats` are not allowed. |

## Fields

Each field is `{name, type}` plus optional `description` and `ratio_of`.

- `name`: lowercase snake_case.
- `type`: `boolean`, `float`, `int`, `list_str`, `string` or `timestamp`.
- `ratio_of: [numerator, denominator]`: the field is a stored percentage of two other fields, and must be `int`. It exists because Klaviyo filters cannot compare two fields.

The first field is property 1. Never reorder an applied spec.

## Seats and roles

A person is a seat in one business, so role can live on the seat's profile as a property. Declare it in `seat_properties` with `allowed` values. Klaviyo has no enum, so check them yourself. Setting properties on a seat changes an existing profile, so the skill asks before doing it.

## Business profile

The profile's external ID is always `{name}:business:{key}`, for example `Demo:business:biz_example_teamworks`, built from the spec's `name` and the business's key field. The spec cannot change the format. Because the name is part of it, searching for the name finds these profiles along with the object type, and two demos in one account cannot collide. The `name` therefore cannot contain a colon, and renaming an applied spec would create a second set of profiles and orphan the first.

By default the profile has no email, so nothing can be sent to it. `properties` is extra values set on it. The skill adds the marker property (`profile_kind: business` by default) and the business key so these profiles are easy to exclude from audiences meant for people.

## Business profile with an email

An event needs a profile, and a flow can email only a profile that has an address. A field on the record can do neither. Set `business_profile.has_email: true` when business-level events must notify the business (a deal moving to negotiating, a purchase). The business profile then has an email, and each sample business gives `owner_email`.

- `owner_email` is the address the business is contacted at. It must be **different from every seat's email**. Klaviyo keys profiles on email, so reusing a seat's address makes a duplicate or an unrecoverable merge. The admin may also be a seat, under a different address, but does not have to be.
- The email is set when the business profile is created, never added later to a profile that exists.
- A detector with `audience: business` may then use `then.type: email` (to `owner_email`) as well as `internal_alert`.
- The owner address is a profile that may need its own email consent. It is subscribed only if `subscribe_sample_seats` is true and the user approves, and it counts in the number named in the plan.

## Detectors

A detector is a situation to notice and what should happen. There are two kinds, set by `kind` (default `state`).

Keys for both: `name` (lowercase snake_case, unique), `description` (used in the segment and flow names), `audience` (`business` or `seat`), `then`, and optional `reentry_days` (whole days before the same profile can enter again, default 30).

`then` is `{"type": "internal_alert", "to": [addresses]}` or `{"type": "email", "from_email", "subject"}`. A business profile has no email, so `email` needs `audience: seat`. Every flow is a draft with no template.

**State detector** (a business field crossed a threshold). Becomes a segment plus a draft flow triggered by it.

| Key | Meaning |
| --- | --- |
| `when` | `{field, op, value}` on a business field. `op` is `>=`, `>`, `<=`, `<`, `==` or `!=` for int and float fields, `==` or `!=` for string fields. |
| `who` | Seats only. Seat properties that must match, e.g. `{"role": "admin"}`. |
| `unless` | `{field, within_days}` on a timestamp field: leave out profiles where the field is within the last N days. Not run in an account yet. |

```json
{"name": "seats_full", "description": "seats at 100%", "kind": "state", "audience": "seat",
 "who": {"role": "admin"},
 "when": {"field": "seat_utilization_pct", "op": ">=", "value": 100},
 "then": {"type": "email", "from_email": "team@example.com", "subject": "Your team is out of seats"}}
```

**Event detector** (something the product sends). Becomes a draft flow triggered by that event's metric.

| Key | Meaning |
| --- | --- |
| `on` | `{"event": name}`. The event must be listed in `events`, and its `level` must equal the detector's `audience`. |
| `delay` | Optional `{value, unit}` before the message, unit `minutes`, `hours` or `days`. |

```json
{"name": "welcome_after_install", "kind": "event", "audience": "seat",
 "on": {"event": "ide_installed"}, "delay": {"value": 1, "unit": "hours"},
 "then": {"type": "email", "from_email": "team@example.com", "subject": "Welcome"}}
```

A flow can trigger on an event only after one real event of that name has arrived, so the metric must exist before the flow is built.

## Sample events

A flow can trigger on an event only after one real event of that name has arrived, so an event detector cannot be built on a fresh account. `sample_events` lets the skill send one, which creates the metric.

Each entry is `{event, to, properties?}`:
- `event` must be listed in `events`.
- `to` is the email of a sample seat for a `seat`-level event, or the business key for a `business`-level event (which needs a `business_profile`).
- `properties` is a flat object of plain values. The skill adds `sample: true`.

The event is sent by external ID to a profile the skill created, never to an existing one. Send one per event detector, to the seat or business that detector would target, and add others only if the user asks. The skill gives each a fixed `unique_id`, so sending the same entry twice records it once.

```json
{"event": "ide_installed", "to": "dev1@acme.example.com", "properties": {"team_id": "team_acme"}}
```

Sending an event creates its metric, and as far as I know the API cannot delete metrics, so this needs the user's approval in the plan.

## Businesses (sample data, optional)

Sample data is opt-in. Without `businesses` the skill creates the object type, its profile link, and any segments and flows, and nothing else. The segments stay empty and event detectors cannot be built until the product sends real data, so there is nothing to verify. Tell the user about this, and do not use `sample_events` or `subscribe_sample_seats` without it. A demo, where the segments need members and the flows need an event, should include it.

Each entry is `{values, seats[], owner_email?}`:
- `values` gives every business field. Timestamps are ISO 8601 (`2026-09-01T14:00:00Z`). A field that is not required may be left out.
- `seats` is a list of `{email, properties}`. It may be empty if the business has no seat yet.
- `owner_email` is the business profile's email. Required when `business_profile.has_email` is true, and different from every seat's email.

A record is replaced whole when rewritten, so the record carries every seat. Leaving a seat out unlinks it. Also check that each percentage equals its ratio (rounded half up, so 2 of 3 is 67), that no email is a seat in two businesses, and that a record stays under the 8 KB object record limit.
