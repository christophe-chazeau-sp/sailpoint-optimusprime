# ISC Transform Visualizer

A read-only viewer for SailPoint Identity Security Cloud transforms. Paste or drop a transform JSON document and see it as a left-to-right data-flow diagram. Each step can be evaluated locally with test values.

The published app is at https://christophe-chazeau-sp.github.io/sailpoint-optimusprime/.

The version in the lower right starts at **0.1**. Every later commit increments it.

## Run locally

```bash
npm start
```

Open http://localhost:4200/.

```bash
npx ng test --watch=false
```

`registry.npmjs.org` is blocked on this network, so `.npmrc` points npm at a public mirror.

## What you can do

- Load an example, paste JSON, or drop a `.json` file.
- Resize the source pane and hide either side pane.
- Select a step to see its type, output, variables, and inputs. The input that the step actually used is highlighted.
- Supply the implicit input and any account or identity attributes the transform reads. The diagram and the **Transform output** field update together.
- Drag boxes around, then use the diagram buttons to reset the layout, the zoom, or both.

## Evaluation

The app calculates the common Identity Security Cloud transform types locally, including string operations, `firstValid`, `conditional`, `static` Velocity templates, lookup tables, and the date transforms (`dateFormat`, `dateMath`, `dateCompare`).

A conditional may declare extra attributes as variables. Those are evaluated, shown on the action and in the right pane, and can be reused later in the branch as `$variableName`. A replacement such as `#set($forceNull = null)$forceNull` produces null.

Steps that were calculated are drawn with blue arrows. Branches that were not entered stay gray.

Rules, referenced transforms that are not in the document, and the full RFC 5646 language table are not calculated offline.

## Version

`src/app/version.ts` is the version shown in the app. `package.json` keeps the same number with a trailing `.0` (`0.1` and `0.1.0`).

`scripts/pre-commit` runs `scripts/bump-version.mjs`, which increments the number after the dot (`0.1` becomes `0.2`) and stages both files. `npm install` copies that hook into `.git/hooks`, so the bump happens on the next commit.

## Publishing

Pushes to `main` run `.github/workflows/pages.yml`. The workflow builds the Angular app with base href `/sailpoint-optimusprime/` and deploys it to GitHub Pages.

The repository remote is https://github.com/christophe-chazeau-sp/sailpoint-optimusprime. Local credentials live in `.config/`, which Git ignores.
