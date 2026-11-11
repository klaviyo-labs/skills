#!/usr/bin/env node
// Reads, prepares, edits, publishes and unpublishes Klaviyo onsite forms, touching only forms whose
// name starts with the prefix (default "Vercel Shop - ") and only definitions targeted to the given hosts.
//
//   node <skill-dir>/scripts/forms.mjs get <form-id> [--out form.json]
//   node <skill-dir>/scripts/forms.mjs prepare <source.json> --name "Vercel Shop - Welcome popup" --hosts localhost,my-shop.vercel.app [--out new.json]
//   node <skill-dir>/scripts/forms.mjs check <form.json> --hosts localhost,my-shop.vercel.app
//   KLAVIYO_API_KEY=pk_... node <skill-dir>/scripts/forms.mjs update <form-id> --file form.json --hosts localhost,my-shop.vercel.app
//   KLAVIYO_API_KEY=pk_... node <skill-dir>/scripts/forms.mjs publish <form-id> --hosts localhost,my-shop.vercel.app
//   KLAVIYO_API_KEY=pk_... node <skill-dir>/scripts/forms.mjs unpublish <form-id>
//
// get, update, publish and unpublish need KLAVIYO_API_KEY: a private key with forms:read and forms:write,
// set in the shell, never in the storefront or its Vercel environment. prepare and check work offline.
// --prefix "<name prefix>" changes which forms count as this storefront's.
//
// Node 18+, no dependencies. Exit codes: 0 done, 1 API error, 2 bad usage, 3 refused (wrong form,
// targeting outside the hosts, or the form changed since it was read).

import { readFileSync, renameSync, writeFileSync } from "node:fs";

const API = "https://a.klaviyo.com/api";
const REVISION = "2026-10-15";
const USAGE = "Run with --help for usage.";

const [command, target, ...rest] = process.argv.slice(2);
if (["--help", "-h", "help"].includes(command)) {
  const header = readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1);
  console.log(header.slice(0, header.findIndex((line) => !line.startsWith("//"))).map((line) => line.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}
const flags = parseFlags(rest);
const prefix = flags.prefix ?? "Vercel Shop - ";

function parseFlags(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith("--") || args[i + 1] === undefined) fail(2, `Unexpected argument ${args[i]}. ${USAGE}`);
    parsed[args[i].slice(2)] = args[i + 1];
  }
  return parsed;
}

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

function requireFlag(name) {
  if (!flags[name]) fail(2, `--${name} is required. ${USAGE}`);
  return flags[name];
}

function hostList() {
  const hosts = requireFlag("hosts")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  if (hosts.length === 0) fail(2, `--hosts needs at least one host. ${USAGE}`);
  return hosts;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(2, `Can't read ${path} as JSON: ${error.message}`);
  }
}

// Writes beside the target and renames into place, so an interrupted run never leaves half a file.
function writeJson(path, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (!path) return process.stdout.write(text);
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
  console.error(`Wrote ${path}`);
}

// Accepts the API's response, its data object, the MCP server's get_form output, or this script's own files.
function toForm(json) {
  const resource = json?.data ?? json;
  const attributes = resource?.attributes ?? resource;
  if (!attributes?.definition?.versions) fail(2, "That JSON has no definition.versions, so it isn't a form.");
  return { definition: attributes.definition, id: resource.id, name: attributes.name, status: attributes.status };
}

// Create rejects every id, and versions take their name, status and A/B setting from the form.
function stripIds(value) {
  if (Array.isArray(value)) return value.map(stripIds);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "id")
      .map(([key, child]) => [key, stripIds(child)]),
  );
}

function hostPattern(host) {
  return `*${host}*`;
}

function targetVersion(version, hosts) {
  const triggers = (version.triggers ?? []).filter((trigger) => trigger.type !== "url_patterns");
  triggers.push({ properties: { allow_list: hosts.map(hostPattern) }, type: "url_patterns" });
  return { ...version, triggers };
}

// Every version must carry a url_patterns trigger whose allow_list names only these hosts, or the form
// would show on every other site that uses the same Klaviyo account.
function targetingProblems(definition, hosts) {
  const allowed = new Set(hosts.map(hostPattern));
  const problems = [];
  definition.versions.forEach((version, index) => {
    const label = `version ${index + 1}${version.status ? ` (${version.status})` : ""}`;
    const patterns = (version.triggers ?? []).filter((trigger) => trigger.type === "url_patterns");
    const list = patterns.flatMap((trigger) => trigger.properties?.allow_list ?? []);
    if (patterns.length === 0 || list.length === 0) problems.push(`${label} has no URL allow list`);
    for (const entry of list) if (!allowed.has(entry)) problems.push(`${label} allows ${entry}`);
  });
  return problems;
}

function checkTargeting(definition, hosts) {
  const problems = targetingProblems(definition, hosts);
  if (problems.length) fail(3, `Targeting is outside ${hosts.join(", ")}:\n- ${problems.join("\n- ")}`);
}

