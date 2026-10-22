/* Skills: usar no chat (o navegador manda só o id; o texto da skill fica na função de chat,
   supabase/functions/chat/skills.ts) ou baixar o .zip (app/skills/). */
(function () {
  "use strict";
  var dialog = document.querySelector('[data-skills]');
  if (!dialog) return;
  var en = /^en\b/i.test(document.documentElement.lang);
  var t = function (pt, eng) { return en ? eng : pt; };
  // Os arquivos ficam em /app/skills/, também para a versão em inglês (en/app/).
  var script = document.currentScript || document.querySelector('script[src*="chat-skills.js"]');
  var base = new URL('../app/skills/', script ? script.src : location.href);
  // [id, categoria, título, resumo, requisitos, tamanho do .zip em KB, idioma da skill]
  var skills = [
    ['legal-brazil-lawyer', 'law', t('Advogado sênior (Brasil)', 'Senior lawyer (Brazil)'), t('Pareceres, petições, contestações, recursos, contratos e due diligence em direito brasileiro, entregues em PDF e Word.', 'Opinions, petitions, defenses, appeals, contracts and due diligence under Brazilian law, delivered as PDF and Word.'), t('Python com python-docx e reportlab para gerar os arquivos; internet para conferir normas.', 'Python with python-docx and reportlab to build the files; internet to check the law.'), 114, 'pt'],
    ['legal-brazil-assistant', 'law', t('Assistente jurídico do dia a dia', 'Everyday legal assistant'), t('Tira dúvidas jurídicas, explica leis e decisões em linguagem simples, resume processos e checa prazos.', 'Answers legal questions, explains laws and rulings in plain language, summarizes cases and checks deadlines.'), t('Nada além do agente; internet recomendada.', 'Nothing beyond the agent; internet recommended.'), 41, 'pt'],
    ['super-advogado-br-justa-causa', 'law', t('Justa causa trabalhista', 'Dismissal for cause (labor law)'), t('Analisa demissão por justa causa: provas, atestados, imediatidade, jurisprudência e estratégia para reverter.', 'Analyzes dismissals for cause: evidence, medical certificates, timing, case law and strategy to reverse them.'), t('Internet para pesquisa; scripts opcionais em Python 3.10+.', 'Internet for research; optional Python 3.10+ scripts.'), 30, 'pt'],
    ['perito-financeiro-forense', 'law', t('Perícia de dívidas bancárias', 'Bank debt forensics'), t('Recalcula o saldo devedor a partir de extratos e contratos, aponta juros e tarifas abusivos e gera laudo com planilhas.', 'Recalculates the balance owed from statements and contracts, flags abusive interest and fees and builds a report with spreadsheets.'), t('Python com pdfplumber e openpyxl; internet para as séries do Banco Central.', 'Python with pdfplumber and openpyxl; internet for Central Bank data series.'), 96, 'pt'],
    ['super-medical-doctor', 'health', t('Assistente médico educativo', 'Educational medical assistant'), t('Sintomas, remédios, exames, emergências e SUS, com raciocínio clínico e sem substituir a consulta.', 'Symptoms, medications, tests, emergencies and Brazil’s public health system, with clinical reasoning; no substitute for a visit.'), t('Nada além do agente.', 'Nothing beyond the agent.'), 32, 'pt-en'],
    ['webapp-analyzer-improver', 'dev', t('Auditor de sites e apps', 'Website and app auditor'), t('Avalia o código em 8 critérios (UX, acessibilidade, performance, design…) e entrega a versão já melhorada.', 'Scores the code on 8 criteria (UX, accessibility, performance, design…) and delivers the improved version.'), t('Nada além do agente.', 'Nothing beyond the agent.'), 30, 'en'],
    ['super-agent', 'dev', t('Super Agent para agentes de código', 'Super Agent for coding agents'), t('Método de engenharia: planejar, verificar, delegar a subagentes e travas contra comandos perigosos.', 'Engineering method: plan, verify, delegate to subagents, plus guards against dangerous commands.'), t('Agente de código com suporte a hooks, mais bash, git e python3 para as travas (o README explica); no chat vale só o método.', 'A coding agent with hook support, plus bash, git and python3 for the guards (see the README); in chat only the method applies.'), 54, 'en'],
    ['debuggin', 'dev', t('Depuração sistemática', 'Systematic debugging'), t('Acha a causa raiz de erros em código, integrações de API e skills, em vez de só tapar o sintoma.', 'Finds the root cause of bugs in code, API integrations and skills instead of patching symptoms.'), t('Nada além do agente.', 'Nothing beyond the agent.'), 4, 'en'],
    ['readme-generator', 'dev', t('Gerador de README', 'README generator'), t('Lê a estrutura do projeto e escreve um README completo: instalação, uso, estrutura e badges.', 'Reads the project structure and writes a full README: install, usage, structure and badges.'), t('Nada além do agente.', 'Nothing beyond the agent.'), 1, 'en'],
    ['data-wizard', 'data', t('Data Wizard', 'Data Wizard'), t('Limpa, analisa e faz gráficos de planilhas CSV, Excel e JSON.', 'Cleans, analyzes and charts CSV, Excel and JSON files.'), t('Python com pandas, matplotlib e openpyxl.', 'Python with pandas, matplotlib and openpyxl.'), 2, 'en'],
    ['markitdown', 'data', t('MarkItDown', 'MarkItDown'), t('Converte PDF, Word, PowerPoint, Excel, imagens e áudio em texto Markdown para a IA ler.', 'Converts PDF, Word, PowerPoint, Excel, images and audio into Markdown the AI can read.'), t('pip install "markitdown[all]".', 'pip install "markitdown[all]".'), 2, 'en'],
    ['crawl4ai', 'data', t('Crawl4AI', 'Crawl4AI'), t('Lê páginas e sites inteiros, inclusive os que dependem de JavaScript, e devolve texto limpo.', 'Reads pages and whole sites, including JavaScript-heavy ones, and returns clean text.'), t('pip install crawl4ai, com Playwright e Chromium; internet.', 'pip install crawl4ai, with Playwright and Chromium; internet.'), 3, 'en'],
    ['firecrawl', 'data', t('Firecrawl', 'Firecrawl'), t('Busca, raspa e mapeia sites pela nuvem do Firecrawl, em texto ou dados estruturados.', 'Searches, scrapes and maps sites through the Firecrawl cloud, as text or structured data.'), t('Chave de API do Firecrawl (paga) e o SDK em Python ou Node; internet.', 'A Firecrawl API key (paid) and the Python or Node SDK; internet.'), 4, 'en'],
    ['scrapy', 'data', t('Scrapy', 'Scrapy'), t('Cria robôs que coletam campos de muitas páginas, seguem a paginação e exportam em JSON ou CSV.', 'Builds crawlers that collect fields across many pages, follow pagination and export JSON or CSV.'), t('pip install scrapy; internet.', 'pip install scrapy; internet.'), 2, 'en'],
    ['ai-image-prompter', 'work', t('Prompts de imagem', 'Image prompts'), t('Transforma uma ideia vaga em prompt detalhado para Midjourney, DALL-E ou Stable Diffusion.', 'Turns a vague idea into a detailed prompt for Midjourney, DALL-E or Stable Diffusion.'), t('Um gerador de imagens à parte.', 'A separate image generator.'), 2, 'en']
  ];
  var categories = [['all', t('Todas', 'All')], ['law', t('Direito & perícia', 'Law & forensics')], ['health', t('Saúde', 'Health')], ['dev', t('Código & sites', 'Code & websites')], ['data', t('Dados & web', 'Data & web')], ['work', t('Criação', 'Creative')]];
  var active = 'all';
  var search = dialog.querySelector('[data-skills-search]');
  var list = dialog.querySelector('[data-skills-list]');
  var count = dialog.querySelector('[data-skills-count]');
  var normalize = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  var categoryName = function (id) { return categories.filter(function (c) { return c[0] === id; })[0][1]; };
  function render() {
    list.replaceChildren();
    var q = normalize(search.value.trim());
    var matches = skills.filter(function (item) {
      return (active === 'all' || item[1] === active) && normalize([item[0], item[2], item[3], item[4]].join(' ')).includes(q);
    });
    count.textContent = matches.length + (matches.length === 1 ? t(' skill encontrada', ' skill found') : t(' skills encontradas', ' skills found'));
    if (!matches.length) {
      var empty = document.createElement('p');
      empty.textContent = t('Nenhuma skill encontrada. Tente outro termo ou escolha Todas.', 'No skills found. Try another term or select All.');
      list.appendChild(empty);
    }
    matches.forEach(function (item) {
      var card = document.createElement('article'); card.className = 'template-card skill-card';
      var label = document.createElement('small'); label.textContent = categoryName(item[1]);
      var title = document.createElement('h3'); title.textContent = item[2];
      var desc = document.createElement('p'); desc.textContent = item[3];
      var langs = { pt: t('em português', 'in Portuguese'), en: t('em inglês', 'in English'), 'pt-en': t('em português e inglês', 'in Portuguese and English') };
      var req = document.createElement('span'); req.className = 'skill-req'; req.textContent = t('Fora do chat, requer: ', 'Outside the chat, needs: ') + item[4] + ' ' + t('Skill ', 'Skill written ') + langs[item[6]] + '.';
      var meta = document.createElement('div'); meta.className = 'skill-meta';
      var ativa = item[0] === atual;
      if (ativa) card.classList.add('is-ativa');
      var usar = document.createElement('button'); usar.type = 'button';
      usar.className = ativa ? 'btn btn-ghost' : 'btn btn-primary';
      usar.textContent = ativa ? t('Ativa no chat · desativar', 'Active in chat · turn off') : t('Usar no chat', 'Use in chat');
      usar.setAttribute('aria-pressed', String(ativa));
      usar.setAttribute('aria-label', (ativa ? t('Desativar no chat a skill ', 'Turn off in chat the skill ') : t('Usar no chat a skill ', 'Use in chat the skill ')) + item[2]);
      usar.addEventListener('click', function () {
        definir(ativa ? '' : item[0]);
        if (dialog.open) dialog.close();
        var input = document.querySelector('#prompt');
        if (input && !input.disabled) input.focus();
      });
      var link = document.createElement('a'); link.className = 'btn btn-ghost';
      link.href = new URL(item[0] + '.zip', base).href;
      link.setAttribute('download', item[0] + '.zip');
      link.textContent = t('Baixar .zip', 'Download .zip');
      link.setAttribute('aria-label', t('Baixar a skill ', 'Download the skill ') + item[2] + ' (.zip, ' + item[5] + ' KB)');
      var size = document.createElement('small'); size.textContent = item[0] + '.zip · ' + item[5] + ' KB';
      meta.append(usar, link, size);
      card.append(label, title, desc, req, meta); list.appendChild(card);
    });
  }
  categories.forEach(function (category) {
    var button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-ghost';
    button.textContent = category[1]; button.setAttribute('aria-pressed', String(category[0] === active));
    button.addEventListener('click', function () {
      active = category[0];
      dialog.querySelectorAll('[data-skills-filters] button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
      render();
    });
    dialog.querySelector('[data-skills-filters]').appendChild(button);
  });
  document.querySelectorAll('[data-skills-open]').forEach(function (button) {
    button.addEventListener('click', function () {
      render(); dialog.showModal(); search.focus();
      var shell = document.querySelector('.chat-shell');
      if (shell) delete shell.dataset.side;
    });
  });
  dialog.querySelector('[data-skills-close]').addEventListener('click', function () { dialog.close(); });

  // Skill ativa no chat. assets/chat.js manda atual() em cada mensagem e chama definir() ao abrir
  // uma conversa (a skill salva nela) ou começar uma nova (nenhuma).
  var atual = '';
  var barra = document.querySelector('[data-skill-ativa]');
  var nomeAtivo = barra && barra.querySelector('[data-skill-nome]');
  var porId = function (id) { return skills.filter(function (s) { return s[0] === id; })[0] || null; };
  function definir(id) {
    var item = porId(id || '');
    atual = item ? item[0] : '';
    if (barra) {
      barra.hidden = !item;
      if (item) nomeAtivo.textContent = item[2];
    }
    if (dialog.open) render();
  }
  if (barra) {
    barra.querySelector('[data-skill-tirar]').addEventListener('click', function () {
      definir('');
      var input = document.querySelector('#prompt');
      if (input && !input.disabled) input.focus();
    });
    barra.querySelector('[data-skill-trocar]').addEventListener('click', function () { render(); dialog.showModal(); search.focus(); });
  }
  window.trustioSkills = { atual: function () { return atual; }, definir: definir };
  search.addEventListener('input', render);
  render();
})();
