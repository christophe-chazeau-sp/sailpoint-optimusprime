# ISC Transform visualizer and editor

A visualizer and editor for SailPoint Identity Security Cloud (ISC) transforms. Load a transform, or build one from blocks, and see it as a left-to-right data-flow diagram. Every step is calculated locally with test values, and the whole transform can be previewed on a real identity of your tenant.

The published app is at https://christophe-chazeau-sp.github.io/sailpoint-optimusprime/. The tenant features need the app to run locally (see [Run locally](#run-locally)), because browsers block direct calls from that site to ISC.

The version in the lower right starts at **0.1**. Every later commit increments it.

> [!WARNING]
> Local results are a simulation. Velocity templates in particular are rendered by a JavaScript engine, not by ISC's Java engine. Read [Warnings](#warnings) and check important transforms on a tenant before using them in production.

## Run locally

```bash
npm start
```

Open http://localhost:4200/. The development server forwards tenant calls through a local proxy (`proxy.conf.js`) to the tenant you sign in to, so the browser is not blocked.

```bash
npx ng test --watch=false
```

`registry.npmjs.org` is blocked on this network, so `.npmrc` points npm at a public mirror.

## Features

### Open a transform

- Pick one of the built-in examples, or **New empty transform** to start from a blank canvas.
- Paste or type JSON in the **JSON document** editor, choose a `.json` file, or drop one on the pane.
- Load a transform from a tenant (see below).

The diagram follows the JSON as you type. When the JSON is invalid, the last valid diagram stays and the editor marks the error. Clicking in the JSON selects the matching step, and selecting a step highlights its JSON.

### Connect to a tenant

- Sign in with a **JWT access token**, or with a **client ID and secret**.
- The tenant can be a name (`acme`), a UI address (`acme.identitynow.com`), or an API address (`acme.api.identitynow.com`). Demo and preprod domains (`identitynow-demo.com`, `identitynow-preprod.com`) work too. The API host is filled in when it is missing.
- When connected, a green banner shows the tenant, with a **Disconnect** link.
- With a JWT, the banner counts down to the token's expiry. It turns amber in the last two minutes and red once the token has expired.
- A JWT issued by another tenant, or one that has already expired, is refused before any call, with a message saying why.
- Search the tenant's transforms by any part of their name, and click one to load it.

The token and the secret stay in memory only. The tenant address and the sign-in method are remembered in the browser.

### Read the diagram

- Each step is a box. Literal values are pills sized to their text. The **in** pill is the transform input, and the **out** pill shows the final result: green when it succeeds, red when it fails.
- A dashed **Implicit input** box marks where a step reads the value of the source attribute the transform is mapped to.
- Steps that were calculated are joined by blue arrows. Branches that were not used stay gray.
- A conditional may declare extra attributes as variables. Dashed arrows labeled with the variable's name and current value run from the conditional to each step that reads it.
- Steps that use Velocity show a **V** bubble. Hover over it for a reminder that the tenant may behave differently.
- Drag boxes around. The diagram buttons reset the layout, the zoom, or both. The minimap button shows an overview of large transforms.
- The left pane can be resized (double-click the splitter to reset it). Each side pane can be folded, and the app remembers your choice.

### Inspect a step

Select a step to see, in the right pane:

- Its name, type, description and output.
- The variables it declares, with their values.
- Every input with its value. The input the step actually used is highlighted, for example the branch a conditional took, or the lookup entry it matched.
- Its Velocity template, when it has one.
- Its own JSON.
- **Edit** and **Delete** buttons, and an **Unplug** button on each connected input.

### Edit a transform

- **Blocks pane:** every transform type, in folded sections (Sources, Text, Dates, Logic, Formats, Generators). Search finds blocks by name, type or description and opens the matching sections. Drag a block onto the canvas, or double-click it.
- **Block form:** a form opens to set up the new block. Common attributes have their own fields. Tables, patterns and other structured attributes are edited as raw JSON. Attributes the form does not know are kept as they are.
- **Edit a block:** double-click it, or use **Edit** in the right pane.
- **Connect blocks:** drag from a block's output dot to another block's input dot, or to **out**. An output feeds one input at a time, so connecting it elsewhere moves the arrow. Pick an arrow up by its end to move it or drop it.
- **Unconnected blocks:** they float on the canvas with a **Not connected** badge, and stay out of the JSON until you connect them.
- **Delete:** press Delete or Backspace with a block selected, or use **Delete** in the right pane.
- **Undo and redo:** Ctrl+Z, and Ctrl+Y or Ctrl+Shift+Z, or the buttons over the canvas. Typing in the JSON editor counts as one step.

Every edit updates the JSON document and keeps its formatting. Boxes keep their positions while you edit, and **Reset layout** arranges them again.

### Test values and local evaluation

The **Test values** section lists everything the transform reads: the implicit input, account attributes (by source) and identity attributes. Type a value in each field, or leave it blank for null. The diagram, the right pane and the transform output update as you type.

### Preview with a tenant identity

When connected to a tenant, **Preview with an identity** in the left pane:

1. **Find an identity** by name or email. The exact text is searched first. If nothing matches, each word is searched as the start of a name or email.
2. **Fill the test values.** The identity's attributes and accounts fill the test values. Any field you edit overrides the identity's value, and picking another identity resets them.
3. **Choose the implicit input.** If the transform uses one, pick a source and one of the identity's account attributes, as in an identity profile mapping.
4. **Run on tenant.** ISC calculates the transform for this identity. The app shows ISC's output or error, and whether it matches the local result.

## Evaluation

