# Klaviyo rules that shape the model

Each rule was found by trying it in a test account, or comes from Klaviyo's own tool descriptions, and is marked **tested** or **documented** or **unverified**. When one changes the design, tell the user which one and why.

## Seats are profiles, the business is an object

People are profiles, so they can receive email and be segmented. Business-level state goes on a custom object linked to those profiles, so it is stored once and a change is one record write.

**Tested:** a segment on a custom object property through a profile-to-object link works. In testing, "profiles with a record where role is admin and seat utilization is at least 90" matched the expected person. Date filters on object properties are in the segment schema but have not been run.

**So:** a rule such as "do not message seats at a business Sales contacted in the last 3 days" is a condition on the business record.

## A record is linked to many profiles by listing them

One record can name several profiles in its relationship, each by an identifier. The path mapping says where in the record the list sits and which identifier type it holds.

**Tested:** linking by **external ID** showed the business record on a seat profile in the UI, with several seats and a business profile on one record. The skill links by external ID only and writes profiles before records. Custom Objects also document email as a link identifier; the skill doesn't use it because an external ID stays fixed when a seat's email changes.

**Unverified:** whether the business profile, which has only an external ID, links. A seat link was seen; the business profile was not checked.

**The API cannot show it.** Profile reads and record reads carry no link data, and the ingestion log stayed empty even when nothing linked. The only checks are the UI and segment membership, so the skill asks the user to look.

## Rewriting a record replaces its links

A record is replaced whole on rewrite, and its links come from the profile list in the write. A seat left out of a rewrite should be unlinked. This is **unverified** for the removal case.

**So:** every business write carries every field and the full seat list. Never write a partial record.

## A person belongs to one business

Role and any seat-level state are properties on the seat's profile. That only works if a person is a seat in exactly one business, which you check in `checklist.md`. If a product allows people in several businesses, this model does not fit, and a per-person-per-business record would be needed instead. Say so and stop.

## A role cannot live on a relationship

The link between a profile and a custom object carries only a name and a description (**documented**). Role is a profile property, which works because a person has one business.

## Relationships between two objects cannot drive segments or flows

**Documented** in the relationship tool. This is why the model has one object type and not a Business object linked to a Team object. If the user wants a hierarchy of objects, explain that the link can store and query data but cannot filter audiences, and that any field an audience needs must be copied onto the object linked to the profiles.

## An event on a business profile reaches only that profile

**Unverified**, and it matters. A flow acts on the profile its triggering event belongs to, so `lead_acquired` on the business profile can drive an internal alert, but it cannot email the business's seats. To message seats about a business event, the product has to send the event to each seat's profile, or a flow on a seat event has to check the business record. Say this plainly when the user lists business-level events.

## A business profile needs an email to notify the business

An event needs a profile, and a flow can email only a profile with an address. A field on the record can do neither. If a business-level event must notify the business, its business profile needs an email (`business_profile.has_email`). **Tested:** a business profile created with its own email, different from every seat, kept its email and its external ID, and a sample business-level event landed on it. **Unverified in an account:** that a flow triggered by that event emails the address.

## Business profiles are extra profiles

They have an external ID and no email. They are profiles, so they may count toward pricing at volume (not checked), and they appear in any audience of all profiles. The skill sets a marker property (`profile_kind` by default, set by `kind_property` in the spec) to `business` or `seat` on every profile it creates, so audiences can include or exclude them.

**Tested:** a profile with only an external ID can be created.

**Never give a business profile an email that a seat uses.** In testing, an email ended up on a business profile, and creating the real seat afterwards produced a third profile for the same person. A business profile may have its own address, one no seat uses, set when the profile is created. Check for overlap before writing.

## External IDs cannot be changed

Once a profile has an external ID it stays. Seats get `{name}:seat:{email}` and business profiles `{name}:business:{key}`. Decide the format in the interview, write one seat first, and read it back. Giving an existing email-only profile an external ID worked in testing, and no duplicate was created.

## Filters compare a field to a constant

A condition can ask "seat utilization at least 90". It cannot ask "seats used at least 90% of seat limit". **So:** store each ratio as its own integer field. Check that it equals the ratio, rounded half up (`checklist.md`).

## Property types are limited

`boolean`, `float`, `int`, `list_str`, `string` and `timestamp`. No enum, no date without a time, no nested object. Roles and plans are strings, and the product must send only the allowed values.

## Properties are referred to by number

Segment conditions identify an object property by numeric ID, assigned by field order starting at 1. This is how the API refers to them. Where the Klaviyo UI shows the number, if it does, has not been checked. In the UI the user picks the property by name. Never reorder an applied spec, and give the user the ID table for anyone building segments through the API.

## Creation order is forward-only

A schema starts as a draft and can become active, never draft again. The profile link and the source mapping can only change while it is a draft. A mistake after activation means a new object type under a new title.

## Writes are queued, and audiences lag

Record writes and activation are asynchronous with no read-after-write guarantee. Segments built on a new object stayed empty for 30 minutes or more even after the record showed on the profile (**tested**; the first person appeared after about 30 minutes and the rest within an hour). Tell the user at the start.

## Linking records to profiles

Everything links by external ID: `$['relationships']['profile'][*]['external_id']` with the identifier type `external-id`, hyphenated. The seat profile must already exist with that external ID when the record is written. Whether a link to an unknown identifier creates a profile, or is retried later, is **unverified**, so the skill creates profiles first.

## Bulk limits

One bulk call takes at most 500 records and 4 MB, and one data source record payload at most 512 KB. The object record it produces is capped at 8 KB, with each property at most 2 KB. A record carries its whole seat list, so the 8 KB cap is the one that limits how many seats one business can carry.

## Events are separate

The object holds state. Behavior (invites, limit hits, runs) belongs in events sent by the product. A flow that fires on an event needs the metric to exist first, which means one real event of that name has to have been sent. This skill lists events in the spec but does not send them.

## Detectors become segments and draft flows

A **state** detector (field, operator, value) becomes a segment plus a flow triggered by it. An **event** detector becomes a flow triggered by the event's metric, with an optional delay.

**Tested:** the state segment definition is accepted and processes. **Unverified:** whether it fills against the external-ID link, because the first pass was empty and these segments are slow to fill. The event flow and the time-delay action have not been created in an account yet.

**Segment conditions:** the builder puts each requirement in its own condition group and relies on groups being combined with AND. A date rule (`unless`) puts two conditions in one group, relying on conditions within a group being combined with OR ("at least N days old, or not set"). Neither combination rule was checked against a filled segment, and the date filter on an object property has not been run.

**A flow on a business profile cannot email people.** The business profile has no email, so the skill only builds an internal alert for it. Emailing the seats of a business means a detector on seats.

**A flow on an event needs the metric.** The metric exists only after one real event of that name has arrived.

**Marketing emails reach only subscribed profiles.** The sample seats have no subscription until the skill subscribes them, which is a consent decision the user approves.

**Transactional email may be refused.** One account rejected a transactional email action ("not eligible for transactional messages"). The skill builds marketing emails.

**Flows take the account's default reply-to,** which can be someone else's address.

**Capacity.** An account can cap object types. A refused create reads "Already at max object type capacity".
