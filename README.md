# svbuild

`svbuild` is a Bun-powered command-line builder for small Svelte
applications. It discovers frontend dependencies from `packages.txt` files,
installs missing packages into a temporary build directory, and produces a
browser-ready JavaScript bundle.

## Requirements

- [Bun](https://bun.sh/) 1.0 or newer
- A Svelte app containing `App.svelte` or `app.svelte`

## Run from GitHub

This package is distributed directly from GitHub and does not require npm
publication.

Install it as a development dependency:

```sh
bun add --dev github:mathakim29/sveltephp#master
```

Run the CLI:

```sh
bunx svbuild -i ./app -o ./dist
```

For a one-off run without adding a dependency:

```sh
bunx --package github:mathakim29/sveltephp svbuild \
  -i ./app \
  -o ./dist
```

Pin a tag, branch, or commit for reproducible builds:

```sh
bun add --dev github:mathakim29/sveltephp#v0.1.0
```

## Options

```text
-i, --input   Directory containing App.svelte and packages.txt files
-o, --output  Directory for bundle.js and generated CSS
-t, --tailwind  Generate style.css with Tailwind CSS
-h, --help    Show usage information
```

Example with Tailwind:

```sh
bunx svbuild -i ./app -o ./dist -t
```

## Dependency discovery

`svbuild` always includes Svelte 5. It recursively scans the input directory
for `packages.txt` files. Each non-empty, non-comment line is treated as a
package specifier, for example:

```text
dayjs@1.11.13
blockly@12.3.1
```

Dependencies are installed under `/tmp/build/node_modules` and reused across
runs when available. The output directory receives `bundle.js` and, when
Tailwind succeeds, `style.css`.

## Local development

Run the CLI directly from this repository:

```sh
bun run setup.ts -i ./example-app -o ./dist
```

The executable is declared in `package.json`:

```json
{
  "bin": {
    "svbuild": "./setup.ts"
  }
}
```

## License

No license has been selected yet.
