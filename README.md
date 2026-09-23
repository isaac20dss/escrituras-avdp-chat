<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Leitor de Escrituras para OBS

Painel React para selecionar trechos de um Google Doc e enviar o conteudo para o OBS.

## Como usar

1. Instale as dependencias com `npm install`.
2. Rode o projeto com `npm run dev`.
3. Abra `/#/control` para operar o leitor.
4. No OBS, ative o plugin `obs-websocket` (porta padrao `4455`).
5. Crie duas fontes de texto no OBS:
   `titleSourceName`: recebe o titulo da escritura.
   `bodySourceName`: recebe o corpo em texto puro.
6. No painel, preencha:
   `OBS WebSocket URL`: normalmente `ws://127.0.0.1:4455`
   `Senha`: se o websocket do OBS estiver protegido
   `Cena`: opcional, usada para ligar/desligar a visibilidade das fontes
   `Fonte de titulo` e `Fonte de corpo`: nomes exatos das fontes no OBS
7. Marque `Sincronizar texto com fontes do OBS` e clique em `Conectar`.

## Comportamento

- Ao selecionar uma secao, o painel envia titulo e corpo para o OBS automaticamente.
- O corpo e convertido de HTML para texto puro antes do envio.
- O botao de visibilidade tambem pode ligar/desligar as fontes dentro da cena configurada.
- O modo `/display` continua disponivel se voce quiser usar Browser Source em vez de fontes de texto.
