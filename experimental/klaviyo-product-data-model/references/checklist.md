# Checklist

There is no validator script. You check the spec yourself, in two places: **before you show the plan**, and **before you activate the schema**. A mistake caught at the first is a line edit. A mistake caught after activation means a new object type, and the account may be near its limit.

Go through every item that applies and say which you checked. If one fails, fix the spec and check again. Do not go on with a failing item.

## A. The spec (before the plan)

**Names and keys**
- `name` is non-empty, has no colon and no surrounding spaces. It is part of every external ID.
- `object_title` starts with `name`.
- Field names are lowercase snake_case, and unique.
- `key_field` is a field, and is a `string`.
- Every name in `required` is a field.
- `kind_property`, if set, is lowercase snake_case.

**Fields**
- Each type is one of `boolean`, `float`, `int`, `list_str`, `string`, `timestamp`.
- A field with `ratio_of: [a, b]` is `int`, and both `a` and `b` are fields. Klaviyo cannot compare two fields in a filter, which is why the percentage is stored.
- The order is final. Property IDs follow it, starting at 1. Never reorder a spec that has been applied.

**Detectors**
- Names are lowercase snake_case, unique, and each has `audience` of `business` or `seat`.
- Without `business_profile.has_email`, `audience: business` can only use `then.type: internal_alert`. A business profile has no email, so emailing people needs `audience: seat`. With `has_email: true`, a business detector may also email, and the email goes to the business's `owner_email`.
- `has_email` needs `business_profile`.
- `then.type: internal_alert` has `then.to`, a non-empty list of addresses.
- `then.type: email` has `then.from_email` (with an `@`) and `then.subject`.
- `reentry_days`, if set, is a whole number of at least 1.
- A **state** detector has `when: {field, op, value}` and no `on` or `delay`.
  - `when.field` is a business field of type `int`, `float` or `string`.
  - `op` is `>=`, `>`, `<=`, `<`, `==` or `!=` for int and float, and only `==` or `!=` for string.
  - `value` has the field's type.
  - `who` is allowed only with `audience: seat`, and each key is a declared seat property whose value is in its `allowed` list.
  - `unless` names a `timestamp` field and a whole `within_days` of at least 1.
- An **event** detector has `on: {event}` and no `when`, `who` or `unless`.
  - The event is listed in `events`, and its `level` equals the detector's `audience`.
  - `delay`, if set, has a whole `value` of at least 1 and a `unit` of `minutes`, `hours` or `days`.

**Seat properties**
- Each is declared in `seat_properties` with a type. `allowed` lists the values, because Klaviyo has no enum.
- `seat_defaults` values are plain values.

**Events and scenarios**
- Event names are lowercase snake_case, and `level` is `business` or `seat`.
- Every field named in a scenario's `uses_fields` exists in `fields` or `seat_properties`.

## B. Sample data (only if the spec has `businesses`)

- `sample_events` and `subscribe_sample_seats` are allowed only with `businesses`. Without sample data, leave both out.
- Each business gives every required field, each value fits its field's type, and no key repeats.
- **Percentages:** a stored percentage equals its ratio, rounded half up. 2 of 3 is 67, 1 of 8 is 13, 10 of 10 is 100. Do the arithmetic for every business.
- **Seat counts:** if `seat_count_field` is set, it names an `int` field, and each business's value equals the number of seats listed for it. A record that says 9 seats next to 3 profiles looks wrong to anyone who opens it. Pick limits and counts to fit the seats, not the other way round.
- **One business per person:** an email is a seat in only one business, and appears once. Compare across all businesses, ignoring case.
- Every seat has an email with an `@`, and its properties are declared in `seat_properties`, with allowed values.
- Business profile external IDs are unique.
- With `has_email`, every business has an `owner_email` with an `@`, it is unique across businesses, and it is **not any seat's email**, compared across all businesses ignoring case.
- At most 500 businesses. Each business's record stays under the 8 KB object record limit (2 KB per property), which limits how many seats one record can carry.
- Every `sample_events` entry names an event listed in `events`. A seat-level event goes to the email of a sample seat, and a business-level event goes to the key of a sample business and needs a `business_profile`.
- Use only addresses the user says are theirs.

## C. Before activating the schema

Activation cannot be undone. Read the schema back with `get_object_schema` and `include: ["source-mapping"]`, then check each item against what you meant to send.

- The properties are exactly the spec's fields, in order, with IDs 1, 2, 3 and so on, and the right types.
- `required` matches the spec.
- **Every property mapping's `data_path` names the field of the same property ID.** Property 6 must read `$['object_record']['<field 6's name>']`. A mapping pointed at the wrong field fails quietly.
- Every mapping uses the same `source_id`, and it is the data source you created.
- The relationship mapping is present, uses the `relationship_id` from `meta.relationship_id`, and reads `$['relationships']['profile'][*]['external_id']` with `identifier_type: external-id`.
- The title is the spec's `object_title`.

Show the user what you compared, and ask them to confirm, before you activate.

## D. After the records load

- The record count equals the number of businesses.
- Spot-check values against the spec, including every stored percentage.
- Each record's `relationships.profile` list you sent held every seat, and the business profile if the spec has one. A record that leaves a seat out unlinks it.
- Read one seat profile back after creating it. Check the external ID is `{name}:seat:{email lowercased}`, because it cannot be changed once set.
