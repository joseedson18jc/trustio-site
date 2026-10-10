"""Configura o Resend sem escrever chaves ou segredos no log do workflow."""
import json
import os
import sys
import time
import urllib.request
import urllib.error

EVENTS = ['email.sent', 'email.delivered', 'email.opened', 'email.clicked',
          'email.delivery_delayed', 'email.failed', 'email.bounced', 'email.complained', 'email.suppressed']


def configure(secret_file):
    key = os.environ['RESEND_API_KEY']
    endpoint = f"https://{os.environ['PROJECT_REF']}.supabase.co/functions/v1/email-eventos"

    def api(path, method='GET', body=None):
        for attempt in range(3):
            time.sleep(0.6)
            req = urllib.request.Request('https://api.resend.com' + path, method=method,
                                         data=json.dumps(body).encode() if body is not None else None,
                                         headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'Trustio-CRM'})
            try:
                with urllib.request.urlopen(req, timeout=20) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                if error.code == 429 and attempt < 2:
                    time.sleep(2)
                    continue
                raise RuntimeError(f'Resend HTTP {error.code}: a chave precisa de acesso a domínios e webhooks.') from None
        raise RuntimeError('Resend indisponível.')

    domains = api('/domains')['data']
    trustio = [d for d in domains if d['name'] == 'trustio.com.br' or d['name'].endswith('.trustio.com.br')]
    if not trustio:
        raise RuntimeError('Nenhum domínio da Trustio encontrado na conta Resend.')
    for domain in trustio:
        api('/domains/' + domain['id'], 'PATCH', {'open_tracking': True, 'click_tracking': True})

    hooks = api('/webhooks')['data']
    existing = next((h for h in hooks if h.get('endpoint') == endpoint), None)
    if existing:
        api('/webhooks/' + existing['id'], 'PATCH', {'events': EVENTS, 'status': 'enabled'})
        hook = api('/webhooks/' + existing['id'])
    else:
        hook = api('/webhooks', 'POST', {'endpoint': endpoint, 'events': EVENTS})
    secret = hook.get('signing_secret')
    if not secret:
        raise RuntimeError('Resend não retornou o segredo de assinatura do webhook.')
    with open(secret_file, 'a') as output:
        output.write('RESEND_WEBHOOK_SECRET=' + json.dumps(secret) + '\n')
    print(f'Rastreamento ativado em {len(trustio)} domínio(s) Trustio; webhook configurado.')


if __name__ == '__main__':
    try:
        configure(sys.argv[1])
    except Exception as error:
        print('::error::' + (str(error) if isinstance(error, RuntimeError) else 'Não foi possível configurar o rastreamento no Resend.'))
        sys.exit(1)
