---
name: klaviyo-product-data-model
description: 'EXPERIMENTAL: may change, so review its output. Interview a user about their B2B product (businesses or accounts, the people who hold seats in them, business-level state like plan, seat limits and "sales contacted", and the events the product emits) and turn the answers into a Klaviyo data model: a Business custom object linked to seat profiles, plus one profile per business for business-level events. Also turn the situations the user wants to detect into segments and draft flows. Then create it in a Klaviyo account through the Klaviyo MCP. Use this whenever someone wants to model a B2B SaaS or PLG product in Klaviyo, set up custom objects for accounts, teams or workspaces, target "only seats at businesses over 90% of their limit" or "don''t message businesses Sales contacted recently" audiences, send product-usage lifecycle email from Klaviyo, or demo Klaviyo for a non-retail product, even if they never say "custom object" or "data model". Also use it to draft or review such a spec or event catalog.'
---

# Klaviyo product data model

Turn a description of someone's product into a working Klaviyo data model, and tell them honestly where Klaviyo differs from what they expected.

Klaviyo's data model was built around shoppers and orders. A B2B product has a different shape: people belong to a business, and the business's state (plan, seats, "Sales contacted it last week") should decide who gets which message. Klaviyo can express this in one particular way. A user cannot know that in advance, so the skill's value is the translation. Interview in the user's own vocabulary, then apply `references/klaviyo-rules.md` and say which rule shaped each choice.

## The model

- **Seats** are profiles, one per person, with an email **and** an external ID `{name}:seat:{email}`. Each is linked to its business's record by that external ID.
- **Business** is a custom object, one record per business. Business-level fields (plan, seat limit, `sales_contacted_at`) are stored once, so a change is one write.
- **Business profile** is one extra profile per business, with the external ID `{name}:business:{key}` and **never an email**. Business-level events such as `lead_acquired` land on it.
- **Business profile email** (optional, `business_profile.has_email`) gives the business profile its own address, one no seat uses, so business-level events can notify the business. Ask which fits: events that only alert your own team (no email), or events that must reach the business itself (email). The admin can also be a seat, under their own address, but does not have to be.
- **Detectors** are the situations to notice. A **state** detector watches a business field (seats at 100%) and becomes a segment plus a draft flow. An **event** detector reacts to something the product sends (an IDE install) and becomes a draft flow triggered by that event. A detector on business profiles can only alert your own team, because a business profile has no email. To email people, the detector is on seats.
- **A person is a seat in one business** is a working assumption. State it to the user and move on. Reopen it only if their own words contradict it ("people switch teams", "consultants on several accounts").
- Role lives on the seat's profile, which works because a person is a seat in one business.

If the user's words show that a person belongs to several businesses, or has a layer between business and seat (teams), this model does not fit as is. Say so, explain that links between objects cannot drive audiences, and agree a simpler shape with the user before going on.

## Scope

This skill creates **one object type, its profile link, and (only if the user lists situations to detect) segments and draft flows.** That is the default, and it touches no profiles and no consent.

**Sample data is optional and off by default.** Only if the user asks for a demo, or says they want sample data, does the spec carry `businesses` (sample businesses and their seats), and then the skill also creates the business profiles, seat profiles and sample records. If the spec lists `sample_events` or `subscribe_sample_seats` and the user approves, it also sends those events and subscribes those seats. Sample data creates real profiles and consent records in the account, which is why it is opt-in.

It does not create templates or campaigns, never turns a flow on, never sends a message, and never deletes.

Segments and flows are built in a separate stage after the data is verified, and each stage needs its own approval. Flows fail in quiet ways (a send can be skipped with no error), so every flow is left as a draft with no template, and the user decides when it goes live.

## Before touching an account

Run these after the user approves the plan and before the first create call. Checks 3 and 4 need the sample emails and the business keys, which only exist once the spec is written, and apply only if the spec has sample data. Check 1 can be done earlier, so the user can correct the account before you plan.

