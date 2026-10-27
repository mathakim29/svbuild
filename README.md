# svbuild
Bundle a Svelte 5 app (optionally with Tailwind 4) with one command.

**Requires [Bun](https://bun.sh).**

## Usage

```bash
# global install
bun add -g github:mathakim29/svbuild

# compile
svbuild -i ./src -o ./dist -t
```

The input directory must contain `App.svelte` (or `app.svelte`). The output directory is created if it does not exist.

## Example

A typical project before running `svbuild`:

```text
my-app/
├── src/
│   ├── App.svelte
│   ├── components/
│   │   └── Button.svelte
│   ├── main.ts
│   └── packages.txt      # optional extra packages
└── dist/                 # created by svbuild
```

Run it from the project root:

```bash
svbuild -i ./src -o ./dist -t
```

Resulting output:

```text
my-app/
├── src/
│   └── ...
└── dist/
    ├── bundle.js
    └── style.css         # only when -t succeeds
```

## Options

| Flag | Meaning |
|------|---------|
| `-i` | Input directory (must contain `App.svelte`) |
| `-o` | Output directory |
| `-t` | Enable Tailwind |
| `-h` | Show help |

## Output

- `bundle.js` — always produced.
- `style.css` — produced when `-t` is used and Tailwind succeeds.

Tailwind failures are **non-fatal**: `svbuild` still produces `bundle.js` and prints a warning if it cannot generate `style.css`.

## Extra packages

List additional npm packages in a `packages.txt` anywhere in the input directory:

```txt
# one per line
lodash
dayjs@1.11
@scope/pkg@2
```

## Pin, update, remove

```bash
# pin to a specific release
bunx github:mathakim29/svbuild#v1.0.0 -h

# update the global install
bun add -g github:mathakim29/svbuild

# remove
bun remove -g svbuild
```

## Project structure

| File | Purpose |
|------|---------|
| `svbuild.ts` | CLI entry point |
| `package.json` | Package metadata |
| `README.md` | Documentation |

---
