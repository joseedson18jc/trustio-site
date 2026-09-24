-- Trustio · lista de espera no D1 (provisório, até o banco do projeto Supabase novo existir)
--
-- Cada inscrição e cada confirmação é um db.batch(), que o D1 executa como transação:
-- não existe estado pela metade, ao contrário do KV usado antes.
--
-- Aplicar: wrangler d1 migrations apply trustio-lista-de-espera --remote

CREATE TABLE IF NOT EXISTS leads (
  email          TEXT PRIMARY KEY,
  nome           TEXT,
  telefone       TEXT,
  tipo           TEXT,
  empresa        TEXT,
  segmento       TEXT,
  origem         TEXT,
  notas          TEXT,
  status         TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado')),
  -- quando o último link foi emitido; segura um segundo e-mail por 5 minutos
  ultimo_link_em TEXT,
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL,
  confirmado_em  TEXT
);

-- Links de confirmação. Um link vale enquanto a linha existir e não tiver vencido.
-- Depois que um e-mail novo sai, os links anteriores do mesmo e-mail são apagados;
-- ao confirmar, todos os links daquele e-mail são apagados.
CREATE TABLE IF NOT EXISTS links (
  token     TEXT PRIMARY KEY,
  email     TEXT NOT NULL REFERENCES leads (email),
  expira_em TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS links_por_email ON links (email);
