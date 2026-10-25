# svbuild

Bundle a Svelte 5 app (optionally with Tailwind 4) with one command.

**Requires [Bun](https://bun.sh)** 

### Usage

```bash
# global install
bun add -g github:mathakim29/svbuild
svbuild -i ./src -o ./dist -t
```

The input directory must contain `App.svelte` (or `app.svelte`). The output
directory is created if it does not exist.

| Flag | Meaning                        |
| ---- | ------------------------------ |
| `-i` | input dir (must have App.svelte) |
| `-o` | output dir                     |
| `-t` | enable Tailwind                |
| `-h` | help                           |

Output: `bundle.js` and, when `-t` is used successfully, `style.css`.

Tailwind failures are non-fatal: svbuild still produces `bundle.js` and prints
a warning if it cannot generate `style.css`.

### Extra packages

Put a `packages.txt` anywhere in the input dir:

```
# one per line
lodash
dayjs@1.11
@scope/pkg@2
```

### Pin / update / remove
```bash
bunx github:mathakim29/svbuild#v1.0.0 -h
bun add -g github:mathakim29/svbuild      # update
bun remove -g svbuild
```
