#!/usr/bin/env bun
import { watch, existsSync, mkdirSync } from "node:fs";
import { rm, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, join, normalize, sep, dirname, basename, extname } from "node:path";
import { Command } from "commander";
import pc from "picocolors";

// ---------- Logging (Uvicorn Style) ----------

const log = {
  info: (msg: string) => console.log(`${pc.bold(pc.green("INFO"))}:     ${msg}`),
  warn: (msg: string) => console.log(`${pc.bold(pc.yellow("WARN"))}:     ${msg}`),
  error: (msg: string) => console.error(`${pc.bold(pc.red("ERROR"))}:    ${msg}`),
};

// ---------- Isolated Global Cache ----------

const CACHE_DIR = join(homedir(), ".svbuild-cache");
const NODE_MODULES_DIR = join(CACHE_DIR, "node_modules");

async function ensureGlobalDependencies() {
  if (existsSync(join(NODE_MODULES_DIR, "svelte"))) return;

  log.info("First run setup: installing Svelte 5 into isolated global cache...");
  mkdirSync(CACHE_DIR, { recursive: true });

  const proc = Bun.spawn(["bun", "add", "svelte@^5.0.0"], {
    cwd: CACHE_DIR,
    stdout: "ignore",
    stderr: "inherit",
  });

  if ((await proc.exited) !== 0) {
    log.error("Failed to initialize Svelte compiler cache.");
    process.exit(1);
  }
  log.info("Svelte 5 global cache initialized!");
}

await ensureGlobalDependencies();

const { compile } = await import(join(NODE_MODULES_DIR, "svelte", "compiler", "index.js"));

// ---------- App State ----------

const devStore = new Map<string, { contents: Uint8Array | string; type: string }>();

// ---------- Svelte Plugin ----------

// Svelte's default export condition resolves to the server build
// (where mount() throws), so map the main entries to client builds.
const BROWSER_MAP: Record<string, string> = {
  svelte: "src/index-client.js",
  "svelte/store": "src/store/index-client.js",
};

const sveltePlugin = (prod: boolean, entryPath: string): Bun.BunPlugin => ({
  name: "svelte",
  setup(b) {
    b.onResolve({ filter: /^svelte(\/.*)?$/ }, ({ path }) => {
      const mapped = BROWSER_MAP[path];
      return {
        path: mapped
          ? join(NODE_MODULES_DIR, "svelte", mapped)
          : Bun.resolveSync(path, CACHE_DIR),
      };
    });

    b.onResolve({ filter: /^virtual:entry$/ }, () => ({
      path: "virtual:entry",
      namespace: "virtual",
    }));

    b.onLoad({ filter: /.*/, namespace: "virtual" }, () => ({
      contents: `
        import { mount } from "svelte";
        import App from ${JSON.stringify(entryPath)};
        mount(App, { target: document.body });
      `,
      loader: "js",
    }));

    b.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
      const src = await Bun.file(path).text();
      const { js, warnings } = compile(src, {
        filename: path,
        generate: "client",
        css: "injected",
        dev: !prod,
      });
      if (!prod) {
        for (const w of warnings) log.warn(`${w.filename}: ${w.message}`);
      }
      return { contents: js.code, loader: "js" };
    });
  },
});

