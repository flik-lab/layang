import type { ReactNode } from "react";
import { ContentCopy } from "@/components/shadcn/icons";
import { copyTextWithAnnouncement } from "@/lib/accessibility";
import type { MockHelpTopic } from "./mock-help-store";

type HelpSection = { id: MockHelpTopic; title: string; body: ReactNode };

const Code = ({ children }: { children: string }) => (
  <div className="mock-help-code-wrap">
    <pre className="mock-help-code">{children}</pre>
    <button type="button" className="mock-help-copy" aria-label="Copy snippet" onClick={() => copyTextWithAnnouncement(children, "Snippet")}>
      <ContentCopy sx={{ fontSize: 13 }} /> Copy
    </button>
  </div>
);

export const MOCK_HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: "quick-start",
    title: "Quick start",
    body: (
      <>
        <p>Get a working gRPC mock in five steps.</p>
        <ol>
          <li><b>Import a schema.</b> Open <b>Schemas</b> and import your <code>.proto</code> files or a zip. The methods appear in the Mocking sidebar.</li>
          <li><b>Create a scenario.</b> Select a method in the sidebar, press <b>+</b>, give the scenario a name, and keep the <b>Example from proto</b> template.</li>
          <li><b>Check the response.</b> Edit the generated YAML if you need different values, then press <b>Save draft</b>.</li>
          <li><b>Start the server.</b> Turn on <b>gRPC Mock</b> in the Runtimes bar, or press <b>Start</b> on the Native gRPC card. Then press <b>Activate</b> on the scenario.</li>
          <li><b>Call it.</b> Send the method from the Request tab, or from a terminal:</li>
        </ol>
        <Code>{"grpcurl -plaintext -d '{}' 127.0.0.1:50055 package.Service/Method"}</Code>
        <p>Browser apps can't speak native gRPC. Start <b>Web Access</b> and point your gRPC-Web client at its URL.</p>
      </>
    ),
  },
  {
    id: "templates",
    title: "Scenario templates",
    body: (
      <>
        <p>The New scenario dialog can start from a template. Each one writes a complete scenario file that you can edit afterwards.</p>
        <ul>
          <li><b>Example from proto</b> fills every response field with sample values taken from the schema.</li>
          <li><b>Stream, 3 responses</b> (server streaming only) sends three messages every second, in a loop.</li>
          <li><b>Manual push</b> (server streaming only) keeps the stream open and waits until you press <b>Send now</b>.</li>
          <li><b>Match a request field</b> answers only when the request contains a given value. Add a second scenario without a matcher as the fallback.</li>
          <li><b>Error status</b> returns <code>NOT_FOUND</code> with a message. Change <code>code</code> to any gRPC status.</li>
          <li><b>Blank</b> writes an empty response.</li>
        </ul>
      </>
    ),
  },
  {
    id: "scenario-file",
    title: "Scenario file format",
    body: (
      <>
        <p>Each scenario is one YAML file under <code>mocks/grpc/scenarios/</code>. Layang assigns the <code>id</code>; keep it unchanged when you edit the file outside the app.</p>
        <p>Unary method:</p>
        <Code>{`name: Successful login
enabled: true
response:
  data:
    token: abc123
    expiresIn: 3600
  delayMs: 200        # optional
  # code: UNAUTHENTICATED   # optional gRPC status
  # message: Bad password`}</Code>
        <p>Server-streaming method:</p>
        <Code>{`name: Live positions
enabled: true
stream:
  execution:
    mode: periodic        # incoming | standby | periodic | hybrid
    periodic: { intervalMs: 1000, loop: true, maxExecutions: 0 }
  responses:
    - data: { id: 1, lat: -6.2 }
    - data: { id: 2, lat: -6.3 }
      delayMs: 500`}</Code>
        <p>Field names can be written in camelCase or as they appear in the proto.</p>
      </>
    ),
  },
  {
    id: "matching",
    title: "Matching requests",
    body: (
      <>
        <p>Add an <code>input</code> block to answer only some requests. A scenario without <code>input</code> matches everything and works as the fallback.</p>
        <p><b>While typing:</b> press <b>Ctrl+Space</b> in the YAML editor. Under <code>input:</code> it lists the matchers; inside a matcher it lists the request fields from the proto; after <code>code:</code> it lists the gRPC statuses.</p>
        <p><b>From the menu:</b> in the scenario editor, press <b>Insert</b> and pick a matcher. Layang writes the <code>input</code> block with values from a request example built from the proto, so you only change the values.</p>
        <p><b>Where the values come from:</b> the same menu has <b>Copy request example</b>, the JSON a client would send. Paste parts of it into a matcher. Field names can be camelCase or as written in the proto.</p>

        <h4>contains: only these fields must match</h4>
        <p>Other fields are ignored. Strings match as substrings. The most useful matcher.</p>
        <Code>{`input:
  contains:
    userId: "42"`}</Code>

        <h4>equals: the whole request must match</h4>
        <p>Every field, exactly. Fields that are left out must be absent from the request too.</p>
        <Code>{`input:
  equals:
    userId: "42"
    includeDetails: true`}</Code>

        <h4>equalsUnordered: like equals, ignoring array order</h4>
        <Code>{`input:
  equalsUnordered:
    tags: [vip, internal]`}</Code>

        <h4>matches: regular expression per field</h4>
        <Code>{`input:
  matches:
    userId: "^4[0-9]$"
    email: '@example\\.com$'`}</Code>

        <h4>glob: wildcard per field</h4>
        <p><code>*</code> matches many characters, <code>?</code> matches one.</p>
        <Code>{`input:
  glob:
    trackId: "TRK-*"`}</Code>

        <h4>headers: request metadata</h4>
        <p>Header names are lowercase. Combine it with a body matcher if you need both.</p>
        <Code>{`input:
  contains:
    userId: "42"
  headers:
    contains:
      authorization: Bearer`}</Code>

        <h4>or: any one is enough</h4>
        <Code>{`input:
  or:
    - equals: { userId: "42" }
    - contains: { role: admin }`}</Code>

        <h4>any: explicit fallback</h4>
        <Code>{`input:
  any: true`}</Code>

        <p><b>Good to know</b></p>
        <ul>
          <li>Several matchers in one <code>input</code> must all match.</li>
          <li><code>contains: {"{}"}</code> never matches. Leave <code>input</code> out, or use <code>any: true</code>, for a fallback.</li>
          <li>The scenario selected in the picker is the one the server uses for that method. To answer differently per request, use <code>or</code> or keep the fallback in the selected scenario.</li>
        </ul>
      </>
    ),
  },
  {
    id: "streaming",
    title: "Streaming and Send now",
    body: (
      <>
        <p>The delivery mode above the editor decides when a server-streaming scenario sends its responses.</p>
        <ul>
          <li><b>On request</b> sends all responses as soon as a client calls the method.</li>
          <li><b>Standby</b> opens the stream and waits. Pick a response, or <b>All responses</b>, and press <b>Send now</b>.</li>
          <li><b>Periodic</b> sends one response per interval. Turn on <b>Loop</b> to repeat; <b>Max</b> 0 means no limit.</li>
          <li><b>Hybrid</b> sends on an interval and also lets you push by hand.</li>
        </ul>
        <p>Press <b>Save delivery</b> after changing these settings, then <b>Activate</b>. Send now needs at least one open stream, so call the method from a client first.</p>
      </>
    ),
  },
  {
    id: "web-access",
    title: "Web Access for browsers",
    body: (
      <>
        <p>Web Access is a gRPC-Web bridge. Browsers call it over HTTP or HTTPS, and it forwards each call to the native gRPC mock (or another gRPC server you choose).</p>
        <ul>
          <li>Configure host, port, HTTPS, CORS origins, and the target in <b>Mock settings → Web Access</b>.</li>
          <li>Use HTTPS when the browser keeps many streams open, so it can use HTTP/2.</li>
          <li>Add your front-end origin, such as <code>http://localhost:3000</code>, to <b>CORS origins</b>.</li>
        </ul>
      </>
    ),
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    body: (
      <ul>
        <li><b>Start is disabled.</b> Open or save a workspace and import a proto schema first.</li>
        <li><b>The client gets the old response.</b> Save the draft and press <b>Activate</b>. Saving alone doesn't change the running server.</li>
        <li><b>Send now is disabled.</b> Apply the scenario and save the delivery settings. The button also needs an open stream.</li>
        <li><b>Fields come back empty.</b> Check the field names against the proto. Unknown fields are dropped.</li>
        <li><b>The browser reports a CORS error.</b> Add the page origin under Mock settings → Web Access → CORS origins.</li>
        <li><b>A large scenario shows only metadata.</b> Files of 512 KiB or more open outside the inline editor. Use <b>Show YAML in folder</b>, edit, then <b>Refresh index</b>.</li>
      </ul>
    ),
  },
];
