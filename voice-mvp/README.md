# Trustio Voice Demo · Crédito Jus

MVP privado para compartilhar o Voice Sales Agent treinado da Crédito Jus com prospects B2C e B2B.

## Arquitetura

- Frontend estático servido pelo CDN da Vercel.
- Login privado por código de acesso e cookie HttpOnly assinado.
- `POST /api/session` cria um ephemeral client secret da xAI. A API key nunca chega ao browser.
- O browser conecta diretamente ao xAI Realtime usando o `agent_id` salvo no Console.
- O caminho de áudio não passa pela Vercel. Isso evita um proxy adicional e reduz latência.
- Captura via AudioWorklet, PCM16 mono a 24 kHz, chunks de 50 ms.
- Transporte de áudio binário no WebSocket para evitar base64 e JSON no hot path.
- Playback começa a cada chunk recebido, sem esperar a resposta completa.
- Server VAD do agente cuida do turn-taking e interrupções.
- A credencial efêmera é pré-carregada depois do login para encurtar o tempo até a primeira fala.

## Deploy recomendado

Crie um projeto Vercel separado apontando para este mesmo repositório e configure **Root Directory** como:

```text
voice-mvp
```

Use o domínio:

```text
voice.trustio.com.br
```

O áudio em tempo real segue diretamente do navegador para a xAI, então a região da Function não entra no hot path de voz. Se o plano Vercel usado suportar escolha regional e os testes mostrarem ganho no endpoint de criação do token, `gru1` pode ser habilitada depois. O prefetch do token já esconde quase todo esse custo antes de o usuário iniciar a conversa.

## Environment Variables

Configure somente no Vercel. Não coloque valores reais no GitHub.

```text
XAI_API_KEY=<xAI API key>
XAI_AGENT_ID=<saved Voice Agent id>
DEMO_ACCESS_CODE=<private code shared with the prospect>
DEMO_SESSION_SECRET=<long random value used to sign the cookie>
```

Opcional:

```text
XAI_REASONING_EFFORT=none
```

Use `none` somente depois de comparar a qualidade com o comportamento padrão. Ele pode reduzir o tempo de resposta, mas também reduz o reasoning aplicado a cada turno. Se a variável não existir, o agent runtime usa sua configuração normal.

## Segurança do MVP

- `noindex`, `nofollow`, `noarchive` e `nosnippet`.
- Cookie `HttpOnly`, `Secure` e `SameSite=Strict`.
- CSP aceita somente a própria origem e `api.x.ai`/`wss://api.x.ai`.
- Microfone permitido apenas para a própria página.
- Sem gravação de áudio no frontend.
- Sem persistência da transcrição pela aplicação.
- Sessão visual limitada a 10 minutos.

O `agent_id` não é tratado como credencial. Para manter a menor latência, o browser recebe a URL de conexão após autenticação e se conecta diretamente à xAI usando somente um token efêmero de curta duração.

## Checklist antes de enviar ao cliente

1. Configurar as quatro Environment Variables obrigatórias.
2. Fazer deploy com Root Directory `voice-mvp`.
3. Testar no Safari do iPhone e Chrome desktop.
4. Validar áudio com e sem fone de ouvido.
5. Testar interrupção enquanto o agente fala.
6. Comparar latência com `XAI_REASONING_EFFORT` ausente e com `none`.
7. Apontar `voice.trustio.com.br` para o projeto.
8. Criar um código de acesso exclusivo para a demonstração.

## Próxima versão

Para múltiplos prospects, substituir o código único por links de convite com expiração, rate limiting server-side e painel de uso. O hot path de áudio deve continuar direto browser → xAI para preservar a latência.