const page = (title: string, js: string, reload: boolean) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<script src="https://unpkg.com/@tailwindcss/browser@4"></script>
</head><body class="bg-zinc-950 text-zinc-100 font-mono">
<script type="module" src="/${js}"></script>${
  reload
    ? `
<script>new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host+"/ws").onmessage=()=>location.reload()</script>`
    : ""
}
</body></html>`;

// ---------- Build Logic ----------

async function buildProd(entry: string, outDir: string, title: string): Promise<boolean> {
  if (!(await Bun.file(entry).exists())) {
    log.error(`Entry file not found: ${entry}`);
    return false;
  }
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const r = await Bun.build({
    entrypoints: ["virtual:entry"],
    outdir: outDir,
    naming: "app-[hash].[ext]",
    target: "browser",
    minify: true,
    sourcemap: "external",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [sveltePlugin(true, entry)],
  });

  if (!r.success) {
    for (const l of r.logs) console.error(l);
    return false;
  }

  const js = basename(r.outputs.find((o) => o.kind === "entry-point")!.path);
  await Bun.write(join(outDir, "index.html"), page(title, js, false));
  log.info(`Successfully built production app → ${pc.cyan(outDir)}`);
  return true;
}

async function buildDevInMemory(entry: string, title: string): Promise<boolean> {
  if (!(await Bun.file(entry).exists())) {
    log.error(`Entry file not found: ${entry}`);
    return false;
  }
  const r = await Bun.build({
    entrypoints: ["virtual:entry"],
    naming: "app.[ext]",
    target: "browser",
    minify: false,
    sourcemap: "inline",
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    plugins: [sveltePlugin(false, entry)],
  });

  if (!r.success) {
    for (const l of r.logs) console.error(l);
    return false;
  }

  devStore.clear();
  let jsName = "app.js";
  for (const out of r.outputs) {
    const filename = basename(out.path);
    const contents = new Uint8Array(await out.arrayBuffer());
    devStore.set(`/${filename}`, { contents, type: out.type });
    if (out.kind === "entry-point") jsName = filename;
  }

  devStore.set("/index.html", {
    contents: page(title, jsName, true),
    type: "text/html; charset=utf-8",
  });

  return true;
}

// ---------- Server ----------

const SECURITY = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
};
const COMPRESSIBLE = /^(text\/|application\/(javascript|json)|image\/svg)/;

function serve(
  dev: boolean,
  port: number,
  host: string,
  entry: string,
  outDir: string,
  title: string,
) {
  const pid = process.pid;
  const gzCache = new Map<string, Uint8Array>();

  log.info(`Started server process [${pc.cyan(String(pid))}]`);
  log.info("Waiting for application startup.");

  const server = Bun.serve({
    port,
    hostname: host,

    async fetch(req, srv) {
      const url = new URL(req.url);

      if (dev && url.pathname === "/ws")
        return srv.upgrade(req)
          ? undefined
          : new Response("Upgrade failed", { status: 400 });

      if (url.pathname === "/healthz")
        return new Response("ok", { headers: SECURITY });

      if (req.method !== "GET" && req.method !== "HEAD")
        return new Response("Method not allowed", {
          status: 405,
          headers: { allow: "GET, HEAD", ...SECURITY },
        });

      let rel: string;
      try {
        rel = normalize(decodeURIComponent(url.pathname));
      } catch {
        return new Response("Bad request", { status: 400, headers: SECURITY });
      }
      if (rel.includes("\0"))
        return new Response("Bad request", { status: 400, headers: SECURITY });

      // Dev mode: serve from RAM
      if (dev) {
        let item = devStore.get(rel);
        if (!item && (rel.endsWith(sep) || !extname(rel))) {
          item = devStore.get("/index.html");
        }
        if (!item)
          return new Response("Not found", { status: 404, headers: SECURITY });

        return new Response(item.contents, {
          headers: {
            ...SECURITY,
            "content-type": item.type,
            "cache-control": "no-store",
          },
        });
      }

      // Prod/start mode: serve from disk
      const full = join(outDir, rel);
      if (full !== outDir && !full.startsWith(outDir + sep))
        return new Response("Forbidden", { status: 403, headers: SECURITY });

      let servedPath = full;
      let file = Bun.file(servedPath);
      if (rel.endsWith(sep) || !(await file.exists())) {
        if (!rel.endsWith(sep) && extname(rel))
          return new Response("Not found", { status: 404, headers: SECURITY });
        servedPath = join(outDir, "index.html");
        file = Bun.file(servedPath);
      }

      const hashed = /^app-[\w-]+\.\w+(\.map)?$/.test(basename(servedPath));
      const headers: Record<string, string> = {
        ...SECURITY,
        "content-type": file.type,
        "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
      };

      if (
        COMPRESSIBLE.test(file.type) &&
        req.headers.get("accept-encoding")?.includes("gzip")
      ) {
        let buf = gzCache.get(servedPath);
        if (!buf) {
          buf = Bun.gzipSync(new Uint8Array(await file.arrayBuffer()));
          gzCache.set(servedPath, buf);
        }
        return new Response(buf, {
          headers: { ...headers, "content-encoding": "gzip", vary: "accept-encoding" },
        });
      }
      return new Response(file, { headers });
    },

    websocket: {
      open: (ws) => ws.subscribe("reload"),
      message() {},
    },

    error(err) {
      log.error((err as Error).message);
      return new Response("Internal Server Error", { status: 500, headers: SECURITY });
    },
  });

  log.info("Application startup complete.");
  const boundHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  log.info(
    `Server running on ${pc.bold(pc.cyan(`http://${boundHost}:${server.port}`))} (Press CTRL+C to quit)`,
  );

  if (dev) {
    log.info(`Will watch for changes in: [${pc.cyan(`'${dirname(entry)}'`)}]`);
    let timer: ReturnType<typeof setTimeout>;
    let building = false;
    let pending = false;
    const rebuild = async () => {
      if (building) {
        pending = true;
        return;
      }
      building = true;
      const ok = await buildDevInMemory(entry, title);
      building = false;
      if (ok) {
        server.publish("reload", "reload");
        log.info("Reloading application state due to changes.");
      }
      if (pending) {
        pending = false;
        rebuild();
      }
    };

    watch(dirname(entry), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 50);
    });
  }

  let closing = false;
  const shutdown = () => {
    if (closing) process.exit(1);
    closing = true;
    console.log("");
    log.info("Shutting down");
    log.info("Waiting for application shutdown.");
    server.stop(true);
    log.info("Application shutdown complete.");
    log.info(`Finished server process [${pc.cyan(String(pid))}]`);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ---------- Command Dispatcher ----------

async function runCmd(cmd: "dev" | "build" | "start", opts: any) {
  const port = Number(opts.port ?? process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    log.error(`Invalid port: ${opts.port ?? process.env.PORT}`);
    process.exit(1);
  }

  const host =
    opts.host ?? process.env.HOST ?? (cmd === "dev" ? "localhost" : "0.0.0.0");
  const entry = resolve(opts.entry ?? "src/App.svelte");
  const outDir = resolve(opts.out ?? "dist");
  const title = (opts.title ?? "Svelte App").replace(
    /[&<>"]/g,
    (c: string) => `&#${c.charCodeAt(0)};`,
  );

  if (cmd === "build") {
    log.info("Starting production build process...");
    const ok = await buildProd(entry, outDir, title);
    process.exit(ok ? 0 : 1);
  }

  if (cmd === "start") {
    if (!(await Bun.file(join(outDir, "index.html")).exists())) {
      log.error(`No build found in ${outDir}. Run: svbuild build`);
      process.exit(1);
    }
    serve(false, port, host, entry, outDir, title);
    return;
  }

  // dev
  const ok = await buildDevInMemory(entry, title);
  if (!ok) process.exit(1);
  serve(true, port, host, entry, outDir, title);
}

