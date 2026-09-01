const orb = document.querySelector("#orb");
const canvas = document.querySelector("#orb-canvas");

if (orb && canvas) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
  });

  if (!gl) {
    drawFallback();
  } else {
    const vertexSource = `#version 300 es
      precision highp float;
      in vec2 aPosition;
      out vec2 vUv;
      void main() {
        vUv = aPosition * 0.5 + 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    const fragmentSource = `#version 300 es
      precision highp float;

      in vec2 vUv;
      out vec4 outColor;

      uniform vec2 uResolution;
      uniform vec2 uPointer;
      uniform float uTime;
      uniform float uEnergy;
      uniform float uLevel;
      uniform float uPhase;

      #define PI 3.141592653589793

      float saturate(float x) { return clamp(x, 0.0, 1.0); }

      mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
        float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

        float nx00 = mix(n000, n100, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx11 = mix(n011, n111, f.x);
        float nxy0 = mix(nx00, nx10, f.y);
        float nxy1 = mix(nx01, nx11, f.y);
        return mix(nxy0, nxy1, f.z);
      }

      float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 0.52;
        for (int i = 0; i < 5; i++) {
          value += noise3(p) * amplitude;
          p = p * 2.02 + vec3(13.1, 7.7, 5.3);
          amplitude *= 0.49;
        }
        return value;
      }

      vec2 sphereHit(vec3 ro, vec3 rd, float radius) {
        float b = dot(ro, rd);
        float c = dot(ro, ro) - radius * radius;
        float h = b * b - c;
        if (h < 0.0) return vec2(-1.0);
        h = sqrt(h);
        return vec2(-b - h, -b + h);
      }

      vec3 rotateVolume(vec3 p, float t) {
        p.xz = rot(t * 0.31 + uPointer.x * 0.16) * p.xz;
        p.yz = rot(-t * 0.18 + uPointer.y * 0.11) * p.yz;
        p.xy = rot(t * 0.07) * p.xy;
        return p;
      }

      vec3 spectralPalette(float t, float depth) {
        vec3 indigo = vec3(0.075, 0.105, 0.31);
        vec3 blue = vec3(0.10, 0.31, 0.92);
        vec3 cyan = vec3(0.18, 0.82, 1.00);
        vec3 violet = vec3(0.46, 0.20, 0.98);
        vec3 coldWhite = vec3(0.74, 0.90, 1.00);

        vec3 c = mix(indigo, blue, smoothstep(0.18, 0.66, t));
        c = mix(c, violet, smoothstep(0.57, 0.96, t) * (0.52 + 0.20 * uPhase));
        c = mix(c, cyan, smoothstep(0.62, 0.94, 1.0 - abs(t - 0.56) * 1.35) * 0.34);
        c = mix(c, coldWhite, smoothstep(0.82, 1.0, t) * 0.15);
        return c * (0.76 + depth * 0.44);
      }

      float starPoint(vec3 p, float scale, float threshold) {
        vec3 cell = floor(p * scale);
        vec3 local = fract(p * scale) - 0.5;
        float seed = hash31(cell + 17.0);
        float enabled = smoothstep(threshold, 1.0, seed);
        float d2 = dot(local, local);
        return enabled * exp(-d2 * 620.0);
      }

      void main() {
        vec2 frag = gl_FragCoord.xy;
        vec2 uv = (frag * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);

        float radial = length(uv);
        float halo = exp(-pow(max(radial - 0.56, 0.0) * 3.7, 2.0));
        halo *= smoothstep(1.10, 0.55, radial);

        float cameraBreathe = sin(uTime * 0.38) * 0.012;
        vec3 ro = vec3(uPointer.x * 0.035, uPointer.y * 0.028, 3.05 + cameraBreathe);
        vec3 rd = normalize(vec3(uv * 1.06, -2.68));
        vec2 hit = sphereHit(ro, rd, 0.985);

        if (hit.x < 0.0) {
          vec3 haloColor = mix(vec3(0.10, 0.18, 0.62), vec3(0.25, 0.12, 0.62), 0.5 + 0.5 * sin(uTime * 0.19));
          float a = halo * (0.018 + uEnergy * 0.022);
          outColor = vec4(haloColor * a, a);
          return;
        }

        float tNear = max(hit.x, 0.0);
        float tFar = hit.y;
        float travel = max(tFar - tNear, 0.001);
        float stepSize = travel / 46.0;
        float t = tNear + stepSize * 0.35;

        vec3 accum = vec3(0.0);
        float alpha = 0.0;
        float timeFlow = uTime * (0.16 + uEnergy * 0.16);

        for (int i = 0; i < 46; i++) {
          vec3 p = ro + rd * t;
          vec3 q = rotateVolume(p, timeFlow);

          float radialInside = saturate(1.0 - length(p));
          float n1 = fbm(q * 2.05 + vec3(0.0, timeFlow * 0.22, -timeFlow * 0.12));
          float n2 = fbm(q * 3.75 + vec3(timeFlow * 0.15, -timeFlow * 0.09, 4.3));
          float n3 = fbm(q * 6.4 - vec3(2.7, timeFlow * 0.12, timeFlow * 0.08));

          float ribbonA = abs(q.y + 0.20 * sin(q.x * 3.1 + timeFlow * 1.35) + 0.12 * sin(q.z * 5.0 - timeFlow));
          float ribbonB = abs(q.x * 0.68 + q.y * 0.26 + 0.18 * sin(q.z * 4.4 + timeFlow * 0.7));
          float ribbon = exp(-ribbonA * 5.8) * 0.58 + exp(-ribbonB * 6.7) * 0.30;

          float cloud = smoothstep(0.47, 0.82, n1 * 0.76 + n2 * 0.34);
          cloud *= 0.54 + n3 * 0.54;
          float density = (cloud * 0.70 + ribbon * (0.22 + uEnergy * 0.20));
          density *= smoothstep(0.0, 0.19, radialInside);
          density *= 0.70 + uEnergy * 0.56 + uLevel * 0.20;

          float paletteT = saturate(n1 * 0.72 + n2 * 0.38 + q.y * 0.08 + 0.05 * sin(timeFlow));
          vec3 sampleColor = spectralPalette(paletteT, radialInside);
          sampleColor *= 0.52 + ribbon * 0.92 + n3 * 0.22;

          float starA = starPoint(rotateVolume(q + vec3(0.12), -timeFlow * 0.55), 10.5, 0.979);
          float starB = starPoint(rotateVolume(q * 1.13 - vec3(0.6), timeFlow * 0.28), 15.5, 0.987);
          float stars = (starA * 1.0 + starB * 0.72) * smoothstep(0.03, 0.22, radialInside);
          vec3 starColor = mix(vec3(0.50, 0.82, 1.0), vec3(0.88, 0.92, 1.0), hash31(floor(q * 9.0)));

          float localAlpha = density * stepSize * (0.78 + uEnergy * 0.58);
          localAlpha = clamp(localAlpha, 0.0, 0.16);

          accum += (1.0 - alpha) * sampleColor * localAlpha * 1.72;
          accum += (1.0 - alpha) * starColor * stars * (0.10 + uEnergy * 0.10);
          alpha += (1.0 - alpha) * localAlpha;

          t += stepSize;
        }

        vec3 surfacePos = ro + rd * tNear;
        vec3 normal = normalize(surfacePos);
        vec3 viewDir = normalize(-rd);
        vec3 lightDir = normalize(vec3(-0.55, 0.72, 0.82));
        vec3 halfDir = normalize(lightDir + viewDir);

        float ndv = saturate(dot(normal, viewDir));
        float fresnel = pow(1.0 - ndv, 3.15);
        float spec = pow(saturate(dot(normal, halfDir)), 92.0);
        float broadSpec = pow(saturate(dot(normal, halfDir)), 20.0);
        float topLight = smoothstep(-0.25, 0.95, normal.y) * smoothstep(-0.9, 0.2, -normal.x);

        vec3 baseGlass = vec3(0.015, 0.022, 0.055);
        vec3 rimR = vec3(0.36, 0.30, 1.00) * fresnel * (0.28 + 0.16 * normal.x);
        vec3 rimG = vec3(0.08, 0.62, 1.00) * fresnel * 0.20;
        vec3 rimB = vec3(0.32, 0.84, 1.00) * fresnel * (0.25 - 0.11 * normal.x);
        vec3 chroma = rimR + rimG + rimB;

        vec3 glass = baseGlass * (0.35 + 0.65 * fresnel);
        glass += chroma * (0.42 + uEnergy * 0.26);
        glass += vec3(0.82, 0.93, 1.0) * spec * (0.30 + uEnergy * 0.16);
        glass += vec3(0.18, 0.31, 0.58) * broadSpec * 0.13;
        glass += vec3(0.18, 0.27, 0.56) * topLight * 0.035;

        float lowerShade = smoothstep(-0.15, -0.92, normal.y);
        accum *= 1.0 - lowerShade * 0.28;

        float innerGlow = smoothstep(0.90, 0.0, radial) * (0.025 + uEnergy * 0.025);
        vec3 finalColor = accum + glass + vec3(0.10, 0.18, 0.52) * innerGlow;

        float shellAlpha = 0.84 + fresnel * 0.16;
        float finalAlpha = max(shellAlpha, saturate(alpha * 1.65));

        finalColor = finalColor / (vec3(1.0) + finalColor * 0.46);
        finalColor = pow(max(finalColor, 0.0), vec3(0.92));

        outColor = vec4(finalColor, finalAlpha);
      }
    `;

    const program = createProgram(gl, vertexSource, fragmentSource);

    if (!program) {
      drawFallback();
    } else {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );

      const positionLocation = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      const uniforms = {
        resolution: gl.getUniformLocation(program, "uResolution"),
        pointer: gl.getUniformLocation(program, "uPointer"),
        time: gl.getUniformLocation(program, "uTime"),
        energy: gl.getUniformLocation(program, "uEnergy"),
        level: gl.getUniformLocation(program, "uLevel"),
        phase: gl.getUniformLocation(program, "uPhase"),
      };

      const stateTuning = {
        idle: { energy: 0.40, speed: 0.72, phase: 0.20 },
        connecting: { energy: 0.72, speed: 1.55, phase: 0.42 },
        listening: { energy: 0.58, speed: 0.92, phase: 0.32 },
        thinking: { energy: 0.96, speed: 1.92, phase: 0.78 },
        speaking: { energy: 0.82, speed: 1.26, phase: 0.58 },
      };

      let width = 1;
      let height = 1;
      let dpr = 1;
      let raf = 0;
      let pageVisible = !document.hidden;
      let lastNow = performance.now();
      let visualTime = 0;
      let currentEnergy = stateTuning.idle.energy;
      let currentSpeed = stateTuning.idle.speed;
      let currentPhase = stateTuning.idle.phase;
      let smoothLevel = 0;
      let pointerX = 0;
      let pointerY = 0;
      let targetPointerX = 0;
      let targetPointerY = 0;

      gl.useProgram(program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);

      function resize() {
        const rect = canvas.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.35 : 1.75);
        width = Math.max(1, Math.round(rect.width * dpr));
        height = Math.max(1, Math.round(rect.height * dpr));

        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          gl.viewport(0, 0, width, height);
        }
      }

      function readVoiceLevel() {
        const value = Number.parseFloat(getComputedStyle(orb).getPropertyValue("--voice-level"));
        return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
      }

      function frame(now) {
        if (!pageVisible) return;

        const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
        lastNow = now;

        const state = stateTuning[orb.dataset.state] || stateTuning.idle;
        const easing = 1 - Math.exp(-dt * 4.7);
        currentEnergy += (state.energy - currentEnergy) * easing;
        currentSpeed += (state.speed - currentSpeed) * easing;
        currentPhase += (state.phase - currentPhase) * easing;
        smoothLevel += (readVoiceLevel() - smoothLevel) * (1 - Math.exp(-dt * 10.0));
        pointerX += (targetPointerX - pointerX) * (1 - Math.exp(-dt * 4.0));
        pointerY += (targetPointerY - pointerY) * (1 - Math.exp(-dt * 4.0));

        const motionScale = reducedMotion.matches ? 0.08 : 1;
        visualTime += dt * currentSpeed * motionScale;

        resize();
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.uniform2f(uniforms.resolution, width, height);
        gl.uniform2f(uniforms.pointer, pointerX, pointerY);
        gl.uniform1f(uniforms.time, visualTime);
        gl.uniform1f(uniforms.energy, Math.min(1.15, currentEnergy + smoothLevel * 0.14));
        gl.uniform1f(uniforms.level, smoothLevel);
        gl.uniform1f(uniforms.phase, currentPhase);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        raf = requestAnimationFrame(frame);
      }

      function updatePointer(event) {
        const rect = orb.getBoundingClientRect();
        const point = event.touches?.[0] || event;
        const x = ((point.clientX - rect.left) / rect.width) * 2 - 1;
        const y = ((point.clientY - rect.top) / rect.height) * 2 - 1;
        targetPointerX = Math.min(1, Math.max(-1, x));
        targetPointerY = Math.min(1, Math.max(-1, -y));
      }

      orb.addEventListener("pointermove", updatePointer, { passive: true });
      orb.addEventListener("pointerleave", () => {
        targetPointerX = 0;
        targetPointerY = 0;
      }, { passive: true });
      orb.addEventListener("touchmove", updatePointer, { passive: true });

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(orb);

      document.addEventListener("visibilitychange", () => {
        pageVisible = !document.hidden;
        if (pageVisible) {
          lastNow = performance.now();
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(frame);
        } else {
          cancelAnimationFrame(raf);
        }
      });

      reducedMotion.addEventListener?.("change", () => {
        lastNow = performance.now();
      });

      resize();
      raf = requestAnimationFrame(frame);
    }
  }

  function createShader(context, type, source) {
    const shader = context.createShader(type);
    context.shaderSource(shader, source);
    context.compileShader(shader);
    if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
      console.error("Voice orb shader compile error:", context.getShaderInfoLog(shader));
      context.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(context, vertexSource, fragmentSource) {
    const vertexShader = createShader(context, context.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(context, context.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) return null;

    const program = context.createProgram();
    context.attachShader(program, vertexShader);
    context.attachShader(program, fragmentShader);
    context.linkProgram(program);
    context.deleteShader(vertexShader);
    context.deleteShader(fragmentShader);

    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      console.error("Voice orb program link error:", context.getProgramInfoLog(program));
      context.deleteProgram(program);
      return null;
    }

    return program;
  }

  function drawFallback() {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function render() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const r = Math.min(rect.width, rect.height) * 0.35;
      const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.42, r * 0.03, cx, cy, r);
      g.addColorStop(0, "rgba(225,246,255,.95)");
      g.addColorStop(0.06, "rgba(89,180,255,.7)");
      g.addColorStop(0.28, "rgba(74,91,255,.58)");
      g.addColorStop(0.58, "rgba(29,31,84,.96)");
      g.addColorStop(1, "rgba(3,4,11,1)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    render();
    window.addEventListener("resize", render, { passive: true });
  }
}
