"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const core = import("../lib/docs-core.mjs");

test("static docs keep plain relative links and drop unsafe schemes", async () => {
  const { markdownToBasicHtml } = await core;
  const html = markdownToBasicHtml(
    [
      "[service](tactical-navigation/index.html)",
      "[up](../index.html)",
      "[page](?page=request%3Acreate)",
      "[web](https://example.com/a)",
      "[js](javascript:alert(1))",
      "[tabbed](java\tscript:alert(1))",
      "[data](data:text/html,x)",
      "[proto](//evil.example/x)",
    ].join("\n\n"),
  );
  for (const href of ["tactical-navigation/index.html", "../index.html", "?page=request%3Acreate", "https://example.com/a"])
    assert.ok(html.includes(`href="${href}"`), `keeps ${href}`);
  assert.doesNotMatch(html, /javascript|java\s*script|data:|\/\/evil/i);
});

test("static docs site has a labelled search, method badges and a specifications list", async () => {
  const { renderStaticDocsSite } = await core;
  const pages = [
    { id: "workspace:overview", kind: "workspace", title: "Demo", children: ["request:create"], breadcrumbs: [], sections: [] },
    { id: "request:create", kind: "request", protocol: "rest", title: "Create Track", children: [], sections: [],
      breadcrumbs: [{ id: "workspace:overview", title: "Demo" }], request: { kind: "rest", method: "post", name: "Create Track" } },
  ];
  const { files } = renderStaticDocsSite(pages, {
    title: "Demo <API>",
    referenceLinks: [{ title: "OpenAPI (REST)", href: "rest/openapi.yaml" }],
  });
  const shell = files["index.html"];
  assert.match(shell, /<body class="docs-app">/);
  assert.match(shell, /<label for="search"[^>]*>Search documentation<\/label>/);
  assert.match(shell, /<h2 id="spec-title">Specifications<\/h2>.*href="rest\/openapi\.yaml".*<small>YAML<\/small>/s);
  assert.doesNotMatch(shell, /<br>/);
  assert.match(shell, /Demo &lt;API&gt;/);

  const index = JSON.parse(files["search-index.json"]);
  assert.equal(index.find((page) => page.id === "request:create").method, "POST");
  assert.equal(index.find((page) => page.id === "workspace:overview").method, "");

  assert.doesNotThrow(() => new vm.Script(files["assets/site.js"]), "site.js parses");
  assert.match(files["assets/site.js"], /const siteTitle = "Demo <API>"|const siteTitle = "Demo \\u003cAPI>"/);
  assert.match(files["assets/docs.css"], /prefers-color-scheme:dark/);
  assert.match(files["assets/docs.css"], /body:not\(\.docs-app\) main/);
});
