"""Smoke de produção só com a caixa de simulação oficial do Resend."""
import json
import os
import subprocess
import time
import urllib.request
import uuid


def verify():
    key = os.environ.get('RESEND_API_KEY') or os.environ['SMTP_PASS']
    sender = os.environ.get('SMTP_SENDER') or 'no-reply@send.trustio.com.br'
    run = os.environ['GITHUB_RUN_ID']
    recipient = f'delivered+crm-{run}@resend.dev'
    body = {'from': f'Trustio <{sender}>', 'to': [recipient], 'subject': '[Teste técnico] Entrega e acompanhamento do CRM',
            'html': '<p>Teste de integração em caixa simulada do Resend. Nenhum cliente recebe esta mensagem.</p>'}
    request = urllib.request.Request('https://api.resend.com/emails', method='POST', data=json.dumps(body).encode(),
                                     headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
                                              'Idempotency-Key': 'crm-tracking-smoke/' + run, 'User-Agent': 'Trustio-CRM'})
    with urllib.request.urlopen(request, timeout=20) as response:
        email_id = str(uuid.UUID(json.load(response)['id']))
    ref = os.environ['PROJECT_REF']
    conn = f'host=aws-0-sa-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.{ref} sslmode=require'
    sql = f"select count(*) from public.crm_emails where email_id='{email_id}' and entregue_em is not null;"
    for _ in range(18):
        time.sleep(5)
        result = subprocess.run(['psql', conn, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], capture_output=True, text=True, timeout=15)
        if result.returncode == 0 and result.stdout.strip() == '1':
            print('Envio aceito e evento real de entrega registrado no CRM (caixa simulada Resend).')
            return
    raise RuntimeError('Entrega não apareceu no CRM dentro da janela de validação; confira o webhook Resend.')


if __name__ == '__main__':
    try:
        verify()
    except Exception as error:
        print('::error::' + (str(error) if isinstance(error, RuntimeError) else 'Falha na verificação de entrega do CRM; nenhum cliente foi contatado.'))
        raise SystemExit(1)
