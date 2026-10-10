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
            verify_admin_notifications(conn, ref)
            return
    raise RuntimeError('Entrega não apareceu no CRM dentro da janela de validação; confira o webhook Resend.')


def verify_admin_notifications(conn, ref):
    # Trigger only legitimate pending notifications; do not manufacture customer accounts.
    query = "select decrypted_secret from vault.decrypted_secrets where name='crm_admin_avisos_segredo';"
    result = subprocess.run(['psql', conn, '-XAt', '-v', 'ON_ERROR_STOP=1'],
                            input=query, capture_output=True, text=True, timeout=15)
    secret = result.stdout.strip()
    if result.returncode or not secret:
        raise RuntimeError('Credencial interna dos avisos administrativos não está configurada.')
    request = urllib.request.Request(f'https://{ref}.supabase.co/functions/v1/admin-avisos', method='POST', data=b'{}',
                                     headers={'Content-Type': 'application/json', 'x-trustio-segredo': secret})
    with urllib.request.urlopen(request, timeout=60) as response:
        body = json.load(response)
    if body.get('enviados') != body.get('processados'):
        raise RuntimeError('Há avisos administrativos cujo envio ainda não foi confirmado; confira crm_admin_avisos.')
    result = subprocess.run(['psql', conn, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c',
                             "select count(*) from cron.job where jobname='crm-admin-avisos' and active;"],
                            capture_output=True, text=True, timeout=15)
    if result.returncode or result.stdout.strip() != '1':
        raise RuntimeError('Agendamento dos avisos administrativos não está ativo.')
    print('Credencial da função de avisos validada; fila e agendamento de um minuto ativos.')


if __name__ == '__main__':
    try:
        verify()
    except Exception as error:
        print('::error::' + (str(error) if isinstance(error, RuntimeError) else 'Falha na verificação de entrega do CRM; nenhum cliente foi contatado.'))
        raise SystemExit(1)
