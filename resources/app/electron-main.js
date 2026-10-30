/**
 * ============================================================
 * TT_BUDDY 3.0 — Desktop Shell (Electron)
 * ------------------------------------------------------------
 * Este processo:
 *   1. Prepara uma pasta de dados gravável ao lado do .exe
 *   2. Lê config.json (chaves de IA opcionais) → variáveis de ambiente
 *   3. Sobe o servidor Next.js standalone embutido (porta livre local)
 *      usando o próprio runtime Node do Electron (ELECTRON_RUN_AS_NODE)
 *   4. Abre a janela HUD assim que /api/status responder
 *   5. Encerra o servidor ao fechar a janela
 * Nenhum navegador externo é necessário — tudo roda dentro do app.
 * ============================================================
 */

const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");

const APP_NAME = "TT_BUDDY";
const BASE_PORT = 34717;
const SERVER_READY_TIMEOUT_MS = 60_000;

let serverProc = null;
let mainWindow = null;
let isQuitting = false;

/* ---------------------------------------------------------- */
/* Utilidades                                                  */
/* ---------------------------------------------------------- */

/** Pasta de dados gravável: ao lado do .exe (modo portátil) ou %APPDATA%. */
function resolveDataDir() {
  try {
    const exeDir = path.dirname(app.getPath("exe"));
    const dataDir = path.join(exeDir, "data");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.W_OK);
    return dataDir;
  } catch {
    // Sem permissão de escrita (ex.: Program Files) → perfil do usuário
    const userData = app.getPath("userData");
    fs.mkdirSync(userData, { recursive: true });
    return userData;
  }
}

/** Lê config.json ao lado do .exe; senão usa o template interno. */
function readConfig(dataDir) {
  const candidates = [
    path.join(dataDir, "config.json"),
    path.join(__dirname, "config.json"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        return { file, json: JSON.parse(fs.readFileSync(file, "utf8")) };
      }
    } catch (e) {
      console.warn("[TT_BUDDY] config.json inválido:", file, e.message);
    }
  }
  return { file: null, json: {} };
}

/** Encontra a primeira porta local livre a partir de BASE_PORT. */
function findFreePort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port, attemptsLeft) => {
      if (attemptsLeft <= 0) return reject(new Error("sem portas livres"));
      const srv = net.createServer();
      srv.once("error", () => tryPort(port + 1, attemptsLeft - 1));
      srv.once("listening", () => srv.close(() => resolve(port)));
      srv.listen(port, "127.0.0.1");
    };
    tryPort(startPort, 25);
  });
}

/** Faz polling em /api/status até responder 200 (ou estourar o timeout). */
function waitServerReady(port, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/api/status", timeout: 2500 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) return resolve(true);
          retry();
        }
      );
      req.on("error", retry);
      req.on("timeout", () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        return reject(new Error("servidor interno não respondeu a tempo"));
      }
      setTimeout(tick, 350);
    };
    tick();
  });
}

/** Copia o banco inicial (resources/app/db/custom.db) para a pasta de dados. */
function seedDatabase(dataDir) {
  const target = path.join(dataDir, "tt_buddy.db");
  if (fs.existsSync(target)) return target; // nunca sobrescrever dados do usuário
  const source = path.join(__dirname, "db", "custom.db");
  try {
    if (fs.existsSync(source)) fs.copyFileSync(source, target);
  } catch (e) {
    console.warn("[TT_BUDDY] seed do banco falhou:", e.message);
  }
  return target;
}

/* ---------------------------------------------------------- */
/* Inicialização                                               */
/* ---------------------------------------------------------- */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(bootstrap);
}

async function bootstrap() {
  const dataDir = resolveDataDir();
  const dbFile = seedDatabase(dataDir);
  const { json: config } = readConfig(dataDir);
  const port = await findFreePort(BASE_PORT);

  /* Chaves de IA opcionais (config.json) → variáveis de ambiente.
     A cadeia de provedores em src/lib/buddy/llm.ts lê esses nomes. */
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    ELECTRON_NO_ATTACH_CONSOLE: "1",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: `file:${dbFile.split(path.sep).join("/")}`,
    TT_TEMPERATURE: String(config.temperature ?? 0.5),
    TT_MAX_TOKENS: String(config.maxTokens ?? 900),
  };
  if (config.geminiApiKey) env.GEMINI_API_KEY = String(config.geminiApiKey);
  if (config.deepseekApiKey) env.DEEPSEEK_API_KEY = String(config.deepseekApiKey);
  if (config.openaiApiKey) env.OPENAI_API_KEY = String(config.openaiApiKey);

  /* Servidor Next.js standalone embutido (pasta server/). */
  const serverDir = path.join(__dirname, "server");
  const serverEntry = path.join(serverDir, "server.js");
  serverProc = spawn(process.execPath, [serverEntry], {
    cwd: serverDir,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProc.stdout.on("data", (d) => console.log(`[server] ${d}`.trimEnd()));
  serverProc.stderr.on("data", (d) => console.warn(`[server] ${d}`.trimEnd()));
  serverProc.on("exit", (code) => {
    serverProc = null;
    if (!isQuitting && code !== 0 && code !== null && !mainWindow?.isDestroyed()) {
      dialog.showErrorBox(
        "TT_BUDDY",
        `O servidor interno encerrou inesperadamente (código ${code}).\nReabra o aplicativo.`
      );
      app.quit();
    }
  });

  /* Janela principal (fundo azul-profundo enquanto carrega). */
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: "#0A192F",
    title: "TT_BUDDY 3.0",
    autoHideMenuBar: true,
    icon: iconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  // Links externos (ex.: fontes de pesquisa) abrem no navegador padrão
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  try {
    await waitServerReady(port, SERVER_READY_TIMEOUT_MS);
    await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  } catch (e) {
    dialog.showErrorBox(
      "TT_BUDDY",
      `Falha ao iniciar o sistema interno:\n\n${e?.message ?? e}`
    );
    app.quit();
    return;
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

/** Ícone do app (.ico na raiz do resources/app). */
function iconPath() {
  const ico = path.join(__dirname, "ttbuddy.ico");
  return fs.existsSync(ico) ? ico : undefined;
}

/* ---------------------------------------------------------- */
/* Ciclo de vida                                               */
/* ---------------------------------------------------------- */

app.on("before-quit", () => {
  isQuitting = true;
  if (serverProc) {
    try { serverProc.kill(); } catch {}
    serverProc = null;
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
