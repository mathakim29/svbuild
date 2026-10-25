# svbuild

Bundle a Svelte 5 app (optional Tailwind 4) with one command.

**Requires [Bun](https://bun.sh)** (uses `Bun.spawn`).

## Usage

```bash
# no install (runs straight from GitHub)
bunx github:USER/svbuild -i ./src -o ./dist -t

# global install
bun add -g github:USER/svbuild
svbuild -i ./src -o ./dist -t
```

| Flag | Meaning                        |
| ---- | ------------------------------ |
| `-i` | input dir (must have App.svelte) |
| `-o` | output dir                     |
| `-t` | enable Tailwind                |
| `-h` | help                           |

Output: `bundle.js` (+ `style.css` with `-t`).

## Extra packages

Put a `packages.txt` anywhere in the input dir:

```
# one per line
lodash
dayjs@1.11
@scope/pkg@2
```

Deps are installed into `/tmp/build` and cached.

## Pin / update / remove

```bash
bunx github:mathakim29/svbuild#v1.0.0 -h
bun add -g github:mathakim/svbuild      # update
bun remove -g svbuild
```
