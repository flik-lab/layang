# gRPC mock quick start

This guide takes you from a `.proto` file to a working mock in about five minutes. The same content is in the app: press **Help** in the Mocking Runtimes bar.

For every matcher and output option, see the full [gRPC mock scenario guide](../../guide-scenario-mock-grpc.md).

## Before you start

- Open or save a workspace (**File → Open workspace**). Scenarios are stored as files inside it.
- Have your `.proto` files, or a zip of them, ready.

## 1. Import the schema

Open **Schemas** and import the proto files. Every method appears in the Mocking sidebar, grouped by proto and service.

## 2. Create a scenario from a template

1. Open **Mocking → gRPC** and select a method in the sidebar.
2. Press **+** next to the method (or **New scenario**).
3. Enter a name, for example `Successful response`.
4. Under **Start from**, keep **Example from proto**. The preview shows the YAML that will be created.
5. Press **Create scenario**.

Available templates:

| Template | Use it for |
| --- | --- |
| Example from proto | A response with every field filled from the schema |
| Stream, 3 responses | A server stream that sends three messages every second, in a loop |
| Manual push | A server stream that waits until you press **Send now** |
| Match a request field | Answering only when the request contains a value |
| Error status | Returning `NOT_FOUND`, or another gRPC status |
| Blank | Writing the response yourself |

## 3. Adjust and save

Edit the YAML in the editor below the scenario picker, then press **Save draft**. A unary scenario looks like this:

```yaml
name: Successful login
enabled: true
response:
  data:
    token: abc123
    expiresIn: 3600
  delayMs: 200            # optional
```

A server-streaming scenario uses `stream`:

```yaml
name: Live positions
enabled: true
stream:
  execution:
    mode: periodic        # incoming | standby | periodic | hybrid
    periodic: { intervalMs: 1000, loop: true, maxExecutions: 0 }
  responses:
    - data: { id: 1, lat: -6.2 }
    - data: { id: 2, lat: -6.3 }
```

## 4. Start the server and apply

1. Turn on **gRPC Mock** in the Runtimes bar, or press **Start** on the **Native gRPC** card.
2. On the scenario, press **Activate**. Saving alone doesn't change the running server.

The native server listens on `127.0.0.1:50055` by default. Change it in **Mock settings → Native server**.

## 5. Call the mock

From the **Request** tab, or from a terminal:

```bash
grpcurl -plaintext -d '{}' 127.0.0.1:50055 package.Service/Method
```

### Pushing stream messages by hand

1. Create the scenario with the **Manual push** template (or set the delivery mode to **Standby**).
2. Apply it and call the method from a client, so a stream is open.
3. Choose a response, or **All responses**, and press **Send now**.

## Answering only some requests

Add an `input` block to a scenario. In the editor, press **Request matcher** and pick a type: Layang writes the block with values taken from a request example built from the proto, and you change only the values. **Copy request example** in the same menu copies the JSON a client would send.

| Matcher | Matches when |
| --- | --- |
| `contains` | The listed fields match; other fields are ignored. Strings match as substrings |
| `equals` | The whole request is exactly this |
| `equalsUnordered` | Like `equals`, ignoring array order |
| `matches` | A field matches a regular expression |
| `glob` | A field matches a wildcard such as `TRK-*` |
| `headers` | Request metadata matches, for example `authorization` |
| `or` | Any one of the listed matchers matches |
| `any: true` | Always: an explicit fallback |

```yaml
input:
  contains:
    userId: "42"
```

Several matchers in one `input` must all match. `contains: {}` never matches. Every matcher with a copy button is under **Help → Matching requests** in the app.

## Calling the mock from a browser

Browsers can't speak native gRPC. Start **Web Access** (Runtimes bar or the Web Access card) and point your gRPC-Web client at its URL, `http://127.0.0.1:28080` by default. Host, port, HTTPS, CORS origins, and the forwarding target are all in **Mock settings → Web Access**.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Start is disabled | Open or save a workspace and import a proto schema |
| The client gets the old response | Save the draft, then press **Activate** |
| Send now is disabled | Apply the scenario and save the delivery settings; a client must have the stream open |
| Fields come back empty | Check field names against the proto; unknown fields are dropped |
| CORS error in the browser | Add the page origin under **Mock settings → Web Access → CORS origins** |
| A large scenario shows only metadata | Files of 512 KiB or more open outside the inline editor: **Show YAML in folder**, edit, then **Refresh index** |
