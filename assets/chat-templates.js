/* Templates are local drafts. No requests, quota changes or model instructions. */
(function () {
  "use strict";
  var dialog = document.querySelector('[data-templates]');
  var input = document.querySelector('#prompt');
  if (!dialog || !input) return;
  var en = /^en\b/i.test(document.documentElement.lang);
  var t = function (pt, eng) { return en ? eng : pt; };
  var templates = [
    ['fiction', t('Cena de suspense', 'Suspense scene'), t('Conflito, tensão e personagens moralmente ambíguos.', 'Conflict, tension and morally ambiguous characters.'), t('Escreva uma cena de suspense para público adulto sobre [premissa], em [cenário]. Use personagens moralmente ambíguos, conflito intenso e consequências plausíveis. Tom: [tom]. Extensão: [palavras]. Evite clichês e termine com uma virada narrativa.', 'Write an adult suspense scene about [premise], set in [setting]. Use morally ambiguous characters, intense conflict and plausible consequences. Tone: [tone]. Length: [words]. Avoid clichés and end with a narrative twist.')],
    ['fiction', t('Vilão com profundidade', 'A layered villain'), t('Motivações, contradições e um arco convincente.', 'Motivations, contradictions and a convincing arc.'), t('Crie um antagonista para uma história de [gênero]. Objetivo: [objetivo]. Explore motivação, contradições, passado, relação com o protagonista e consequências dos seus atos. Inclua um monólogo ficcional e três caminhos para seu arco.', 'Create an antagonist for a [genre] story. Goal: [goal]. Explore motivation, contradictions, backstory, relationship with the protagonist and consequences of their actions. Include a fictional monologue and three possible character arcs.')],
    ['debate', t('Debate sem rodeios', 'A candid debate'), t('Compare argumentos fortes e objeções reais.', 'Compare strong arguments and real objections.'), t('Analise a controvérsia sobre [tema] com linguagem direta. Apresente os argumentos mais fortes de cada posição, objeções e pontos de consenso. Separe fatos verificáveis, valores e opiniões. Não invente fontes; indique o que precisa de verificação.', 'Analyze the controversy around [topic] in direct language. Present the strongest arguments for each position, objections and areas of agreement. Separate verifiable facts, values and opinions. Do not invent sources; flag what needs verification.')],
    ['debate', t('Teste minha tese', 'Challenge my thesis'), t('Encontre falhas sem suavizar a crítica.', 'Find flaws without softening the critique.'), t('Critique minha tese: [tese]. Contexto: [contexto]. Identifique premissas frágeis, contradições, evidências ausentes e os melhores contra-argumentos. Seja franco e específico. Termine com uma versão mais defensável da tese e perguntas que eu deveria responder.', 'Critique my thesis: [thesis]. Context: [context]. Identify weak premises, contradictions, missing evidence and the strongest counterarguments. Be candid and specific. End with a more defensible version and questions I should answer.')],
    ['analysis', t('Opinião direta', 'Direct feedback'), t('Uma avaliação franca com critérios claros.', 'A candid assessment with clear criteria.'), t('Avalie com franqueza [ideia, texto ou projeto] para [público ou objetivo]. Use os critérios [critérios]. Mostre pontos fortes, falhas e prioridades de melhoria com exemplos. Diferencie sua opinião de afirmações factuais. Material: [cole aqui].', 'Candidly assess [idea, text or project] for [audience or goal]. Use [criteria]. Show strengths, flaws and improvement priorities with examples. Distinguish your opinion from factual claims. Material: [paste here].')],
    ['analysis', t('Investigar um tema sensível', 'Investigate a sensitive topic'), t('Hipóteses, evidências e perguntas de apuração.', 'Hypotheses, evidence and reporting questions.'), t('Monte um plano de pesquisa sobre [tema sensível] para [objetivo]. Separe hipóteses, evidências disponíveis e lacunas. Sugira fontes primárias e perguntas de apuração. Não trate acusações como fatos e não invente citações. Entregue uma pauta e uma lista de checagem.', 'Build a research plan on [sensitive topic] for [goal]. Separate hypotheses, available evidence and gaps. Suggest primary sources and reporting questions. Do not treat allegations as facts or invent quotations. Deliver an outline and a verification checklist.')],
    ['analysis', t('História sem simplificações', 'History without shortcuts'), t('Contexto e perspectivas sobre episódios controversos.', 'Context and perspectives on controversial events.'), t('Explique [evento ou movimento histórico controverso], considerando o contexto, os atores, as disputas de interpretação e as consequências. Diferencie consenso histórico de debate e propaganda. Indique fontes primárias a consultar e incertezas, sem inventar referências.', 'Explain [controversial historical event or movement], considering context, actors, competing interpretations and consequences. Distinguish historical consensus from debate and propaganda. Identify primary sources to consult and uncertainties, without inventing references.')],
    ['fiction', t('Sátira e humor ácido', 'Satire and dark humor'), t('Crítica afiada a ideias e situações.', 'Sharp criticism of ideas and situations.'), t('Escreva uma sátira sobre [ideia ou situação] para [público], em formato de [crônica, diálogo ou roteiro]. Use ironia e humor ácido, mirando contradições e comportamentos. Tom: [tom]. Extensão: [palavras]. Deixe claro o caráter ficcional.', 'Write a satire about [idea or situation] for [audience], as a [column, dialogue or script]. Use irony and dark humor to target contradictions and behaviors. Tone: [tone]. Length: [words]. Make its fictional nature clear.')],
    ['professional', t('Entender golpes para se defender', 'Understand scams to defend against them'), t('Reconhecer sinais e preparar uma resposta defensiva.', 'Recognize warning signs and prepare a defensive response.'), t('Explique como reconhecer [tipo de golpe] em [contexto], com foco em prevenção e resposta defensiva. Liste sinais de alerta, um exemplo fictício identificado como simulação, medidas de proteção e próximos passos se houver suspeita. Não use dados reais de vítimas.', 'Explain how to recognize [scam type] in [context], focusing on prevention and defensive response. List warning signs, a fictional example labeled as a simulation, protection measures and next steps when suspicious. Do not use real victim data.')],
    ['professional', t('Estudar uma controvérsia jurídica', 'Study a legal controversy'), t('Organize questões, argumentos e pontos a conferir.', 'Organize issues, arguments and verification points.'), t('Para fins de estudo, analise [questão jurídica] na jurisdição [jurisdição], com base nos fatos hipotéticos [fatos]. Organize questões relevantes, argumentos de cada lado e riscos da interpretação. Não invente leis ou precedentes; sinalize o que precisa ser conferido em fontes oficiais atualizadas.', 'For study purposes, analyze [legal issue] in [jurisdiction], based on hypothetical facts [facts]. Organize relevant questions, arguments on each side and interpretation risks. Do not invent laws or precedents; flag what needs checking in current official sources.')]
  ];
  var categories = [['all', t('Todos', 'All')], ['fiction', t('Ficção', 'Fiction')], ['debate', t('Debates', 'Debate')], ['analysis', t('Análise crítica', 'Critical analysis')], ['professional', t('Estudo e defesa', 'Study and defense')]];
  var active = 'all';
  var search = dialog.querySelector('[data-template-search]');
  var list = dialog.querySelector('[data-template-list]');
  var count = dialog.querySelector('[data-template-count]');
  var feedback = dialog.querySelector('[data-template-feedback]');
  var normalize = function (s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); };
  function draft(text) {
    if (input.disabled) {
      feedback.textContent = t('Aguarde o chat ficar disponível para inserir um rascunho.', 'Wait until the chat is available to insert a draft.');
      return;
    }
    var start = input.value.length;
    input.value += (input.value.trim() ? '\n\n' : '') + text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (dialog.open) dialog.close();
    var shell = document.querySelector('.chat-shell');
    if (shell) delete shell.dataset.side;
    input.focus();
    var field = /\[[^\]]+\]/.exec(input.value.slice(start));
    if (field) input.setSelectionRange(start + field.index, start + field.index + field[0].length);
    else input.setSelectionRange(input.value.length, input.value.length);
  }
  function render() {
    list.replaceChildren();
    var matches = templates.filter(function (item) {
      return (active === 'all' || item[0] === active) && normalize(item.slice(1).join(' ')).includes(normalize(search.value.trim()));
    });
    count.textContent = matches.length + t(' templates encontrados', ' templates found');
    if (!matches.length) {
      var empty = document.createElement('p');
      empty.textContent = t('Nenhum template encontrado. Tente outro termo ou escolha Todos.', 'No templates found. Try another term or select All.');
      list.appendChild(empty);
    }
    matches.forEach(function (item) {
      var card = document.createElement('article'); card.className = 'template-card';
      var label = document.createElement('small'); label.textContent = categories.filter(function (c) { return c[0] === item[0]; })[0][1];
      var title = document.createElement('h3'); title.textContent = item[1];
      var desc = document.createElement('p'); desc.textContent = item[2];
      var details = document.createElement('details');
      var summary = document.createElement('summary'); summary.textContent = t('Ver texto do template', 'Preview template text');
      var preview = document.createElement('p'); preview.textContent = item[3];
      details.append(summary, preview);
      var use = document.createElement('button'); use.type = 'button'; use.className = 'btn btn-ghost';
      use.textContent = t('Usar como rascunho', 'Use as draft');
      use.setAttribute('aria-label', t('Usar como rascunho: ', 'Use as draft: ') + item[1]);
      use.addEventListener('click', function () { draft(item[3]); });
      card.append(label, title, desc, details, use); list.appendChild(card);
    });
  }
  categories.forEach(function (category) {
    var button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-ghost';
    button.textContent = category[1]; button.setAttribute('aria-pressed', String(category[0] === active));
    button.addEventListener('click', function () {
      active = category[0];
      dialog.querySelectorAll('[data-template-filters] button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
      render();
    });
    dialog.querySelector('[data-template-filters]').appendChild(button);
  });
  document.querySelectorAll('[data-templates-open]').forEach(function (button) {
    button.addEventListener('click', function () { feedback.textContent = ''; render(); dialog.showModal(); search.focus(); });
  });
  dialog.querySelector('[data-templates-close]').addEventListener('click', function () { dialog.close(); });
  search.addEventListener('input', render);
  document.querySelectorAll('[data-starter]').forEach(function (button) {
    button.addEventListener('click', function () { draft(button.textContent.trim()); });
  });
  render();
})();
