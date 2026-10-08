// Trustio Afiliados: simulador de comissão e cadastro (POST api.trustio.com.br/afiliados). CSP: sem scripts inline.
(function () {
  "use strict";

  const COMMISSION_ANNUAL = 200;
  const COMMISSION_MONTHLY = 79;
  const COMMISSION_B2B = 500;
  const MONTHS_PER_YEAR = 12;
  const MONTHLY_CAP = 25000;
  const ANNUAL_CAP = 300000;
  const API_URL = "https://api.trustio.com.br/afiliados";
  const ERRORS = {
    cpf_invalido: "CPF inválido. Confira os números.",
    cpf_em_uso: "Este CPF já está cadastrado com outro e-mail. Fale com contato@trustio.com.br.",
    email_invalido: "E-mail inválido.",
    email_nao_enviado: "Cadastro salvo, mas o e-mail de confirmação não saiu. Tente de novo em instantes.",
    whatsapp_invalido: "WhatsApp inválido. Use DDD + número.",
    padrao: "Não foi possível concluir agora. Tente de novo em instantes ou escreva para contato@trustio.com.br.",
  };
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const brl = (value) => "R$ " + Math.round(value).toLocaleString("pt-BR");
  const plural = (count, singular, many) => count + " " + (count === 1 ? singular : many);

  function initSimulator() {
    const sales = document.getElementById("s-vendas");
    const mix = document.getElementById("s-mix");
    const b2b = document.getElementById("s-b2b");
    if (!sales || !mix || !b2b) return;

    const out = {
      sales: document.getElementById("o-vendas"),
      mix: document.getElementById("o-mix"),
      b2b: document.getElementById("o-b2b"),
      month: document.getElementById("r-mes"),
      detail: document.getElementById("r-det"),
      year: document.getElementById("r-ano"),
    };

    function render() {
      const total = Number(sales.value);
      const diagnostics = Number(b2b.value);
      const annual = Math.round(total * (Number(mix.value) / 100));
      const monthly = total - annual;
      const sum = annual * COMMISSION_ANNUAL + monthly * COMMISSION_MONTHLY + diagnostics * COMMISSION_B2B;

      out.sales.textContent = String(total);
      out.mix.textContent = mix.value + "%";
      out.b2b.textContent = String(diagnostics);
      out.month.textContent = brl(Math.min(sum, MONTHLY_CAP));
      out.detail.textContent =
        plural(annual, "venda anual", "vendas anuais") + " (" + brl(annual * COMMISSION_ANNUAL) + ") + " +
        plural(monthly, "mensal", "mensais") + " (" + brl(monthly * COMMISSION_MONTHLY) + ") + " +
        plural(diagnostics, "diagnóstico", "diagnósticos") + " (" + brl(diagnostics * COMMISSION_B2B) + ").";
      out.year.textContent = brl(Math.min(sum * MONTHS_PER_YEAR, ANNUAL_CAP));
    }

    [sales, mix, b2b].forEach((input) => input.addEventListener("input", render));
    render();
  }

  function setFieldError(field, messageId, message) {
    document.getElementById(messageId).textContent = message || "";
    field.classList.toggle("is-invalid", Boolean(message));
    field.setAttribute("aria-invalid", message ? "true" : "false");
  }

  // Mesmo cálculo do worker (worker/src/afiliados.js) e do banco (cpf_valido).
  function cpfValido(raw) {
    const cpf = String(raw || "").replace(/\D/g, "");
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    const digit = (n) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += Number(cpf[i]) * (n + 1 - i);
      const dv = (sum * 10) % 11;
      return dv === 10 ? 0 : dv;
    };
    return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
  }

  function maskCpf(value) {
    const d = value.replace(/\D/g, "").slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }

  function initForm() {
    const form = document.getElementById("f-cad");
    if (!form) return;
    const field = (id) => document.getElementById(id);
    const cpf = field("f-cpf");
    const pixType = field("f-pix-tipo");
    const pix = field("f-pix");
    const formMsg = form.querySelector("[data-form-msg]");
    const submit = form.querySelector("button[type=submit]");

    cpf.addEventListener("input", () => { cpf.value = maskCpf(cpf.value); });
    // Chave do tipo CPF: sugere o próprio CPF digitado.
    pixType.addEventListener("change", () => {
      if (pixType.value === "cpf" && !pix.value.trim()) pix.value = cpf.value.replace(/\D/g, "");
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      formMsg.hidden = true;
      const name = field("f-nome");
      const email = field("f-email");
      const channel = field("f-canal");
      const whatsapp = field("f-wa");

      const errors = [
        [name, "m-nome", name.value.trim() ? "" : "Informe seu nome."],
        [email, "m-email", EMAIL_PATTERN.test(email.value.trim()) ? "" : "E-mail inválido."],
        [whatsapp, "m-wa", /^\d{10,13}$/.test(whatsapp.value.replace(/\D/g, "")) ? "" : "WhatsApp com DDD."],
        [channel, "m-canal", channel.value ? "" : "Selecione um canal."],
        [cpf, "m-cpf", cpfValido(cpf.value) ? "" : "CPF inválido."],
        [pixType, "m-pix-tipo", pixType.value ? "" : "Selecione o tipo da chave."],
        [pix, "m-pix", pix.value.trim() ? "" : "Informe a chave Pix."],
      ];
      errors.forEach(([el, id, message]) => setFieldError(el, id, message));

      const firstInvalid = errors.find(([, , message]) => message);
      if (firstInvalid) {
        firstInvalid[0].focus();
        return;
      }

      submit.setAttribute("aria-busy", "true");
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.value.trim(),
            nome: name.value.trim(),
            canal: channel.value,
            whatsapp: whatsapp.value,
            audiencia: field("f-aud").value.trim(),
            cpf: cpf.value,
            pix_tipo: pixType.value,
            pix: pix.value.trim(),
            _honey: field("f-honey").value,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.error || "http_" + response.status);
        document.querySelector("[data-ok-email]").textContent = email.value.trim();
        form.hidden = true;
        field("ok-msg").hidden = false;
      } catch (err) {
        formMsg.textContent = ERRORS[err.message] || ERRORS.padrao;
        formMsg.hidden = false;
      } finally {
        submit.removeAttribute("aria-busy");
      }
    });
  }

  initSimulator();
  initForm();
})();
