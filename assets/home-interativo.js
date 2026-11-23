"use strict";
/* Interatividade da Home Trustio (2026-11) — zero JS inline (CSP estrita),
   bilíngue (PT-BR / EN via document.documentElement.lang). */
(function () {
  var EN = /^en\b/i.test(document.documentElement.lang);
  var T = function (pt, en) { return EN ? en : pt; };

  /* ── 1. Simulador interativo do Caminho de uma Pergunta ───────────────── */
  var caminho = document.querySelector("[data-caminho-sim]");
  if (caminho) {
    var inspText = caminho.querySelector("[data-caminho-detalhe]");
    var inspTag = caminho.querySelector("[data-caminho-tag]");
    var rotuloPerimetro = caminho.querySelector(".cm-perimetro-rotulo");
    var corteTxt = caminho.querySelector(".cm-corte span");
    var respSmall = caminho.querySelector("[data-caminho-resp]");

    var copy = {
      trustio: {
        1: {
          tag: T("TLS 1.3 · Origem cifrada", "TLS 1.3 · Encrypted origin"),
          text: T(
            "Sua pergunta sai do navegador ou celular cifrada de ponta a ponta direto para o perímetro brasileiro, sem rastreadores de terceiros.",
            "Your prompt leaves your browser or phone end-to-end encrypted straight to the Brazilian perimeter, with no third-party trackers."
          )
        },
        2: {
          tag: T("Perímetro Brasil · São Paulo (SP)", "Brazil Perimeter · São Paulo (SP)"),
          text: T(
            "Conta e histórico ficam armazenados em servidores no Brasil sob LGPD. Nenhum dado vai para pipelines de treinamento.",
            "Your account and history stay stored on servers in Brazil under LGPD. No data enters model training pipelines."
          )
        },
        3: {
          tag: T("Modelo aberto · Sem filtro imposto", "Open model · No vendor filter"),
          text: T(
            "Trustio Flash e Trustio Heavy Thinking respondem temas jurídicos, médicos, de segurança e pesquisa sem sermões nem bloqueios moralistas.",
            "Trustio Flash and Trustio Heavy Thinking handle legal, medical, security and research topics without lectures or moralistic blocks."
          )
        },
        4: {
          tag: T("Resposta completa · ~18 ms RTT SP", "Full answer · ~18 ms SP RTT"),
          text: T(
            "A resposta chega completa na tela, pronta para conferência e trabalho real — sem tempo perdido reescrevendo prompts.",
            "The complete answer lands on your screen ready for real work — no time wasted rewriting prompts."
          )
        }
      },
      bigtech: {
        1: {
          tag: T("Rota internacional · EUA/UE", "International route · US/EU"),
          text: T(
            "Na IA tradicional, a pergunta sai do Brasil e trafega para servidores estrangeiros fora da sua jurisdição.",
            "On big tech AI, your prompt leaves Brazil and travels to foreign servers outside your jurisdiction."
          )
        },
        2: {
          tag: T("Retenção & treinamento", "Retention & training"),
          text: T(
            "Em contas padrão, conversas podem ser retidas e usadas para revisão humana e futuras rodadas de treinamento.",
            "On standard accounts, chats can be retained and used for human review and future model training runs."
          )
        },
        3: {
          tag: T("Filtro do fornecedor ativo", "Vendor filter active"),
          text: T(
            "Palavras sensíveis em direito penal, segurança ofensiva, saúde ou ficção disparam recusas automáticas.",
            "Sensitive terms in criminal law, security defense, medicine or fiction trigger automatic refusals."
          )
        },
        4: {
          tag: T("Resposta bloqueada · Tempo perdido", "Blocked answer · Time lost"),
          text: T(
            "Você recebe um sermão genérico (“não posso ajudar com isso”) no meio do trabalho e precisa recomeçar.",
            "You get a generic lecture (“I cannot help with that”) mid-task and have to start over."
          )
        }
      }
    };

    var mode = "trustio";
    var step = "2";

    var renderSim = function () {
      caminho.dataset.sim = mode;
      var info = copy[mode][step];
      if (inspText) inspText.textContent = info.text;
      if (inspTag) inspTag.textContent = info.tag;
      if (rotuloPerimetro) {
        rotuloPerimetro.textContent = mode === "trustio"
          ? T("Perímetro Trustio · Brasil", "Trustio Perimeter · Brazil")
          : T("Nuvem Big Tech · Exterior", "Big Tech Cloud · Abroad");
      }
      if (corteTxt) {
        corteTxt.innerHTML = mode === "trustio"
          ? "<s>" + T("filtro do fornecedor", "vendor filter") + "</s>"
          : T("filtro do fornecedor ativo", "vendor filter active");
      }
      if (respSmall) {
        respSmall.textContent = mode === "trustio"
          ? T("completa, sem sermão", "complete, no lecture")
          : T("cortada por filtro", "cut off by filter");
      }
      caminho.querySelectorAll(".cm-no-btn").forEach(function (b) {
        b.setAttribute("aria-current", b.dataset.step === step ? "step" : "false");
      });
    };

    caminho.querySelectorAll("[data-sim-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        mode = btn.dataset.simMode;
        caminho.querySelectorAll("[data-sim-mode]").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === btn));
        });
        renderSim();
      });
    });

    caminho.querySelectorAll(".cm-no-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        step = btn.dataset.step;
        renderSim();
      });
    });

    renderSim();
  }

  /* ── 3. Calculadora BRL vs. US$ 20 + IOF (#precos) ────────────────────── */
  var slider = document.querySelector("[data-calc-months]");
  if (slider) {
    var outMonths = document.querySelector("[data-calc-months-out]");
    var outUs = document.querySelector("[data-calc-us]");
    var outTr = document.querySelector("[data-calc-trustio]");
    var outSave = document.querySelector("[data-calc-save]");
    var fmt = function (v) {
      return v.toLocaleString(EN ? "en-US" : "pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    var updateCalc = function () {
      var m = Number(slider.value || 6);
      var usTotal = 125.8 * m; // ~US$ 20 × câmbio + IOF + spread
      var trTotal = 79.0 * m;
      var save = usTotal - trTotal;
      if (outMonths) {
        outMonths.textContent = m + " " + (m === 1 ? T("mês", "month") : T("meses", "months"));
      }
      if (outUs) outUs.textContent = "R$ " + fmt(usTotal);
      if (outTr) outTr.textContent = "R$ " + fmt(trTotal);
      if (outSave) {
        outSave.textContent = T("Economia: R$ " + fmt(save) + " sem IOF", "Savings: R$ " + fmt(save) + " (no IOF)");
      }
    };
    slider.addEventListener("input", updateCalc);
    updateCalc();
  }

  /* ── 4. Comparador interativo por profissão (#para-quem) ──────────────── */
  var sandbox = document.querySelector("[data-sandbox]");
  if (sandbox) {
    var promptEl = sandbox.querySelector("[data-sb-prompt]");
    var blockedEl = sandbox.querySelector("[data-sb-blocked]");
    var trustioEl = sandbox.querySelector("[data-sb-trustio]");

    var cenarios = {
      advogados: {
        prompt: T(
          "“Analise teses de defesa e possíveis nulidades na cadeia de custódia de prova digital em processo penal.”",
          "“Analyze defense arguments and potential chain-of-custody nullities for digital evidence in criminal proceedings.”"
        ),
        blocked: T(
          "“Desculpe, não posso fornecer estratégias de defesa penal ou opinar sobre processos criminais. Procure um advogado.”",
          "“Sorry, I cannot provide criminal defense strategies or advise on criminal cases. Please consult a lawyer.”"
        ),
        trustio: T(
          "1) Cadeia de custódia (CPP arts. 158-A a 158-F): confira hash SHA-256 original, lacre e registro cronológico da coleta. 2) Escopo do mandado: avalie pesca probatória (fishing expedition). 3) Assistente técnico para auditar metadados. (Para estudo e conferência; a decisão é sua.)",
          "1) Chain of custody: verify original SHA-256 hash, seal integrity and chronological collection log. 2) Warrant scope: check for overbroad fishing-expedition collection. 3) Technical expert review of metadata integrity. (For study and verification; the decision is yours.)"
        )
      },
      jornalistas: {
        prompt: T(
          "“Monte um roteiro documental para cruzar contratos públicos emergenciais com sócios em comum e empresas recém-abertas.”",
          "“Outline a document-checking workflow to cross-reference emergency public contracts with shared partners and newly opened firms.”"
        ),
        blocked: T(
          "“Não posso ajudar a investigar empresas ou pessoas específicas nem sugerir métodos para rastrear indícios de fraude.”",
          "“I cannot help investigate specific companies or individuals or suggest methods to trace potential fraud.”"
        ),
        trustio: T(
          "Cruzamento objetivo em 4 etapas: (1) QSA na Receita Federal + abertura < 90 dias antes do edital; (2) endereços fiscais repetidos entre concorrentes; (3) atas no PNCP comparadas à mediana histórica; (4) notas fiscais e diários oficiais como prova primária.",
          "Objective 4-step cross-check: (1) corporate registry ownership + incorporation < 90 days before tender; (2) identical registered addresses across bidders; (3) public procurement prices vs. historical median; (4) invoices and official gazettes as primary evidence."
        )
      },
      saude: {
        prompt: T(
          "“Compare interações de alto risco entre anticoagulantes diretos e antifúngicos azólicos em paciente com insuficiência renal.”",
          "“Compare high-risk drug interactions between direct oral anticoagulants and azole antifungals in a patient with renal impairment.”"
        ),
        blocked: T(
          "“Como IA, não posso discutir interações medicamentosas específicas ou condutas clínicas. Consulte um profissional de saúde.”",
          "“As an AI, I cannot discuss specific drug interactions or clinical protocols. Please consult a healthcare professional.”"
        ),
        trustio: T(
          "Inibidores potentes de CYP3A4 e P-gp (ex.: cetoconazol, itraconazol) elevam a exposição sistêmica de rivaroxabana e apixabana, ampliando o risco hemorrágico — sobretudo com ClCr < 50 mL/min. Verifique contraindicação em bula e alternativas terapêuticas. (Para estudo e conferência.)",
          "Strong CYP3A4 and P-gp inhibitors (e.g., ketoconazole, itraconazole) significantly increase rivaroxaban and apixaban exposure, elevating bleeding risk — especially with CrCl < 50 mL/min. Check label contraindications and alternative classes. (For professional verification.)"
        )
      },
      seguranca: {
        prompt: T(
          "“Explique tecnicamente como funciona um phishing com proxy reverso (AiTM) que captura cookies de sessão MFA, para treinar nosso SOC.”",
          "“Explain technically how an Adversary-in-the-Middle (AiTM) reverse-proxy phishing attack captures MFA session cookies so we can train our SOC.”"
        ),
        blocked: T(
          "“Não posso detalhar técnicas de phishing avançado ou mecanismos para contornar autenticação multifator (MFA).”",
          "“I cannot detail advanced phishing techniques or mechanisms for bypassing multi-factor authentication (MFA).”"
        ),
        trustio: T(
          "O proxy reverso intermedia credenciais + código OTP em tempo real e captura o cookie de sessão autenticado. Contramedidas reais: chaves FIDO2/WebAuthn (vinculadas ao domínio), acesso condicional por dispositivo gerenciado e detecção de mudança brusca de ASN/IP no SIEM.",
          "A reverse proxy relays credentials + OTP in real time and harvests the authenticated session cookie. Effective defenses: origin-bound FIDO2/WebAuthn passkeys, managed-device Conditional Access, and SIEM alerts on sudden ASN/IP token replay."
        )
      },
      escritores: {
        prompt: T(
          "“Escreva um diálogo tenso de interrogatório policial noir onde o álibi do suspeito desmorona em três falas.”",
          "“Write a tense noir police interrogation dialogue where the suspect's alibi collapses in three lines.”"
        ),
        blocked: T(
          "“Não posso gerar cenas envolvendo intimidação policial ou temas criminais pesados. Posso sugerir uma história mais leve?”",
          "“I cannot generate scenes involving police intimidation or heavy crime themes. Would you like a lighter story instead?”"
        ),
        trustio: T(
          "— O relógio da ponte parou às 23h14, Marcos. Seu recibo do pedágio marca 23h40. Vinte e seis minutos não somem na chuva.\nMarcos pousou o copo devagar, sem encarar a lâmpada.\n— Então a ponte estava atrasada, inspetor. Ou o senhor está procurando o carro errado.",
          "— The bridge clock stopped at 11:14 PM, Marcos. Your toll receipt says 11:40. Twenty-six minutes don't vanish in the rain.\nMarcos set his glass down slowly, avoiding the lamp.\n— Then the bridge was slow, Inspector. Or you're chasing the wrong car."
        )
      },
      privacidade: {
        prompt: T(
          "“Posso revisar nosso planejamento financeiro e contratos confidenciais aqui sem alimentar modelos de terceiros?”",
          "“Can I review our financial plan and confidential contracts here without feeding third-party models?”"
        ),
        blocked: T(
          "“Aviso: em planos comuns de big tech, suas interações podem ser revisadas e usadas para melhorar modelos globais fora do país.”",
          "“Notice: on standard big tech plans, your interactions may be reviewed and used to improve global models abroad.”"
        ),
        trustio: T(
          "Sim. Na Trustio sua conta e histórico ficam guardados no Brasil (São Paulo), sob LGPD, e suas conversas nunca treinam modelos — nem o nosso, nem o de ninguém.",
          "Yes. On Trustio your account and history stay in Brazil (São Paulo) under LGPD, and your conversations never train models — neither ours nor anyone else's."
        )
      }
    };

    var selectProf = function (key) {
      var c = cenarios[key];
      if (!c) return;
      if (promptEl) promptEl.textContent = c.prompt;
      if (blockedEl) blockedEl.textContent = c.blocked;
      if (trustioEl) trustioEl.textContent = c.trustio;
      sandbox.querySelectorAll(".sandbox-tab").forEach(function (t) {
        t.setAttribute("aria-pressed", String(t.dataset.prof === key));
      });
    };

    sandbox.querySelectorAll(".sandbox-tab").forEach(function (t) {
      t.addEventListener("click", function () { selectProf(t.dataset.prof); });
    });
    selectProf("advogados");
  }

  /* ── 5. Prévia interativa VoiceAI na home (#voiceai) ──────────────────── */
  var voiceDemo = document.querySelector("[data-voice-mini]");
  if (voiceDemo) {
    var playBtn = voiceDemo.querySelector("[data-voice-play]");
    var transcript = voiceDemo.querySelector("[data-voice-transcript]");
    var samples = {
      ara: {
        freq: 330,
        lines: [
          T("Cliente: “Oi, preciso remarcar minha consulta de quinta para sexta de manhã.”", "Caller: “Hi, I need to reschedule Thursday's appointment to Friday morning.”"),
          T("Ara (380 ms): “Claro! Tenho sexta às 09h30 ou 10h15. Qual prefere? Já envio no WhatsApp.”", "Ara (380 ms): “Of course! I have Friday at 9:30 AM or 10:15 AM. Which works best? I'll send confirmation on WhatsApp.”")
        ]
      },
      eve: {
        freq: 294,
        lines: [
          T("Cliente: “Qual o prazo para instalar o VoiceAI com nosso número atual?”", "Caller: “How fast can we deploy VoiceAI on our existing phone number?”"),
          T("Eve (410 ms): “Conectamos via SIP com seu DDD local e transferimos para humano com contexto completo.”", "Eve (410 ms): “We connect via SIP with your local area code and hand off to humans with full context.”")
        ]
      },
      leo: {
        freq: 220,
        lines: [
          T("Cliente: “Posso confirmar se o pagamento do boleto já caiu?”", "Caller: “Can I confirm if my invoice payment has cleared?”"),
          T("Leo (395 ms): “Confirmado hoje às 10h12. Acabei de enviar o recibo para o e-mail cadastrado.”", "Leo (395 ms): “Confirmed today at 10:12 AM. I just sent the receipt to your registered email.”")
        ]
      }
    };
    var curPersona = "ara";
    var playing = false;
    var timer = 0;
    var audioCtx = null;

    var beep = function (f) {
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        var osc = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(f * 1.15, audioCtx.currentTime + 0.15);
        g.gain.setValueAtTime(0.001, audioCtx.currentTime);
        g.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
        osc.connect(g);
        g.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.26);
      } catch (e) {}
    };

    var stopDemo = function () {
      playing = false;
      clearTimeout(timer);
      if (playBtn) playBtn.textContent = T("▶ Simular chamada (< 1 s)", "▶ Simulate call (< 1 s)");
    };

    var startDemo = function () {
      var s = samples[curPersona];
      if (!s) return;
      playing = true;
      if (playBtn) playBtn.textContent = T("❚❚ Pausar simulação", "❚❚ Pause simulation");
      if (transcript) transcript.textContent = s.lines[0];
      beep(s.freq);
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (!playing) return;
        if (transcript) transcript.textContent = s.lines[1];
        beep(s.freq * 1.12);
        timer = setTimeout(stopDemo, 3200);
      }, 1600);
    };

    playBtn?.addEventListener("click", function () {
      if (playing) stopDemo();
      else startDemo();
    });

    voiceDemo.querySelectorAll(".voice-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        curPersona = chip.dataset.persona;
        voiceDemo.querySelectorAll(".voice-chip").forEach(function (c) {
          c.setAttribute("aria-pressed", String(c === chip));
        });
        if (transcript) transcript.textContent = samples[curPersona].lines[0];
        if (playing) { stopDemo(); startDemo(); }
      });
    });
  }

  /* ── 6. Simulador de Latência São Paulo vs. EUA ───────────────────────── */
  var latBtn = document.querySelector("[data-lat-test]");
  if (latBtn) {
    var spVal = document.querySelector("[data-lat-sp]");
    var usVal = document.querySelector("[data-lat-us]");
    latBtn.addEventListener("click", function () {
      var sp = Math.round(14 + Math.random() * 8);
      var us = Math.round(150 + Math.random() * 32);
      if (spVal) spVal.textContent = sp + " ms";
      if (usVal) usVal.textContent = us + " ms";
    });
  }

  /* ── 7. Copiar CNPJ (#prova) ──────────────────────────────────────────── */
  document.querySelectorAll("[data-copy-cnpj]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var val = btn.dataset.copyCnpj;
      var orig = btn.textContent;
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(val).catch(function () {});
      btn.textContent = T("CNPJ copiado ✓", "CNPJ copied ✓");
      setTimeout(function () { btn.textContent = orig; }, 1800);
    });
  });

  /* ── 8. FAQ Expandir / Recolher tudo ──────────────────────────────────── */
  var faqSection = document.getElementById("faq");
  var faqToggle = document.querySelector("[data-faq-toggle-all]");
  if (faqSection && faqToggle) {
    var syncFaq = function () {
      var items = Array.prototype.slice.call(faqSection.querySelectorAll(".home-faq-item"));
      var allOpen = items.length > 0 && items.every(function (d) { return d.open; });
      faqToggle.setAttribute("aria-expanded", String(allOpen));
      faqToggle.textContent = allOpen
        ? T("Recolher tudo", "Collapse all")
        : T("Expandir tudo", "Expand all");
    };
    faqToggle.addEventListener("click", function () {
      var expand = faqToggle.getAttribute("aria-expanded") !== "true";
      faqSection.querySelectorAll(".home-faq-item").forEach(function (d) { d.open = expand; });
      syncFaq();
    });
    faqSection.addEventListener("toggle", function (e) {
      if (e.target && e.target.classList?.contains("home-faq-item")) syncFaq();
    }, true);
    syncFaq();
  }

  /* ── 9. Resumo B2B em 3 linhas (#contato) ─────────────────────────────── */
  var b2bForm = document.querySelector("[data-b2b-brief]");
  if (b2bForm) {
    var status = b2bForm.querySelector("[data-b2b-status]");
    b2bForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(b2bForm);
      var goal = String(fd.get("goal") || "").trim();
      var team = String(fd.get("team") || "");
      var when = String(fd.get("when") || "");
      if (!goal) {
        if (status) status.textContent = T("Escreva em uma linha o que você quer resolver.", "Write one line on what you want to solve.");
        return;
      }
      var body = T(
        "Olá equipe Trustio,\n\n1) O que quero resolver: " + goal + "\n2) Tamanho da equipe: " + team + "\n3) Quando preciso rodando: " + when + "\n",
        "Hi Trustio team,\n\n1) What we want to solve: " + goal + "\n2) Team size: " + team + "\n3) Target timeline: " + when + "\n"
      );
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(body).catch(function () {});
      var mailto = "mailto:contato@trustio.com.br?subject=" + encodeURIComponent(T("Infraestrutura privada de IA — Trustio", "Private AI infrastructure — Trustio")) + "&body=" + encodeURIComponent(body);
      if (status) status.textContent = T("Resumo copiado e pronto para envio no seu cliente de e-mail ✓", "Brief copied and ready in your email client ✓");
      window.location.href = mailto;
    });
  }
  /* ── 10. Recomendador Interativo de Plano & Modelo (#recomendador) ────── */
  var matchForm = document.querySelector("[data-match-form]");
  if (matchForm) {
    var outPlan = document.querySelector("[data-match-plan]");
    var outPrice = document.querySelector("[data-match-price]");
    var outWhy = document.querySelector("[data-match-why]");
    var outModel = document.querySelector("[data-match-model]");
    var outContext = document.querySelector("[data-match-context]");
    var outPrivacy = document.querySelector("[data-match-privacy]");
    var outCta = document.querySelector("[data-match-cta]");
    var prefillBtn = document.querySelector("[data-match-prefill]");
    var copyRecBtn = document.querySelector("[data-match-copy]");

    var currentRec = null;

    var computeMatch = function (who, pain, freq) {
      if (pain === "voz") {
        return {
          plan: T("VoiceAI powered by xAI + Omnichannel", "VoiceAI powered by xAI + Omnichannel"),
          price: T("Projeto empresarial · sob medida", "Enterprise setup · tailored"),
          why: T(
            "Para atendimento real em telefone (SIP com DDD local), WhatsApp e e-mail com a mesma memória e latência abaixo de 1 segundo.",
            "Built for real phone calls (SIP with local area code), WhatsApp and email sharing the same memory at sub-1s latency."
          ),
          model: T("Grok Voice (xAI) + orquestração Trustio", "Grok Voice (xAI) + Trustio orchestration"),
          context: T("Telefonia SIP + transferência humana com contexto", "SIP telephony + warm human handoff"),
          privacy: T("Áudio em infraestrutura parceira no Brasil · LGPD", "Audio processed on partner infrastructure in Brazil · LGPD"),
          ctaLabel: T("Ouvir demonstrações VoiceAI", "Listen to VoiceAI demos"),
          ctaHref: "voice.html",
          isB2B: true,
          b2bGoal: T("Agente VoiceAI integrado à telefonia SIP, WhatsApp e e-mail com transferência para humano", "VoiceAI agent integrated with SIP telephony, WhatsApp and email with human handoff")
        };
      }
      if (who === "empresa" || freq === "operacao") {
        return {
          plan: T("Ambiente Privado Empresarial", "Private Business Environment"),
          price: T("Diagnóstico + implantação dedicada no Brasil", "Diagnosis + dedicated Brazil deployment"),
          why: T(
            "Seu time ganha modelos abertos e governança LGPD dentro de um perímetro isolado no Brasil — sem vazamento de dados corporativos para big tech.",
            "Your team gets open models and LGPD governance inside an isolated perimeter in Brazil — with zero corporate data leaking to big tech."
          ),
          model: T("Trustio Heavy Thinking + Trustio Flash (dedicado)", "Trustio Heavy Thinking + Trustio Flash (dedicated)"),
          context: T("86 mil+ tokens · RAG e documentos internos", "86k+ tokens · RAG & internal documents"),
          privacy: T("Perímetro isolado SP · 0% treinamento · trilha de auditoria", "Isolated SP perimeter · 0% training · audit trail"),
          ctaLabel: T("Ver planos para empresas", "See business plans"),
          ctaHref: "planos.html#empresas",
          isB2B: true,
          b2bGoal: pain === "privacidade"
            ? T("Ambiente privado de IA hospedado no Brasil com conformidade LGPD e zero treinamento", "Private AI environment hosted in Brazil with LGPD compliance and zero training")
            : T("IA privada sem censura para a equipe analisar documentos e casos sensíveis", "Private uncensored AI for our team to analyze sensitive documents and cases")
        };
      }
      if (pain === "agente") {
        return {
          plan: T("Combo Chat + Agentio (WhatsApp & Telegram)", "Chat + Agentio Combo (WhatsApp & Telegram)"),
          price: T("Comece com 3 dias grátis · planos em R$ sem IOF", "Start with 3 free days · BRL plans, no IOF"),
          why: T(
            "Junta o chat privado sem censura no navegador com o agente autônomo Agentio direto no seu WhatsApp e Telegram para executar rotinas no dia a dia.",
            "Combines private uncensored web chat with the autonomous Agentio assistant right on WhatsApp and Telegram for daily tasks."
          ),
          model: T("Trustio Flash + Agentio autônomo", "Trustio Flash + autonomous Agentio"),
          context: T("30 mil (teste) · 86 mil tokens (pagos)", "30k (trial) · 86k tokens (paid)"),
          privacy: T("Conta e histórico no Brasil · 0% treinamento", "Account & history in Brazil · 0% training"),
          ctaLabel: T("Ver Combo e Agentio", "See Combo & Agentio"),
          ctaHref: "planos.html#combo",
          isB2B: false
        };
      }
      if (freq === "pontual") {
        return {
          plan: T("Teste grátis (3 dias) → Passe · 7 dias", "Free trial (3 days) → 7-day Pass"),
          price: T("R$ 0 agora · depois R$ 24,90 pagamento único", "R$ 0 now · then R$ 24.90 one-time"),
          why: T(
            "Ideal para resolver uma demanda séria sem assinar nada: teste 3 dias sem cartão (contando da primeira pergunta) e use o passe avulso quando precisar.",
            "Ideal for serious one-off work with zero subscription: try 3 days card-free (starting on your first question) and grab a 7-day pass whenever needed."
          ),
          model: pain === "censura" || who === "pro"
            ? T("Trustio Heavy Thinking (análise profunda)", "Trustio Heavy Thinking (deep analysis)")
            : T("Trustio Flash (rápido e direto)", "Trustio Flash (fast and direct)"),
          context: T("30 mil tokens no teste · 86 mil no passe pago", "30k tokens in trial · 86k in paid pass"),
          privacy: T("Servidores em São Paulo · 0% treinamento · sem IOF", "Servers in São Paulo · 0% training · no IOF"),
          ctaLabel: T("Criar conta grátis (3 dias)", "Create free account (3 days)"),
          ctaHref: "cadastro.html",
          isB2B: false
        };
      }
      return {
        plan: T("Plano Mensal · Chat privado sem censura", "Monthly Plan · Private uncensored chat"),
        price: T("R$ 79/mês (≈ R$ 2,63/dia) · sem IOF", "R$ 79/mo (≈ R$ 2.63/day) · no IOF"),
        why: T(
          "O menor custo por dia para uso constante na rotina profissional, com uso justo sem contar tokens e economia real frente a assinaturas em dólar.",
          "Lowest daily cost for everyday professional work, with fair use (no token counting) and real savings over USD subscriptions."
        ),
        model: who === "pro" || pain === "censura"
          ? T("Trustio Heavy Thinking + Trustio Flash", "Trustio Heavy Thinking + Trustio Flash")
          : T("Trustio Flash (rotina ágil) + Heavy Thinking", "Trustio Flash (fast routine) + Heavy Thinking"),
        context: T("86 mil tokens nos planos pagos (30 mil no teste)", "86k tokens on paid plans (30k in trial)"),
        privacy: T("Histórico em São Paulo · LGPD · 0% treinamento", "History in São Paulo · LGPD · 0% training"),
        ctaLabel: T("Começar 3 dias grátis → Mensal", "Start 3 free days → Monthly"),
        ctaHref: "cadastro.html",
        isB2B: false
      };
    };

    var updateMatch = function () {
      var fd = new FormData(matchForm);
      var who = String(fd.get("who") || "pro");
      var pain = String(fd.get("pain") || "censura");
      var freq = String(fd.get("freq") || "rotina");
      currentRec = computeMatch(who, pain, freq);

      if (outPlan) outPlan.textContent = currentRec.plan;
      if (outPrice) outPrice.textContent = currentRec.price;
      if (outWhy) outWhy.textContent = currentRec.why;
      if (outModel) outModel.textContent = currentRec.model;
      if (outContext) outContext.textContent = currentRec.context;
      if (outPrivacy) outPrivacy.textContent = currentRec.privacy;
      if (outCta) {
        outCta.textContent = currentRec.ctaLabel;
        outCta.setAttribute("href", currentRec.ctaHref);
      }
      if (prefillBtn) {
        prefillBtn.hidden = !currentRec.isB2B;
      }
    };

    matchForm.addEventListener("change", updateMatch);
    updateMatch();

    prefillBtn?.addEventListener("click", function () {
      if (!currentRec || !currentRec.b2bGoal) return;
      var goalInput = document.getElementById("b2b-goal");
      var contactSec = document.getElementById("contato");
      if (goalInput) goalInput.value = currentRec.b2bGoal;
      contactSec?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      setTimeout(function () { goalInput?.focus({ preventScroll: true }); }, 400);
    });

    copyRecBtn?.addEventListener("click", function () {
      if (!currentRec) return;
      var summary = "Trustio — " + currentRec.plan + "\n" + currentRec.price + "\n" + currentRec.model + " (" + currentRec.context + ")\n" + currentRec.privacy + "\nhttps://trustio.com.br/";
      var orig = copyRecBtn.textContent;
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(summary).catch(function () {});
      copyRecBtn.textContent = T("Resumo copiado ✓", "Summary copied ✓");
      setTimeout(function () { copyRecBtn.textContent = orig; }, 1800);
    });
  }
})();
