/**
 * server.cjs — Servidor WebSocket local para o Teleprompter AVDP
 *
 * Responsabilidades:
 *   - Fazer bridge de estado entre o Painel de Controle (browser local)
 *     e o DisplayOutput dentro do OBS (Browser Source isolado).
 *   - Guardar o último estado em memória para novos clientes que se conectam
 *     já receberem o estado atual.
 *
 * Porta padrão: 3001
 * Uso: node server.cjs
 */

const { WebSocketServer } = require('ws');

const PORT = 3001;
const wss = new WebSocketServer({ port: PORT });

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
console.log('   Painel de controle e OBS Browser Source se comunicarão aqui.\n');
