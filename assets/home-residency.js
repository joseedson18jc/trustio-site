"use strict";
  /* ---------- Faixa Brasil: estrelas ---------- */
  (function () {
    var s = document.querySelector(".home-residency-stars"); if (!s) return;
    // Estrelas num SVG (atributos, sem style inline): compatível com o CSP estrito.
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var classes = ["star-tw-1", "star-tw-2", "star-tw-3"];
    for (var k = 0; k < 110; k++) {
      var c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", (Math.random() * 100).toFixed(2) + "%");
      c.setAttribute("cy", (Math.random() * 78).toFixed(2) + "%");
      c.setAttribute("r", Math.random() < 0.15 ? "1.5" : "1");
      c.setAttribute("fill", "#cfe3ff");
      c.setAttribute("fill-opacity", (0.25 + Math.random() * 0.55).toFixed(2));
      c.setAttribute("class", classes[k % 3]);
      svg.appendChild(c);
    }
    s.appendChild(svg);
  })();

