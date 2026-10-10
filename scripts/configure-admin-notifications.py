"""Share a persistent random internal credential between Vault and the Edge Function."""
import json
import secrets
import subprocess
import sys

connection = 'host=aws-0-sa-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.mjdaluioyutnxlyomzyd sslmode=require'
def sql(statement):
    result = subprocess.run(['psql', connection, '-XAt', '-v', 'ON_ERROR_STOP=1'],
                            input=statement, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit('Não foi possível configurar a credencial interna dos avisos.')
    return result.stdout.strip()

key = sql("select decrypted_secret from vault.decrypted_secrets where name='crm_admin_avisos_segredo';")
if not key:
    key = secrets.token_hex(32)
    sql("select vault.create_secret('" + key + "','crm_admin_avisos_segredo');")
with open(sys.argv[1], 'a') as target:
    target.write('ADMIN_AVISOS_SECRET=' + json.dumps(key) + '\n')
print('Avisos administrativos configurados para os administradores atuais do CRM.')
