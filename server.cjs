/**
 * server.cjs — Servidor WebSocket local para o Teleprompter AVDP
 *
 * Responsabilidades:
 *   - Fazer bridge de estado entre o Painel de Controle (browser local)
 *     e o DisplayOutput dentro do OBS (Browser Source isolado).
 *   - Guardar o último estado em memória para novos clientes que se conectam
 *     já receberem o estado atual.
 *
 *   - Buscar o Google Doc (rota HTTP GET /doc?id=...) direto do Node, sem
 *     depender de proxies CORS públicos, que são instáveis.
 *
 * Porta padrão: 3001
 * Uso: node server.cjs
 */

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = 3001;
const DOC_FETCH_TIMEOUT_MS = 15000;
const DOC_FETCH_ATTEMPTS = 3;
// Permite apontar para outro host em testes (padrão: Google Docs)
const DOCS_BASE_URL = process.env.DOCS_BASE_URL || 'https://docs.google.com';

// Última versão boa de cada documento — usada se o Google falhar momentaneamente
const docCache = new Map();

const fetchDocHtml = async (docId) => {
  const url = `${DOCS_BASE_URL}/document/d/${docId}/export?format=html&t=${Date.now()}`;
  let lastError = null;
  for (let attempt = 1; attempt <= DOC_FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(DOC_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Google Docs respondeu ${response.status}`);
      const html = await response.text();
      // Documento privado: o Google devolve a página de login em vez do HTML exportado
      if (response.url.includes('accounts.google.com')) {
        throw new Error('Documento sem acesso público (compartilhe como "Qualquer pessoa com o link")');
      }
      return html;
    } catch (e) {
      lastError = e;
      console.warn(`[DOC] Tentativa ${attempt}/${DOC_FETCH_ATTEMPTS} falhou: ${e.message}`);
      if (attempt < DOC_FETCH_ATTEMPTS) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastError;
};

const httpServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method !== 'GET' || reqUrl.pathname !== '/doc') {
    res.writeHead(404).end();
    return;
  }

  const docId = reqUrl.searchParams.get('id') || '';
  if (!/^[a-zA-Z0-9_-]+$/.test(docId)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ID de documento inválido');
    return;
  }

  try {
    const html = await fetchDocHtml(docId);
    docCache.set(docId, html);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
  } catch (e) {
    const cached = docCache.get(docId);
    if (cached) {
      console.warn('[DOC] Usando a última versão salva do documento.');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Doc-Cache': 'stale' }).end(cached);
      return;
    }
    console.error('[DOC] Erro ao buscar documento:', e.message);
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }).end(e.message);
  }
});

const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT);

// Último estado recebido — enviado a novos clientes ao conectar
let lastState = null;

// Conjunto de clientes conectados
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Cliente conectado. Total: ${clients.size}`);

  // Envia o estado atual imediatamente para o novo cliente (ex: OBS que acabou de abrir)
  if (lastState) {
    try {
      ws.send(lastState);
    } catch (e) {
      // ignora se falhar
    }
  }

  ws.on('message', (data) => {
    // Guarda o último estado
    lastState = data.toString();

    // Faz broadcast para todos os outros clientes
    for (const client of clients) {
      if (client !== ws && client.readyState === 1 /* OPEN */) {
        try {
          client.send(lastState);
        } catch (e) {
          // ignora clientes com problemas
        }
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Cliente desconectado. Total: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Erro:', err.message);
    clients.delete(ws);
  });
});

console.log(`✅ Servidor WebSocket rodando em ws://localhost:${PORT}`);
console.log('   Painel de controle e OBS Browser Source se comunicarão aqui.');
console.log(`✅ Leitura do Google Docs em http://localhost:${PORT}/doc\n`);