async function api(method, path, body) {
  const key = process.env.KLAVIYO_API_KEY;
  if (!key) fail(2, "Set KLAVIYO_API_KEY in the shell to a private key with forms:read and forms:write.");
  const response = await fetch(`${API}${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      accept: "application/vnd.api+json",
      Authorization: `Klaviyo-API-Key ${key}`,
      "content-type": "application/vnd.api+json",
      revision: REVISION,
    },
    method,
  });
  const text = await response.text();
  return { json: text ? JSON.parse(text) : null, status: response.status, text };
}

async function getOwnedForm(id) {
  const { json, status, text } = await api("GET", `/forms/${id}`);
  if (status !== 200) fail(1, `GET /forms/${id} returned ${status}: ${text}`);
  const form = toForm(json);
  if (!form.name?.startsWith(prefix)) fail(3, `"${form.name}" doesn't start with "${prefix}", so it isn't this storefront's form. Leaving it alone.`);
  return form;
}

// Publish and unpublish jobs return 202 when accepted; the form's status is the proof they finished.
async function waitForStatus(id, wanted) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const { json, status } = await api("GET", `/forms/${id}`);
    if (status === 200 && json?.data?.attributes?.status === wanted) return true;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

async function runJob(id, kind, wanted) {
  const type = `form-${kind}-job`;
  const { status, text } = await api("POST", `/${type}s`, {
    data: { relationships: { form: { data: { id, type: "form" } } }, type },
  });
  if (status === 409) fail(1, `409: the form has an A/B test, which only the Klaviyo form editor can ${kind}. ${text}`);
  if (status !== 202) fail(1, `POST /${type}s returned ${status}: ${text}`);
  if (!(await waitForStatus(id, wanted))) fail(1, `The ${kind} job was accepted, but the form isn't ${wanted} after 30 seconds. Check it with get.`);
  console.log(`${kind === "publish" ? "Published" : "Unpublished"} form ${id}; its status is now ${wanted}.`);
}

switch (command) {
  case "get": {
    if (!target) fail(2, `get needs a form ID. ${USAGE}`);
    const { json, status, text } = await api("GET", `/forms/${target}`);
    if (status !== 200) fail(1, `GET /forms/${target} returned ${status}: ${text}`);
    writeJson(flags.out, toForm(json));
    break;
  }
  case "prepare": {
    if (!target) fail(2, `prepare needs a source form file. ${USAGE}`);
    const name = requireFlag("name");
    if (!name.startsWith(prefix)) fail(2, `--name must start with "${prefix}".`);
    const hosts = hostList();
    const source = toForm(readJson(target));
    const versions = stripIds(source.definition).versions.map(({ ab_test, name: _name, status, teasers, ...version }) =>
      targetVersion(version, hosts),
    );
    writeJson(flags.out, { ab_test: false, definition: { versions }, name, status: "draft" });
    console.error("Prepared a draft. Edit its copy and the submit button's list, then create it with the MCP server's create_form.");
    break;
  }
  case "check": {
    if (!target) fail(2, `check needs a form file. ${USAGE}`);
    const hosts = hostList();
    checkTargeting(toForm(readJson(target)).definition, hosts);
    console.log(`Every version targets only ${hosts.join(", ")}.`);
    break;
  }
  case "update": {
    if (!target) fail(2, `update needs a form ID. ${USAGE}`);
    const hosts = hostList();
    const edited = toForm(readJson(requireFlag("file")));
    const current = await getOwnedForm(target);
    if (edited.name && !edited.name.startsWith(prefix)) fail(3, `The new name must keep the "${prefix}" prefix.`);
    if (edited.definition.versions.length !== current.definition.versions.length)
      fail(3, "Update can't add or remove versions. Keep every version from get, in the same order.");
    edited.definition.versions.forEach((version, index) => {
      const before = current.definition.versions[index];
      if (version.id !== before.id) fail(3, `Version ${index + 1} has a different id. Keep every version's id from get.`);
      if (before.status === "live" && JSON.stringify(version) !== JSON.stringify(before))
        fail(3, `Version ${index + 1} is live, and only draft versions can change. Return it exactly as get gave it.`);
    });
    checkTargeting(edited.definition, hosts);
    const { status, text } = await api("PATCH", `/forms/${target}`, {
      data: { attributes: { definition: edited.definition, name: edited.name ?? current.name }, id: target, type: "form" },
    });
    if (status === 409) fail(3, `409: the form changed since it was read. Run get again, reapply the change, and retry. ${text}`);
    if (status !== 200) fail(1, `PATCH /forms/${target} returned ${status}: ${text}`);
    console.log(`Updated the draft of form ${target}. The live version, if any, is unchanged until publish.`);
    break;
  }
  case "publish": {
    if (!target) fail(2, `publish needs a form ID. ${USAGE}`);
    const hosts = hostList();
    const form = await getOwnedForm(target);
    checkTargeting(form.definition, hosts);
    await runJob(target, "publish", "live");
    break;
  }
  case "unpublish": {
    if (!target) fail(2, `unpublish needs a form ID. ${USAGE}`);
    await getOwnedForm(target);
    await runJob(target, "unpublish", "draft");
    break;
  }
  default:
    fail(2, `Unknown command ${command ?? "(none)"}. ${USAGE}`);
}
