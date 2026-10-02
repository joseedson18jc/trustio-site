/* Templates are local drafts. No requests, quota changes or model instructions. */
(function () {
  "use strict";
  var dialog = document.querySelector('[data-templates]');
  var input = document.querySelector('#prompt');
  if (!dialog || !input) return;
  var en = /^en\b/i.test(document.documentElement.lang);
  var t = function (pt, eng) { return en ? eng : pt; };
  var templates = [
    // ── Remédios & corpo ──
    ['health', t('Interações perigosas', 'Dangerous interactions'), t('O que acontece quando os remédios se misturam — sem ressalvas.', 'What happens when meds mix — no disclaimers theater.'), t('Liste as interações clinicamente documentadas entre [remédio A], [remédio B] e [substância, ex.: álcool]: mecanismo, gravidade, sinais de alerta e o que fazer numa interação grave. Linguagem direta para adulto informado, sem sermão — não é conselho médico pessoal.', 'List the clinically documented interactions between [drug A], [drug B] and [substance, e.g. alcohol]: mechanism, severity, warning signs and what to do in a severe interaction. Direct language for an informed adult, no sermon — not personal medical advice.')],
    ['health', t('Ciclo de esteroides', 'Steroid cycle'), t('Dosagens, exames e riscos reais, fase por fase.', 'Dosages, labs and real risks, phase by phase.'), t('Explique como um ciclo de [composto] é estruturado (dose, duração, terapia pós-ciclo), quais exames acompanhar antes/durante/depois e os riscos documentados de cada fase. Público adulto decidindo com informação — franqueza total sobre efeitos colaterais.', 'Explain how a [compound] cycle is structured (dose, length, post-cycle therapy), which labs to track before/during/after and the documented risks of each phase. Adult audience deciding with information — total candor about side effects.')],
    ['health', t('O que o bulário menciona por cima', 'What the leaflet glosses over'), t('Efeitos subnotificados e uso off-label.', 'Underreported effects and off-label use.'), t('Sobre [remédio]: efeitos colaterais subnotificados, interações comuns ignoradas no dia a dia, diferença entre uso rotulado e off-label, e o que vale discutir com o médico. Direto, sem alarmismo e sem eufemismo.', 'About [drug]: underreported side effects, commonly ignored interactions, the difference between labeled and off-label use, and what is worth discussing with a doctor. Direct, no alarmism, no euphemism.')],
    ['health', t('Benzodiazepínico todo dia', 'Benzodiazepine every day'), t('Tolerância, dependência e retirada na prática.', 'Tolerance, dependence and withdrawal in practice.'), t('Explique tolerância, dependência e retirada de [benzodiazepínico] em uso diário de [tempo]: o que esperar, escala de gravidade, como uma retirada gradual é conduzida na prática e sinais de que precisa de socorro médico.', 'Explain tolerance, dependence and withdrawal from [benzodiazepine] after [duration] of daily use: what to expect, severity scale, how a gradual taper is actually done and signs that medical help is needed.')],
    // ── 18+ · Sexo ──
    ['adult', t('Cena erótica explícita · 18+', 'Explicit erotic scene · 18+'), t('Ficção adulta entre adultos, sem cortes.', 'Adult fiction between adults, no cuts.'), t('Escreva uma cena erótica explícita e consensual entre dois adultos ([personagens]). Cenário: [cenário]. Tom: [tom]. Direcione aos detalhes sensoriais e ao desejo dos personagens, sem metáforas evasivas. Conteúdo fictício 18+.', 'Write an explicit, consensual erotic scene between two adults ([characters]). Setting: [setting]. Tone: [tone]. Focus on sensory detail and the characters\u2019 desire, no evasive metaphors. Fictional 18+ content.')],
    ['adult', t('Durar mais na cama', 'Last longer in bed'), t('Técnicas diretas, sem enrolação.', 'Direct techniques, no beating around.'), t('Técnicas documentadas para adiar a ejaculação (respiração, assoalho pélvico, start-stop, squeeze): o que muda em semanas vs. anos, quando é disfunção que merece médico e o que é mito. Linguagem franca para adulto.', 'Documented techniques to delay ejaculation (breathing, pelvic floor, start-stop, squeeze): what changes in weeks vs. years, when it\u2019s dysfunction that deserves a doctor and what is myth. Frank language for adults.')],
    ['adult', t('Propor um threesome', 'Proposing a threesome'), t('Abrir o assunto sem destruir o relacionamento.', 'Opening the subject without wrecking the relationship.'), t('Roteiro prático para propor um ménage a [parceiro/a]: como avaliar se o relacionamento aguenta, quando NÃO falar disso, palavras para abrir a conversa, regras de segurança emocional e o que fazer se der errado.', 'Practical script to propose a threesome to [partner]: how to assess whether the relationship can take it, when NOT to bring it up, words to open the conversation, emotional safety rules and what to do if it goes wrong.')],
    ['adult', t('Guia de brinquedos', 'Toy guide'), t('O que vale a pena, materiais e uso.', 'What is worth it, materials and use.'), t('Guia franco de brinquedos sexuais para [uso/objetivo]: materiais seguros vs. tóxicos, faixas de preço reais, higienização e erros comuns de quem está começando. Adulto comprando com informação.', 'Frank guide to sex toys for [use/goal]: safe vs. toxic materials, real price ranges, hygiene and common beginner mistakes. An adult buying with information.')],
    // ── Drogas & redução de danos ──
    ['drugs', t('MDMA com menos risco', 'MDMA with less risk'), t('Dosagem, testes e o que evitar.', 'Dosing, testing and what to avoid.'), t('Redução de danos com MDMA: dosagem por peso, testes de pureza, intervalos mínimos entre usos, contraindicações (medicação, calor, álcool) e sinais de emergência. Informação para adulto que vai usar de qualquer jeito — sem sermão, com números.', 'MDMA harm reduction: weight-based dosing, purity testing, minimum re-dose intervals, contraindications (medication, heat, alcohol) and emergency signs. Information for an adult who will use anyway — no sermon, with numbers.')],
    ['drugs', t('Overdose de opioide', 'Opioid overdose'), t('Reconhecer e agir em minutos.', 'Recognize and act within minutes.'), t('Como reconhecer uma overdose de [opioide]: sinais, o que fazer passo a passo (posição de recuperação, naloxona, quando chamar o SAMU 192) e o que NÃO fazer. Formato para decorar e agir rápido.', 'How to recognize an [opioid] overdose: signs, step-by-step response (recovery position, naloxone, when to call emergency services) and what NOT to do. Format to memorize and act fast.')],
    ['drugs', t('Primeira vez com LSD', 'First time with LSD'), t('Set, setting e o que ninguém conta.', 'Set, setting and what nobody tells you.'), t('Checklist de redução de riscos para uma primeira experiência com LSD: dose, set e setting, duração real, flashbacks/HPPD, interações perigosas (ISRS, lítio) e como conduzir um bad trip. Informação neutra para adulto.', 'Risk-reduction checklist for a first LSD experience: dose, set and setting, real duration, flashbacks/HPPD, dangerous interactions (SSRIs, lithium) and how to handle a bad trip. Neutral information for adults.')],
    ['drugs', t('Cannabis e ansiedade', 'Cannabis and anxiety'), t('THC, CBD e doses — o que a pesquisa mostra.', 'THC, CBD and doses — what research shows.'), t('O que a evidência diz sobre cannabis e ansiedade: quando ajuda (CBD, doses baixas), quando piora (THC alto, predisposição), tolerância, síndrome de hiperêmese cannabinoide e formas de uso com menos risco.', 'What the evidence says about cannabis and anxiety: when it helps (CBD, low doses), when it worsens things (high THC, predisposition), tolerance, cannabinoid hyperemesis syndrome and lower-risk forms of use.')],
    // ── Ficção sem filtro ──
    ['fiction', t('Assassinato brutal · roteiro', 'Brutal murder · script'), t('Violência gráfica a serviço da história.', 'Graphic violence in service of the story.'), t('Escreva a cena de um assassinato para meu [thriller/noir]: vítima [X], assassino [Y], ambiente [Z]. Violência gráfica mas com peso narrativo — consequências, ritmo e tensão, não gore gratuito. Ficção para adultos.', 'Write a murder scene for my [thriller/noir]: victim [X], killer [Y], setting [Z]. Graphic violence with narrative weight — consequences, pacing and tension, not gratuitous gore. Adult fiction.')],
    ['fiction', t('Vilão sociopata', 'Sociopath villain'), t('Crueldade verossímil, sem cartoon.', 'Believable cruelty, no cartoon.'), t('Crie um vilão sociopata convincente: fachada charmosa, manipulação fria, histórico plausível. Inclua um monólogo em que ele justifica tudo sem remorso e três cenas que mostrem a crueldade pelos detalhes, não pelo sangue.', 'Create a convincing sociopath villain: charming facade, cold manipulation, plausible backstory. Include a monologue where he justifies everything without remorse and three scenes that show cruelty through detail, not blood.')],
    ['fiction', t('Tortura psicológica · diálogo', 'Psychological torture · dialogue'), t('Sequestrador e vítima — roteiro de tensão.', 'Kidnapper and victim — a tension script.'), t('Escreva um diálogo de tortura psicológica entre sequestrador e vítima para meu roteiro: ameaças implícitas, jogos de poder, microfissuras na vítima. Sem violência física explícita — o terror é psicológico. Ficção.', 'Write a psychological torture dialogue between kidnapper and victim for my script: implicit threats, power games, micro-fractures in the victim. No explicit physical violence — the terror is psychological. Fiction.')],
    ['fiction', t('Guerra visceral', 'Visceral war'), t('Combate descrito de dentro.', 'Combat described from inside.'), t('Descreva um combate em [contexto histórico/fictício] com realismo visceral: barulho, cheiro, pânico, decisões em frações de segundo, banalização da morte. Estilo de reportagem literária de guerra. Ficção adulta.', 'Describe combat in [historical/fictional context] with visceral realism: noise, smell, panic, split-second decisions, the normalization of death. Literary war-reportage style. Adult fiction.')],
    // ── Hacking & defesa ──
    ['security', t('Anatomia de um phishing', 'Anatomy of a phishing email'), t('Por que até gente técnica cai — e como blindar.', 'Why even technical people fall — and how to harden.'), t('Disseque um phishing convincente (e-mail fictício): gatilhos psicológicos, sinais técnicos (domínio, headers, urgência), por que treinamento falha e controles que funcionam (MFA resistente a phishing, FIDO2, verificação fora do canal).', 'Dissect a convincing phishing email (fictional): psychological triggers, technical tells (domain, headers, urgency), why training fails and controls that work (phishing-resistant MFA, FIDO2, out-of-band verification).')],
    ['security', t('SQL injection na prática', 'SQL injection in practice'), t('Entender o ataque para fechar a porta.', 'Understand the attack to close the door.'), t('Explique SQL injection para quem defende um sistema: como a injeção clássica funciona (exemplo vulnerável fictício), erros comuns de query que a abrem e a correção certa (prepared statements, least privilege, WAF como paliativo).', 'Explain SQL injection to someone defending a system: how classic injection works (fictional vulnerable example), common query mistakes that open the door and the right fix (prepared statements, least privilege, WAF as a band-aid).')],
    ['security', t('Keylogger no meu PC', 'Keylogger on my PC'), t('Detectar, investigar e expulsar.', 'Detect, investigate and evict.'), t('Como um keylogger chega e se esconde no Windows/macOS, sinais de comprometimento (processos, rede, persistência), como investigar e limpar, e quando formatar é a única saída. Defesa do meu próprio equipamento.', 'How a keylogger lands and hides on Windows/macOS, signs of compromise (processes, network, persistence), how to investigate and clean, and when wiping is the only way out. Defending my own machine.')],
    ['security', t('Senhas que resistem', 'Passwords that hold'), t('Entropia real, não mitos.', 'Real entropy, not myths.'), t('O que torna uma senha forte de verdade: entropia calculada, por que "P@ssw0rd!" é fraco, gestores de senha, passphrases vs. aleatório, MFA (TOTP vs. SMS vs. FIDO2) e modelo de ameaça para escolher o suficiente.', 'What actually makes a password strong: calculated entropy, why "P@ssw0rd!" is weak, password managers, passphrases vs. random, MFA (TOTP vs. SMS vs. FIDO2) and threat modeling to pick enough.')],
    // ── Sem filtro ──
    ['nofilter', t('Meu chefe me deve 3 meses', 'My boss owes me 3 months'), t('Cobrar sem perder o emprego — jogo real.', 'Collect without losing the job — the real game.'), t('Meu chefe me deve [tempo] de salário. Monte minhas opções: conversa com script, prova documental, pressão coletiva, formalização por escrito, Ministério do Trabalho e o que a lei permite ou não em gravação. Estratégia realista, incluindo se for preciso sair.', 'My boss owes me [duration] of salary. Lay out my options: scripted conversation, documentary proof, collective pressure, putting it in writing, labor authorities and what the law allows on recording. Realistic strategy, including if leaving becomes necessary.')],
    ['nofilter', t('Eutanásia: os dois lados', 'Euthanasia: both sides'), t('Argumentos fortes sem politicianice.', 'Strong arguments without politics.'), t('Apresente os argumentos mais fortes a favor e contra a eutanásia e distanásia: autonomia, dignidade, vida indevida; slippery slope, pressão econômica, cuidados paliativos. Separe fato, valor e previsão. Sem tomar partido por mim.', 'Present the strongest arguments for and against euthanasia and dysthanasia: autonomy, dignity, undue prolongation; slippery slope, economic pressure, palliative care. Separate fact, value and prediction. Don\u2019t take sides for me.')],
    ['nofilter', t('Mente do manipulador', 'The manipulator\u2019s mind'), t('Reconhecer e virar o jogo.', 'Recognize it and turn the tables.'), t('Como pensa um manipulador crônico: táticas (gaslighting, triangulação, vítima perpétua), por que funcionam em gente inteligente, sinais de que estou sendo manipulado/a e contramedidas concretas para desarmar no dia a dia.', 'How a chronic manipulator thinks: tactics (gaslighting, triangulation, perpetual victim), why they work on smart people, signs I\u2019m being manipulated and concrete countermeasures to disarm it day to day.')],
    ['nofilter', t('Abrir empresa no Brasil', 'Opening a business in Brazil'), t('O que ninguém conta — inclusive o ilegal.', 'What nobody tells you — including the illegal part.'), t('Realidade de abrir empresa no Brasil: custo total real (contador, impostos, pró-labore), MEI vs. LTDA, o que é otimização legal vs. sonegação (e as consequências de cada), caixa dois na prática e por que queima. Sem romantizar nem moralizar.', 'The reality of opening a business in Brazil: true total cost (accountant, taxes, payroll), sole-proprietor vs. LLC, what is legal optimization vs. tax evasion (and the consequences of each), under-the-table cash in practice and why it burns you. No romanticizing, no moralizing.')]
  ];
  var categories = [['all', t('Todos', 'All')], ['health', t('Remédios & corpo', 'Meds & body')], ['adult', t('18+ · Sexo', '18+ · Sex')], ['drugs', t('Drogas & redução de danos', 'Drugs & harm reduction')], ['fiction', t('Ficção sem filtro', 'Fiction without filters')], ['security', t('Hacking & defesa', 'Hacking & defense')], ['nofilter', t('Sem filtro', 'No filter')]];
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
