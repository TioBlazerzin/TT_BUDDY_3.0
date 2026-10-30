const { createServer, request } = require('http')
const { parse } = require('url')
const next = require('next')
try { require('./mcp_override'); console.log('[TT BOOT] Override FINAL') } catch (e) { console.error('[TT BOOT] override falhou:', e.message) }
const agent = require('./tt_agent')
const dev = false
const hostname = '127.0.0.1'
const port = process.env.PORT || 34717
const app = next({ dev, hostname, port, dir: __dirname })
const handle = app.getRequestHandler()

// --- Daemon MCP persistente ---
let mcpDaemon = null
function startMcpDaemon() {
  try {
    const { spawn } = require('child_process')
    const net = require('net')
    const path = require('path')
    const probe = net.connect(34718, '127.0.0.1')
    probe.on('connect', () => { probe.destroy(); console.log('[TT MCP] daemon ja ativo') })
    probe.on('error', () => {
      mcpDaemon = spawn('python', [path.join(__dirname, 'python', 'tt', 'mcp_daemon.py')], {
        cwd: __dirname, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, windowsHide: true
      })
      mcpDaemon.stdout.on('data', d => console.log('[MCP daemon]', String(d).trim()))
      mcpDaemon.stderr.on('data', d => console.log('[MCP daemon]', String(d).trim()))
      mcpDaemon.on('exit', c => console.log('[MCP daemon] encerrado', c))
    })
  } catch (e) { console.error('[TT MCP] daemon falhou:', e.message) }
}
startMcpDaemon()
const stopDaemon = () => { try { mcpDaemon && mcpDaemon.kill() } catch {} }
process.on('exit', stopDaemon)
process.on('SIGINT', () => { stopDaemon(); process.exit() })
process.on('SIGTERM', () => { stopDaemon(); process.exit() })

// --- Roteamento para o agente ---
const KEYWORDS = /(roblox|studio|mcp|script|luau|basepart|\bpart\b|bloco|modelo|model|workspace|serverscriptservice|starterplayer|gui|\bnpc\b|torre|tower|defesa|mapa|\bmap\b|crie|criar|cria|adicione|altere|edite|edit|melhore|corrija|conserte|remova|delete|mova|renomeie|propriedade|cor |roxo|vermelho|azul|verde)/i
const sessions = new Map()
function wantsAgent(text, convId) {
  const s = sessions.get(convId)
  if (s && Date.now() - s.t < 10 * 60 * 1000) return true
  return KEYWORDS.test(text)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', d => chunks.push(d))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      const isChat = req.method === 'POST' && parsedUrl.pathname === '/api/chat' && !req.headers['x-tt-skip']

      if (isChat) {
        console.log('[CHAT] POST /api/chat')
        const raw = await readBody(req)
        let text = '', convId = null
        try { const j = JSON.parse(raw.toString('utf8')); text = j.text || ''; convId = j.conversationId ?? null } catch {}
        const key = String(convId)

        if (text && wantsAgent(text, key)) {
          console.log('[AGENTE] iniciando:', text.slice(0, 80))
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' })
          const send = o => res.write('data: ' + JSON.stringify(o) + '\n\n')
          const t0 = Date.now()
          send({ event: 'state', state: 'tool', detail: 'agente Roblox iniciado' })
          let ses = sessions.get(key)
          if (!ses) { ses = { history: [], t: Date.now() }; sessions.set(key, ses) }
          let answer
          try {
            answer = await agent.runAgent(text, ses.history, d => { console.log('[AGENTE]', d); send({ event: 'state', state: 'tool', detail: d }) })
          } catch (e) {
            console.error('[AGENTE] erro:', e.message)
            answer = 'O agente falhou: ' + e.message
          }
          ses.t = Date.now()
          send({ event: 'answer', outcome: { text: answer, lane: 'tool', tool: 'roblox_agent', tookMs: Date.now() - t0, meta: {} }, conversationId: convId, messageId: Date.now() })
          send({ event: 'done' })
          res.end()
          return
        }

        const headers = { ...req.headers, 'x-tt-skip': '1', 'content-length': raw.length }
        const proxyReq = request({ hostname, port, path: req.url, method: 'POST', headers }, pr => {
          res.writeHead(pr.statusCode, pr.headers)
          pr.pipe(res)
        })
        proxyReq.on('error', e => { res.statusCode = 502; res.end('proxy error: ' + e.message) })
        proxyReq.end(raw)
        return
      }

      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error', req.url, err.message)
      res.statusCode = 500
      res.end('error: ' + err.message)
    }
  }).listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://${hostname}:${port}`)
  })
})