The app calculates these types locally: `accountAttribute`, `identityAttribute`, `lower`, `upper`, `trim`, `base64Encode`, `base64Decode`, `decomposeDiacriticalMarks`, `normalizeNames`, `concat`, `join`, `firstValid`, `static`, `conditional`, `indexOf`, `lastIndexOf`, `leftPad`, `rightPad`, `substring`, `split`, `replace`, `replaceAll`, `lookup`, `dateFormat`, `dateMath`, `dateCompare`, `e164phone`, `iso3166`, `displayName`, `randomAlphaNumeric`, `randomNumeric`, `uuid` and `usernameGenerator`.

Not calculated locally (the step reports why):

- `rule`: rules run only on the tenant.
- `reference`: the referenced transform is not loaded in the app.
- `rfc5646`: the language table is not available offline.

Partly calculated:

- `iso3166` only produces the `alpha2` format.
- `e164phone` knows the calling codes of common regions only.
- `usernameGenerator` renders the first pattern only, with an empty `$uniqueCounter`, and does not check uniqueness.
- `randomAlphaNumeric`, `randomNumeric` and `uuid` give a new random value on every calculation.

The [tenant check](tenant-check/README.md) scripts run recorded cases on a tenant and turn the results into tests, so the local evaluator has to agree with ISC on them.

## Warnings

### Velocity is simulated

ISC renders `static` values, `replace` replacements and other templates with Apache Velocity, written in Java. The app uses [velocityjs](https://github.com/shepherdwind/velocity.js), a JavaScript engine, and adapts it to what the tenant showed:

- **Strict mode:** printing an undefined or `null` reference is an error, even when written `$!x`.
- **Unset variables:** `#set($x = null)` leaves `$x` unset, so printing it afterwards fails.
- **True and false in `#if`:** only `null` and `false` count as false. An empty string counts as true.
- **Java string methods:** methods such as `substring`, `split` and `replaceAll` follow Java's rules, including errors for out-of-range indexes.

Anything outside the recorded cases can still differ: other Java methods, number formatting, macros, or unusual syntax. Steps that use Velocity carry a **V** bubble as a reminder. Test them with **Run on tenant** before production.

### `#set($forceNull = null)$forceNull` does not return null

A popular way to force a null result fails on the tenant instead, with *Error rendering template: $forceNull has no value*. Two details make it worse:

- **Inside a `replace`:** the `replacement` is rendered **before** the regex is applied, so it fails even when the regex does not match.
- **Under `firstValid` with `ignoreErrors`:** the error is turned into null for **every** input, not only the one you wanted to clear.

To return null only in some cases, render an undefined variable only in that branch, and wrap the step in a `firstValid` with `ignoreErrors: true`:

```json
{
  "type": "firstValid",
  "attributes": {
    "ignoreErrors": true,
    "values": [
      {
        "type": "static",
        "attributes": {
          "license": { "type": "conditional", "attributes": { "...": "..." } },
          "value": "#if($license == 'NULL_VALUE')$noValue#{else}$license#end"
        }
      }
    ]
  }
}
```

### Dates

- All dates are calculated in **UTC**. `now` is your computer's clock at the time of the calculation, so results near midnight or near a threshold (such as `now-60d`) can differ from a later identity refresh.
- `dateFormat` returns null, without an error, for an input that does not match `inputFormat`, as the tenant does. With `ISO8601` as the input format, only `yyyy-MM-ddTHH:mm:ss.SSS` plus a zone is accepted.
- `dateMath` prints dates in Java's format (`2026-02-28T00:00Z`), clamps month ends (January 31 plus one month is February 28), and rounds up to the start of the next unit.
- A `dateMath` expression that starts with `now` ignores its input. Any other expression applies to the input date.

### Several accounts on one source

When an identity has several accounts on the same source, ISC sorts them by creation date, oldest first, and uses the first one with a non-null value. On an `accountAttribute` step, `accountSortAttribute`, `accountSortDescending`, `accountReturnFirstLink`, `accountFilter` and `accountPropertyFilter` change that rule. The implicit input of an identity profile mapping always uses the default rule.

The app does not apply this rule yet:

- **Local calculation:** it ignores those options and reads one value per source and attribute.
- **Identity preview:** it fills that value from the first matching account the API returns, which may not be the one ISC uses.

When it matters, compare with **Run on tenant**.

### What Run on tenant changes

- **A temporary transform:** ISC's preview only works with saved transforms. The app saves a copy named `optimusprime-preview-…`, runs the identity preview (`POST /v3/identity-profiles/identity-preview`), and deletes the copy afterwards, even when the preview fails. Your own transforms are not touched, and nothing is saved on the identity.
- **Mapped attribute:** the preview maps the transform onto the identity's `displayName` attribute, which every tenant has. It affects only the preview result.
- **Permissions:** your credentials must be allowed to create and delete transforms, search identities, list accounts and run identity previews.
- **Where to use it:** prefer a sandbox or development tenant.

### Credentials

- JWT access tokens expire after a few minutes. Paste a new one when the banner turns red.
- Tokens and secrets are never written to disk or to browser storage. Only the tenant address is remembered.

## Version

`src/app/version.ts` is the version shown in the app. `package.json` keeps the same number with a trailing `.0` (`0.1` and `0.1.0`).

`scripts/pre-commit` runs `scripts/bump-version.mjs`, which increments the number after the dot (`0.1` becomes `0.2`) and stages both files. `npm install` copies that hook into `.git/hooks`, so the bump happens on the next commit.

## Publishing

Pushes to `main` run `.github/workflows/pages.yml`. The workflow builds the Angular app with base href `/sailpoint-optimusprime/` and deploys it to GitHub Pages.

The repository remote is https://github.com/christophe-chazeau-sp/sailpoint-optimusprime. Local credentials live in `.config/`, which Git ignores.
