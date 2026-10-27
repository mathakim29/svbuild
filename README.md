# svbuild

Bundle a Svelte 5 app (optionally with Tailwind 4) with one command.

**Requires Node ≥ 20 or [Bun](https://bun.sh)** (uses Bun if installed, else Node; installs deps with bun/npm accordingly).

## Install

```
# npm
npm i -g github:mathakim29/svbuild

# bun
bun add -g github:mathakim29/svbuild
```

## Usage

```
svbuild -i ./src -o ./dist -t
```

The input directory must contain `App.svelte` (or `app.svelte`). The output directory is created if missing.

| Flag | Meaning                                     |
|------|---------------------------------------------|
| `-i` | Input directory (must contain `App.svelte`) |
| `-o` | Output directory                            |
| `-t` | Enable Tailwind                             |
| `-h` | Show help                                   |

## Output

- `bundle.js` — always produced.
- `style.css` — produced with `-t` when Tailwind succeeds (failure is non-fatal).

## Extra packages

List extra npm packages in a `packages.txt` anywhere in the input dir:

```
# one per line
lodash
dayjs@1.11
@scope/pkg@2
```

## Pin, update, remove

```
npx github:mathakim29/svbuild#v1.1.0 -h     # or: bunx ...
npm i -g github:mathakim29/svbuild          # update (npm)
bun add -g github:mathakim29/svbuild        # update (bun)
npm rm -g svbuild                           # remove (npm)
bun remove -g svbuild                       # remove (bun)
```