// ---------- CLI Setup ----------
// No defaults on --port/--host so PORT/HOST env vars work (defaults live in runCmd).

const program = new Command();

program
  .name("svbuild")
  .description("Lightweight Svelte 5 dev server & bundler")
  .version("1.0.0");

program
  .command("dev", { isDefault: true })
  .description("Compile in-memory, serve, watch and live-reload")
  .option("-p, --port <number>", "Port number (default: 3000)")
  .option("-H, --host <host>", "Host address (default: localhost)")
  .option("-e, --entry <file>", "Root component entry file", "src/App.svelte")
  .option("-t, --title <text>", "HTML page title", "Svelte App")
  .action((opts) => runCmd("dev", opts));

program
  .command("build")
  .description("Production build into output directory")
  .option("-e, --entry <file>", "Root component entry file", "src/App.svelte")
  .option("-o, --out <dir>", "Output directory", "dist")
  .option("-t, --title <text>", "HTML page title", "Svelte App")
  .action((opts) => runCmd("build", opts));

program
  .command("start")
  .description("Serve an existing build from output directory")
  .option("-p, --port <number>", "Port number (default: 3000)")
  .option("-H, --host <host>", "Host address (default: 0.0.0.0)")
  .option("-o, --out <dir>", "Output directory", "dist")
  .action((opts) => runCmd("start", opts));

await program.parseAsync(process.argv);