1. **Confirm the account.** Call `get_account_details` and show the name and ID. The `test_account` flag isn't reliable on its own, so don't rely on it. Ask the user to confirm this is where things should be created.
2. **Look at what exists.** Call `get_object_types` and `get_data_sources`. If a title in the plan already exists, stop and ask. Do not reuse or modify it: an active schema cannot be edited, and a half-applied earlier run needs a human decision.
3. **Check the seat profiles.** Only if the spec has sample data. Call `get_profiles` filtered to the sample emails. Note which exist and which do not. If a seat email already belongs to a profile with a **different** external ID, or a business profile (no email) is about to be given an email, stop and ask: an external ID cannot be changed once set, and a second profile for the same email is what produced three profiles for one person in testing. The plan must already have said how many seats are new.
4. **Check for business profiles.** Only if the spec has sample data. Call `get_profiles` filtered on the planned external IDs (`{name}:business:{key}` and `{name}:seat:{email}`). If any exist, stop and ask.
5. **Check object type capacity.** An account can have a limit on how many object types it holds. Compare the count from `get_object_types` with what the user says their limit is. A refused create reads "Already at max object type capacity". Do not try to work around it.
6. **Check what flows can send.** Only if there are email detectors. An account may refuse transactional messages ("not eligible for transactional messages"). The skill builds marketing emails, so say that plainly: they reach only subscribed profiles.
7. **Check the metrics.** Only if there are event detectors. Call `get_metrics` and look for each event's name. A flow can trigger on an event only after one real event of that name has arrived. If one is missing, either the spec's `sample_events` sends it (with the user's approval, see step 6) or that detector waits: tell the user which event to send, and build its flow later.

If the account is the wrong one, stop and tell the user. Switching accounts happens in their Klaviyo connection settings, not in this skill.

## Workflow

### 1. Interview

Ask product questions, not Klaviyo questions. Ask a few at a time and adapt. If the user's message already answers a question, do not ask it again. Cover:

- What is the thing people sign up for, and what do they belong to (business, account, org, team)? Can one person belong to more than one?
- What state does that thing have that you would message about (plan, seat limit, usage, "sales contacted", lead status)?
- What are the five to ten things that happen, and for each: does it happen to the business or to one person?
- Does the business have a lifecycle (lead, contacted, negotiating, customer)? If so it is state: add the stage and any deal fields to the record, and ask which transitions are events and who is told.
- Is there usage that has a limit per person (tokens, credits)? Keep the counter in the product and send events when a person crosses a threshold, rather than storing the counter in Klaviyo.
- Name two or three messages you would send. For each: who exactly gets it, and what about the business decides that?
- Is there a rule like "do not message people when...?" Those usually need a business-level date or flag.
- **What situations do you want to detect, and what should happen when each one occurs?** ("Seats at 100%, email the admins." "Someone installs the editor, welcome them.") For each one, pin down:
  - Is it a **state** (a field on the business crossed a threshold) or an **event** (something just happened, and which one)?
  - **Who gets the message.** A business has no email, so anything that emails people is about seats, and a role (`who`) needs a declared seat property such as `role`. If the user says "alert the team", ask whether they mean their own team (an internal alert) or the customer's people (an email).
  - Any delay before it is sent, how long before the same person can be messaged again (default 30 days), and any "do not message if..." date rule on a business field (`unless`, for example "not contacted this week").
  These become detectors.

The last three matter most. Klaviyo can only filter on data it holds, so the recipients and the rules decide which business fields must exist. If a scenario needs a field the user did not mention, ask for it.

Then ask one more thing: **do they want sample data created in the account?** Say plainly what that means: a few made-up businesses and seats become real profiles and records, with their email consent set if they say yes to that, and sample events create metrics that stay. Offer it for a demo, where it lets the segments fill and the flows be built. Leave it out otherwise. If they want it, use only addresses they say are theirs. If they do not, do not write `businesses`, `sample_events` or `subscribe_sample_seats`.

If the user is a sales engineer or product manager, say "the record Klaviyo keeps for each business" and not "schema" or "mapping".

### 2. Write the spec

Write a JSON spec following `references/spec-format.md`. Write one entry in `detectors` for each situation from the interview, with `kind: state` or `kind: event`. Choose `audience` first: `business` if the action is an alert to the user's own team, `seat` if people should be emailed. Only if the user opted into sample data, add `businesses`, and set `subscribe_sample_seats: true` if any detector emails sample seats. Without it, leave all three sample keys out. `assets/example-business.json` is a complete example of the format, so use it for structure. Take the fields, events and scenarios from what this user told you, not from the example: it is one product, and theirs will differ. Save the spec in the user's working directory, not in the skill folder, as `<name>-data-model.json`.

If the business has a seat count field (`seats_used`) and the spec has sample data, set `seat_count_field` to it and make each sample business's value equal the number of seats you list for it. A record that says 9 seats next to 3 profiles looks wrong to anyone who opens it. Choose the sample limits and counts to fit the seats you list, not the other way round.

There is no validator script, so check the spec yourself against sections A and B of `references/checklist.md`. It covers field types, that each percentage equals its ratio, that seat properties are declared and allowed, that no person is a seat in two businesses, that each detector filters on a real numeric or string field, and the size limits. Say which items you checked, and fix every failure before going on.

### 3. Show the plan and stop

Write the plan from the spec, in plain words, and show it. It lists:
- The object type and its properties, with their IDs in field order, which are required, and which are stored percentages.
- The seat properties set on each profile, and that every profile is marked `profile_kind` as `seat` or `business`.
- Each detector: what it watches or reacts to, who it is for, what it does, and the re-entry period. Mark event detectors as needing one real event first.
- The scenarios the data supports, and the fields each filters on.
- The events the product should send, and the profile each lands on.
- With sample data: the businesses and seat emails, and the profile changes (see below).

Then explain each place Klaviyo's limits shaped the design, using only the rules that applied. For example: "I stored the seat percentage as its own field, because Klaviyo cannot compare two fields in a filter."

Be explicit about what the user may not expect:
- If the spec has sample data, the plan **creates profiles** (business profiles, and seats that do not exist) and **changes existing profiles** (an email-only seat is given an external ID, which cannot be changed later). Name how many. If it has none, say so: no profiles, records or events are created, the segments will stay empty, and event flows cannot be built until the product sends real data.
- Each state detector becomes a **segment and a draft flow**, and each event detector a **draft flow**. Say which are alerts to the user's own team and which are emails, which wait on a first event, and that nothing is sent until the user turns a flow on.
- Emails to people reach only subscribed profiles. If the spec subscribes the sample seats, say how many and that it is a consent decision. Ask for approval and do not do it silently.
- If the spec has `sample_events`, say how many, which profiles they land on, and that each one creates a metric that, as far as I know, cannot be deleted through the API. Ask for approval. Nothing is emailed, because every flow is a draft.
- For each business-level event the user listed, say what it can and cannot do. An event on the business profile reaches only that profile, so it can trigger an internal alert but cannot email the business's seats. This is unverified, so say "as far as I know".

Ask for approval. Creating the schema cannot be undone, so nothing is created before the user says yes.

### 4. Apply

Load the Klaviyo tools with ToolSearch (`mcp__klaviyo__create_data_source`, `create_object_type`, `create_profile_schema_relationship`, `get_object_schema`, `update_source_mapping`, `update_object_schema`, `bulk_create_data_source_records`, `get_records_for_object_type`, `create_or_update_profile`, `get_profiles`, and for detectors `create_segment`, `create_flow`, `get_metrics`, `subscribe_profile_to_marketing`, and for sample events `create_event`, `get_events`). Every call needs `model` set to the model you are running as.

You write each request body yourself, from the spec and the tool's input schema. The schema says what is valid. `references/body-conventions.md` says which valid shape to choose, and gives the contents of the free-form parts (records and event properties). Read it before the first call.

Everything that must agree across calls comes from the spec: the property IDs (field order, starting at 1), the mapping paths, the record shape and the external IDs. Take each one from the spec every time. Do not copy a value from an earlier body or from memory.

The order matters, and a mistake after step 6 means a new object type:

1. `create_data_source`. Keep the ID as the source ID.
2. `create_object_type`, with the schema as a draft and one property mapping per property. Keep the schema ID from `relationships.current-schema`.
3. `create_profile_schema_relationship` with `id` set to the schema ID. It returns nothing.
4. `get_object_schema` with `include` set to `["profile-object-schemas", "source-mapping"]`. Read the relationship ID from `meta.relationship_id` and the mapping ID from the source mapping.
5. `update_source_mapping` with `id` set to the mapping ID, adding the relationship mapping.
6. **Gate, then activate.** Read the schema back and run section C of `references/checklist.md`: every property mapping must point at the field of the same property ID, and the relationship mapping must be present. Show the user what you compared and ask them to confirm. Then `update_object_schema` with `status: active`. A schema cannot go back to draft.
7. Poll `get_object_schema` (status only) until it reads `active`. It shows `publishing` first. Loading records earlier fails.

After step 7, **skip steps 8 to 11 if the spec has no sample data**: there are no profiles to create, no records to load and nobody to subscribe. Go to Verify.

8. Create the business profiles with `create_or_update_profile`, if the spec has `business_profile`, with the business's `owner_email` when `has_email` is set. Do this **before** the records, so the link has a profile to attach to.
9. Create the seat profiles the same way. Do it **before** the records, which link to profiles that already exist. Do one seat first and read the result back, because an external ID cannot be changed once set. It changes profiles, so only do it if the user approved that in the plan.
10. `bulk_create_data_source_records`, one record per business, each carrying every field and the full list of linked profiles.
11. If the spec has `subscribe_sample_seats` and the user approved it, send the subscription with `subscribe_profile_to_marketing`. The tool asks for the user's confirmation on its first call, so pass that on and wait.

This skill links records to profiles by external ID only, and that is how the path mapping is built. Custom Objects also accept email, phone and Klaviyo ID links, but external IDs keep a seat's link stable if their email changes, and the skill was tested end to end with them.

If any step fails, stop and report which step and the exact error. Do not retry by creating a second object type and do not delete anything. Tell the user what exists so far and let them decide.

### 5. Verify

**With no sample data there is nothing to read back and no link to confirm.** Read the schema back (`get_object_schema` with `include: source-mapping`) and check that it is `active`, that all the property mappings are present and that the relationship mapping is present. Say plainly that the link between profiles and records, and the segments, cannot be verified until the product writes real data. Then skip the rest of this step.

With sample data:

- Read the records back with `get_records_for_object_type`. Compare the count and a few values to the spec. Writes are queued, so wait and retry before reporting a problem.
- **Ask the user to confirm the link in the Klaviyo UI.** The API cannot show it: profile and record reads carry no link data and the ingestion log stays empty even when nothing linked. Name one seat and one business profile, and ask the user to open each and look for the business record. Do not report the link as working until they say so or a seat appears in the segment. Segment membership is the only other evidence, and it lags by about 20 minutes, sometimes 30 or more.

The UI check can be replaced by segment membership. A seat that appears in a segment filtering on the business record proves the link. Segments and flows are drafts and harmless, so build them straight after the records load and check membership once the lag has passed. Do not read an early empty segment as a broken link: it proves nothing for the first 20 minutes or more.

### 6. Detectors: segments, then flows

Only if the spec has detectors. Ask for approval first, naming what will be created. Segments and flows do not need the link confirmed first: they are drafts, and a seat showing up in the segment later is itself the link check (see step 5).

**State detector** (a field on the business):
1. `create_segment`, using the segment conventions in `references/body-conventions.md`. Use the object type ID and the schema's `meta.relationship_id` from the apply step. The Klaviyo UI can show a different relationship ID; both were accepted in testing. If a segment stays empty well past an hour, build one by hand in the UI and compare its relationship ID.
2. `create_flow` triggered by the segment's ID.

**Event detector** (something the product sends):
1. Find the event's metric ID with `get_metrics`. If it does not exist yet:
   - If the spec has a `sample_events` entry for it and the user approved in the plan, send it with `create_event` as described in `references/body-conventions.md`, then call `get_metrics` again and `get_events` on the target profile to confirm the event landed by external ID. Events are queued, so wait and retry.
   - Otherwise stop for this detector and ask the user to have the product send one real event of that name, then look again.
2. `create_flow` triggered by the metric's ID. A `delay` becomes a time-delay action ahead of the message.

Every flow is a draft with no template. `reentry_days` on the detector sets how long before the same person can enter again (default 30).

Segments on a new object stay empty for about 20 minutes, sometimes 30 or more. An empty first pass is normal, so do not rebuild them. A segment that should be empty is a useful check: say which detectors you expect to match with the sample data, and which not. With no sample data every segment stays empty until real data arrives, so say that and do not report it as a problem.

A date rule (`unless`) is built as "the field is at least N days old, or not set", and has not been run in an account. Say so when a spec uses one.

If `create_flow` says the account is not eligible for transactional messages, you already set `transactional: false`, so that error means the spec or the account changed. Report it.

Flows pick up the account's default reply-to address. Tell the user, because it may belong to someone else.

### 7. Report

Then give a short report:
- IDs of everything created (data source, object type, schema, relationship, profiles, sample-event metrics, segments, flows), so they can find or clean it up.
- The property ID table. Segment conditions refer to properties by number.
- Which scenarios the data supports, and the fields each filters on.
- **What takes time.** Audiences built on these objects can stay empty for 30 minutes or more after records load. Say so up front so an empty audience is not read as a failure.
- What was not done: no templates, no flows turned on, no sends, no deletes.
- **What the product must send for real data.** The sample profiles are a demo. Write a short contract for the product's owner from the spec:
  - Every person is a profile with their email, the external ID `{name}:seat:{email lowercased}`, `profile_kind: seat` and each seat property.
  - Every business has a profile with the external ID `{name}:business:{key}` and `profile_kind: business`, if the spec has a business profile. It has no email unless `has_email` is set, and then its own address, one no seat uses, set when the profile is created.
  - Every business has one record keyed by `key_field`. It is rewritten whole, with the full list of linked profile external IDs, every time any field changes.
  - The fields the state detectors read must be kept current, and name them.
  - Each event, and the profile it lands on, identified by external ID.
  - A flow can be built on an event only after one real event of that name has been sent.

  The product has to write the business record on every change, or state detectors will never fire.
- The events the product should send, and which profile each belongs on. Remind them events are sent by the product, separately from this.

## Things to be straight about

Do not smooth over Klaviyo's limits. A user choosing a platform needs them:

- A link between two objects cannot drive audiences, so a hierarchy deeper than business and seat needs the fields copied down.
- An event on the business profile cannot email the business's seats.
- Klaviyo cannot compare two fields in a filter, so ratios are stored.
- Business fields are only as current as the last write. If a rule depends on `sales_contacted_at`, the product has to write that field onto the business record every time Sales makes contact, in addition to sending the event. Say this when a scenario depends on a business-level field.
- The business profiles are extra profiles and may count toward pricing.
- A flow on a business profile can only alert internally. A business profile has no email, so emailing people means a detector on seats.
- Segments on a new object are slow to fill, and the link between a profile and a record cannot be seen through the API.
- A date rule on a business field has not been run in an account.
- A flow triggered by an event needs one real event first. A sample event satisfies this, but its metric stays in the account, and as far as I know the API cannot delete it.
- Emails to people reach only subscribed profiles.

If the user's scenario depends on something Klaviyo cannot do, say so plainly and offer the nearest workable design. Do not build around a limit silently.

## Safety

- Every title and every profile's external ID starts with the spec's `name` (checked in `references/checklist.md`), so cleanup can find everything by name. Seat profiles keep their emails. They carry the marker property (`profile_kind: seat`) and an external ID `{name}:seat:{email}`.
- An external ID cannot be changed once set. Check before writing, and write one seat first.
- Never modify or delete an object type, data source, record, profile, segment or flow the skill did not create in this run, with one exception: setting seat properties and external IDs, which the user approves in the plan.
- Create no profiles, records, events or consent unless the user opted into sample data. The default run changes none of them.
- Use only addresses the user says are theirs for sample seats. A link to a real customer's profile is a real change to that profile.
- Send sample events only to profiles this run created, by external ID, so an event can never land on an existing profile that happens to share an email.
- Deletion is out of scope. If the user wants to remove what was created, give them the IDs and let them confirm each one.
