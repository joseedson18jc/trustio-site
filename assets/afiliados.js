// Trustio Afiliados: simulador de comissão e cadastro via e-mail (CSP: sem scripts inline).
(function () {
  "use strict";

  const COMMISSION_ANNUAL = 200;
  const COMMISSION_MONTHLY = 79;
  const COMMISSION_B2B = 500;
  const MONTHS_PER_YEAR = 12;
  const MONTHLY_CAP = 25000;
  const ANNUAL_CAP = 300000;
  const CONTACT_EMAIL = "contato@trustio.com.br";
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

  function initForm() {
    const form = document.getElementById("f-cad");
    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = document.getElementById("f-nome");
      const email = document.getElementById("f-email");
      const channel = document.getElementById("f-canal");
      const audience = document.getElementById("f-aud");

      const errors = [
        [name, "m-nome", name.value.trim() ? "" : "Informe seu nome."],
        [email, "m-email", EMAIL_PATTERN.test(email.value.trim()) ? "" : "E-mail inválido."],
        [channel, "m-canal", channel.value ? "" : "Selecione um canal."],
      ];
      errors.forEach(([field, id, message]) => setFieldError(field, id, message));

      const firstInvalid = errors.find(([, , message]) => message);
      if (firstInvalid) {
        firstInvalid[0].focus();
        return;
      }

      const body = [
        "Nome: " + name.value.trim(),
        "E-mail: " + email.value.trim(),
        "Canal principal: " + channel.value,
        "Audiência: " + (audience.value.trim() || "—"),
      ].join("\n");
      const href = "mailto:" + CONTACT_EMAIL +
        "?subject=" + encodeURIComponent("Cadastro — Trustio Afiliados") +
        "&body=" + encodeURIComponent(body);

      window.location.href = href;
      form.hidden = true;
      document.getElementById("ok-msg").hidden = false;
    });
  }

  initSimulator();
  initForm();
})();
