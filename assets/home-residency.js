"use strict";
  /* ---------- Faixa Brasil: estrelas ---------- */
  (function () {
    var s = document.querySelector(".home-residency-stars"); if (!s) return;
    var frag = document.createDocumentFragment();
    for (var k = 0; k < 110; k++) {
      var z = Math.random() < 0.15 ? 3 : 2, i = document.createElement("i");
      i.style.cssText = "left:" + (Math.random() * 100).toFixed(2) + "%;top:" + (Math.random() * 78).toFixed(2) + "%;width:" + z + "px;height:" + z + "px;animation-delay:" + (-Math.random() * 4).toFixed(2) + "s;animation-duration:" + (3 + Math.random() * 4).toFixed(2) + "s";
      frag.appendChild(i);
    }
    s.appendChild(frag);
  })();

