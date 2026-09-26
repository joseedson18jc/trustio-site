# Browser Use Cloud — guia de setup

Navegadores Chrome gerenciados na nuvem (stealth, proxies residenciais, perfis persistentes). Dois produtos:

- **Agent** — recebe um objetivo em linguagem natural e executa a tarefa web sozinho.
- **Browser** — Chrome real na nuvem que você controla via CDP (Playwright, Puppeteer, Selenium).

## Documentação (fonte da verdade — consulte antes de codar)

1. https://docs.browser-use.com/cloud/llms.txt — índice de todas as páginas
2. https://docs.browser-use.com/cloud/vibecoding — referência completa do SDK para agentes de código
3. https://docs.browser-use.com/cloud/llms-full.txt — docs completas com exemplos
4. OpenAPI v4: https://docs.browser-use.com/cloud/openapi/v4.json

Não chute endpoint, nome de modelo ou assinatura do SDK — busque na doc.

## Setup

- Python: `pip install --upgrade browser-use-sdk`
- TypeScript: `npm install browser-use-sdk@latest`

Autenticação pela variável de ambiente `BROWSER_USE_API_KEY` (chaves começam com `bu_`, enviadas no header `X-Browser-Use-API-Key`).
**Nunca** faça hard-code, print ou commit da chave. Localmente ela fica em `.env` (já no `.gitignore`).
Criar chave: https://cloud.browser-use.com/settings?tab=api-keys&new=1

## Qual API usar

- **v4** — padrão; recomendada para fluxos longos, complexos e de alta precisão.
- **v2** — só quando custo mínimo/velocidade previsível importam mais que acerto (precisão bem menor).

## Armadilhas caras

- **Parar um browser v4:** `client.close()`, `browser.close()` ou derrubar o CDP **não** param o browser nem a cobrança. Guarde o id retornado por `POST /api/v4/browsers` e chame `PATCH /api/v4/browsers/{id}` com `{"action":"stop"}` (encerra a cobrança e reembolsa o tempo não usado).
- **Tipagem TypeScript:** passe `model` explicitamente. Sempre que houver `browserSettings`, passe também `proxyCountryCode` (`"us"` mantém o proxy padrão, `null` desativa). Se um modelo válido for rejeitado pela union gerada, chame `POST /api/v4/runs` direto.
- A biblioteca open-source `browser-use` (Python) é outra API — não misture docs nem assinaturas com o Cloud SDK.

## Links

- Dashboard: https://cloud.browser-use.com
- Preços: https://browser-use.com/pricing.md
