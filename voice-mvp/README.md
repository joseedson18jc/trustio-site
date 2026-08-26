# Trustio Voice Demo · Crédito Jus

MVP privado para compartilhar o Voice Sales Agent treinado da Crédito Jus com prospects B2C e B2B.

## Escopo do agente

Este deployment é **exclusivo da Crédito Jus**. O backend está vinculado ao saved xAI Voice Agent:

```text
agent_XrzC3PUBPY9m5pEs
```

Esse ID não deve ser reutilizado em páginas, demos, tenants ou clientes diferentes. Há um override opcional chamado `CREDITOJUS_XAI_AGENT_ID` somente para permitir rotação futura do agente da própria Crédito Jus.

## URL

Rota dedicada:

```text
/credito-jus
```

Produção recomendada:

```text
https://voice.trustio.com.br/credito-jus
```

Enquanto este deployment for dedicado à Crédito Jus, `/` redireciona para `/credito-jus`.

## Arquitetura

- Frontend estático servido pelo CDN da Vercel.
- Login privado por código de acesso e cookie HttpOnly assinado.
- `POST /api/session` cria um ephemeral client secret da xAI. A API key nunca chega ao browser.
- O browser conecta diretamente ao xAI Realtime usando o agente salvo da Crédito Jus.
- O caminho de áudio não passa pela Vercel. Isso evita um proxy adicional e reduz latência.
- Captura via AudioWorklet, PCM16 mono a 24 kHz, chunks de 50 ms.
- Transporte de áudio binário no WebSocket para evitar base64 e JSON no hot path.
- Playback começa a cada chunk recebido, sem esperar a resposta completa.
- Server VAD do agente cuida do turn-taking e interrupções.
- A credencial efêmera é pré-carregada depois do login para encurtar o tempo até a primeira fala.

## Orb realtime

O orb foi desenhado localmente com CSS, sem asset remoto, e tem estados visuais distintos:

- Idle: respiração e movimento interno lento.
- Connecting: aura azul mais intensa.
- Listening: reação à amplitude real do microfone por `--voice-level`.
- Thinking: plasma azul/violeta acelerado, partículas, anéis orbitais e pulso central.
- Speaking: pulsação suave enquanto a resposta é reproduzida.

O estado Thinking é acionado no fim da fala do usuário e durante a criação da resposta. A interface muda para Speaking quando os primeiros sinais da resposta chegam, sem aguardar a resposta completa.

## Deploy recomendado

Crie um projeto Vercel separado apontando para este mesmo repositório e configure **Root Directory** como:

```text
voice-mvp
```

Use o domínio:

```text
voice.trustio.com.br
```

O áudio em tempo real segue diretamente do navegador para a xAI. A Function fica em `gru1` para reduzir a latência de autenticação/token para usuários no Brasil, sem entrar no hot path contínuo de voz.

## Environment Variables

Configure somente no Vercel. Não coloque valores secretos no GitHub.

Obrigatórias:

```text
XAI_API_KEY=<xAI API key>
DEMO_ACCESS_CODE=<private code shared with the prospect>
DEMO_SESSION_SECRET=<long random value used to sign the cookie>
```

Opcional, somente para substituir futuramente o agente da própria Crédito Jus:

```text
CREDITOJUS_XAI_AGENT_ID=agent_XrzC3PUBPY9m5pEs
```

Experimento opcional de latência:

```text
XAI_REASONING_EFFORT=none
```

Use `none` somente depois de comparar a qualidade com o comportamento padrão. Ele pode reduzir o tempo de resposta, mas também reduz o reasoning aplicado a cada turno.

## Segurança do MVP

- `noindex`, `nofollow`, `noarchive` e `nosnippet`.
- Cookie `HttpOnly`, `Secure` e `SameSite=Strict`.
- CSP aceita somente a própria origem e `api.x.ai`/`wss://api.x.ai`.
- Microfone permitido apenas para a própria página.
- Sem gravação de áudio no frontend.
- Sem persistência da transcrição pela aplicação.
- Sessão visual limitada a 10 minutos.

O `agent_id` não é uma API key. A credencial sensível continua sendo `XAI_API_KEY`, mantida exclusivamente server-side. O browser recebe apenas um client secret efêmero e a URL necessária para a conexão realtime.

## Checklist antes de enviar ao cliente

1. Configurar `XAI_API_KEY`, `DEMO_ACCESS_CODE` e `DEMO_SESSION_SECRET` na Vercel.
2. Fazer deploy com Root Directory `voice-mvp`.
3. Abrir `/credito-jus` e validar que `/` redireciona corretamente.
4. Testar no Safari do iPhone e Chrome desktop.
5. Validar áudio com e sem fone de ouvido.
6. Conferir visualmente todos os estados do orb, especialmente Thinking.
7. Testar interrupção enquanto o agente fala.
8. Comparar latência com `XAI_REASONING_EFFORT` ausente e com `none`.
9. Apontar `voice.trustio.com.br` para o projeto.
10. Criar um código de acesso exclusivo para a demonstração.

## Próxima versão

Para múltiplos prospects da própria Crédito Jus, substituir o código único por links de convite com expiração, rate limiting server-side e painel de uso. Para outros clientes Trustio, criar deployments/configurações separados com IDs de agente próprios. O hot path de áudio deve continuar direto browser → xAI para preservar a latência.
