<div align="center">
  <h3>svbuild</h3>
</div>

A lightweight dev server and production bundler for Svelte 5, powered by Bun. Run a Svelte app without setting up a Vite configuration or a separate development server.

## Requirements

- [Bun](https://bun.sh/) installed and available on your `PATH`
- A Svelte 5 root component, by default `src/App.svelte`

## Quick start

Create a Svelte component in `src/App.svelte`:

```svelte
<script>
  let count = $state(0);
</script>

<main>
  <h1>Hello, Svelte!</h1>
  <button onclick={() => count++}>Count: {count}</button>
</main>
```

Run the development server with Bun's package runner:

```sh
bunx svbuild dev
```

Open the address printed in the terminal (by default, `http://localhost:3000`). The dev server compiles the app in memory, watches the entry file's directory, and reloads the page when files change.


| Command | Description |
| --- | --- |
| `svbuild dev` | Compile and serve the app from memory with file watching and live reload. This is the default command. |
| `svbuild build` | Create an optimized production build in `dist/`. |
| `svbuild start` | Serve an existing production build from `dist/`. Run `build` first. |

With `bunx`, for example:

```sh
bunx svbuild dev
bunx svbuild build
bunx svbuild start
```



| Option | Commands | Default | Description |
| --- | --- | --- | --- |
| `-e, --entry <file>` | `dev`, `build` | `src/App.svelte` | Root Svelte component. |
| `-o, --out <dir>` | all | `dist` | Production output directory or directory to serve. |
| `-t, --title <text>` | `dev`, `build` | `Svelte App` | HTML document title. |
| `-p, --port <number>` | `dev`, `start` | `3000` | Server port. Use `0` to let the OS choose an available port. |
| `-H, --host <host>` | `dev`, `start` | `localhost` for `dev`; `0.0.0.0` for `start` | Interface/address to bind the server to. |

Examples:

```sh
bunx svbuild dev --entry src/main.svelte --port 4173
bunx svbuild build --entry src/main.svelte --out build --title "My App"
bunx svbuild start --out build --host localhost --port 8080
```

Use `bunx svbuild --help` or `bunx svbuild <command> --help` to see CLI help.

## Production

Build and serve the generated files:

```sh
bunx svbuild build
bunx svbuild start
```

The build writes `index.html` and hashed JavaScript assets to `dist/`. It also creates an external source map. The `start` command serves that directory; it does not rebuild the app. A `GET` request to `/healthz` returns `ok`.

**The build command removes the configured output directory before writing the new build.** Set `--out` to a directory dedicated to generated files, not a directory containing files you need to keep.

## Packages and styling
Svelte components are compiled and bundled with Bun; install packages your app imports in the project as usual so the bundler can resolve them. External CDN packages can also be loaded directly by your app when appropriate.
