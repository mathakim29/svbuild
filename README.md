# SveltePHP

[![PHP 8](https://img.shields.io/badge/PHP-8.x-777BB4?logo=php&logoColor=white)](https://www.php.net/)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev/)

A PHP application served by FrankenPHP with a Svelte frontend compiled by Bun.
The development stack is managed with the `pyorca` container helper, and
JavaScript dependencies stay inside the container.

> **Experimental:** This project is experimental and may change without notice.

## Requirements

- Python 3.10+
- `uv` or another Python package runner
- Docker, Podman, or nerdctl

## Run

The recommended workflow uses `init.py`, which provisions MySQL, builds the
FrankenPHP image, and starts the application container:

```sh
uv run init.py up
```

Other lifecycle commands are available:

```sh
uv run init.py status
uv run init.py logs
uv run init.py down
uv run init.py restart
```

The project is tested using `nerdctl`, but Docker and Podman should work
similarly.

For the legacy Compose workflow, use:

```sh
nerdctl compose up --build
```

The application is available at `http://localhost:8020`; phpMyAdmin is
available at `http://localhost:8080` when enabled through the Compose setup.

## Project layout

- `init.py` — pyorca deployment entry point
- `app/` — Svelte components and frontend package manifests
- `server/` — PHP application entry point
- `setup.ts` — Bun/Svelte build script
- `Dockerfile` and `Caddyfile` — FrankenPHP runtime configuration

## `svbuild` CLI

The frontend compiler is also packaged as a standalone Bun CLI. It is hosted
in this GitHub repository rather than published to npm.

Add it directly from GitHub to another Bun project:

```sh
bun add --dev github:mathakim29/sveltephp#master
```

Then run it without a global install:

```sh
bunx svbuild -i ./app -o ./public/dist
```

Enable Tailwind processing with `-t`:

```sh
bunx svbuild -i ./app -o ./public/dist -t
```

For a one-off invocation without adding a dependency:

```sh
bunx --package github:mathakim29/sveltephp svbuild \
  -i ./app \
  -o ./public/dist
```

Pin a branch, tag, or commit when reproducible builds are required:

```sh
bun add --dev github:mathakim29/sveltephp#v0.1.0
```

The CLI discovers every `packages.txt` below the input directory, installs
missing dependencies into `/tmp/build/node_modules`, and writes `bundle.js`
and (when enabled) `style.css` to the output directory. The package metadata
and executable mapping are defined in `package.json`.

## Frontend dependencies

Frontend dependencies are declared in `packages.txt` files. The compiler
recursively checks the frontend directory and installs each package with Bun.
The following entries are examples only; use the packages required by your
frontend:

```text
dayjs@1.11.13
blockly@12.3.1
```

Use regular package imports in Svelte files:

```js
import dayjs from 'dayjs';
```

Build-time packages are hardcoded in the Dockerfile. No host-side
`package.json` is required, and `node_modules` is stored in the
container-only `/tmp/build/node_modules` volume.

## Services

- FrankenPHP serves the PHP application and compiled Svelte assets.
- Bun compiles Svelte and optionally Tailwind CSS.
- MySQL provides the application database.
- phpMyAdmin provides database administration.
