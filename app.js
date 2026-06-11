/* =====================================================================
   ACLS Protocolo — lógica do app
   Decisões de UX para uso em emergência:
   - Um único botão inicia tudo (timer de ciclo + tempo total)
   - Alertas redundantes: som + vibração + animação (ambiente ruidoso)
   - Wake lock: a tela não apaga durante a PCR
   - Registro automático com timestamps para o prontuário
   ===================================================================== */

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  /* ---------------- Navegação ---------------- */

  const SCREENS = {
    home: { title: "ACLS Protocolo" },
    pcr: { title: "Parada Cardiorrespiratória" },
    bradicardia: { title: "Bradicardia" },
    taquicardia: { title: "Taquicardia" },
    pospcr: { title: "Cuidados Pós-PCR" },
    medicacoes: { title: "Medicações" },
  };

  let current = "home";

  function navigate(name, push = true) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(`#screen-${name}`).classList.add("active");
    $("#header-title").textContent = SCREENS[name].title;
    $("#btn-back").classList.toggle("hidden", name === "home");
    current = name;
    window.scrollTo(0, 0);
    if (push) history.pushState({ screen: name }, "", `#${name}`);
  }

  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.nav));
  });

  $("#btn-back").addEventListener("click", () => history.back());

  window.addEventListener("popstate", (e) => {
    navigate((e.state && e.state.screen) || "home", false);
  });

  history.replaceState({ screen: "home" }, "", "#home");

  /* ---------------- Relógio do cabeçalho ---------------- */

  setInterval(() => {
    $("#header-clock").textContent = new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, 1000);

  /* ---------------- Áudio (alertas e metrônomo) ---------------- */

  let audioCtx = null;

  function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function beep(freq = 880, duration = 0.15, volume = 0.5, when = 0) {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain).connect(ctx.destination);
    const t = ctx.currentTime + when;
    osc.start(t);
    osc.stop(t + duration);
  }

  function alarm() {
    beep(880, 0.18, 0.6, 0);
    beep(880, 0.18, 0.6, 0.3);
    beep(1100, 0.3, 0.6, 0.6);
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 500]);
  }

  /* Metrônomo 110/min com agendamento preciso via Web Audio */
  const METRONOME_BPM = 110;
  let metronomeOn = false;
  let nextTick = 0;
  let metronomeTimer = null;

  function metronomeLoop() {
    const ctx = getAudio();
    while (nextTick < ctx.currentTime + 0.2) {
      beep(660, 0.05, 0.35, nextTick - ctx.currentTime);
      nextTick += 60 / METRONOME_BPM;
    }
    metronomeTimer = setTimeout(metronomeLoop, 100);
  }

  $("#btn-metronome").addEventListener("click", function () {
    metronomeOn = !metronomeOn;
    this.setAttribute("aria-pressed", String(metronomeOn));
    if (metronomeOn) {
      nextTick = getAudio().currentTime + 0.1;
      metronomeLoop();
    } else {
      clearTimeout(metronomeTimer);
    }
  });

  /* ---------------- Wake lock ---------------- */

  let wakeLock = null;

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    } catch (_) { /* não suportado ou negado — segue sem */ }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pcr.running) requestWakeLock();
  });

  /* ---------------- Estado da PCR ---------------- */

  const CYCLE_SECONDS = 120;
  const ADRENALINE_DUE = 180;   // 3 min — janela 3–5 min
  const ADRENALINE_OVERDUE = 300; // 5 min

  const pcr = {
    running: false,
    startedAt: null,
    cycleEndsAt: null,
    cycle: 0,
    shocks: 0,
    adrenalineDoses: 0,
    lastAdrenalineAt: null,
    amiodaroneDoses: 0,
    events: [],
    interval: null,
    autoCycleTimeout: null,
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  function logEvent(text) {
    const now = new Date();
    const elapsed = pcr.startedAt ? Math.floor((now - pcr.startedAt) / 1000) : 0;
    pcr.events.push({ clock: now.toLocaleTimeString("pt-BR"), elapsed, text });
    renderLog();
  }

  function renderLog() {
    const ul = $("#event-log");
    if (!pcr.events.length) {
      ul.innerHTML = '<li class="log-empty">Nenhum evento registrado.</li>';
      return;
    }
    ul.innerHTML = pcr.events
      .map((e) => `<li><span class="log-time">${e.clock} (+${fmt(e.elapsed)})</span><span>${e.text}</span></li>`)
      .join("");
    ul.scrollTop = ul.scrollHeight;
  }

  function setActionsEnabled(enabled) {
    ["#btn-shock", "#btn-adrenaline", "#btn-amiodarone", "#btn-rosc"].forEach((s) => {
      $(s).disabled = !enabled;
    });
  }

  function startCycle() {
    clearTimeout(pcr.autoCycleTimeout);
    pcr.cycle += 1;
    pcr.cycleEndsAt = Date.now() + CYCLE_SECONDS * 1000;
    $("#pcr-cycle-count").textContent = `Ciclo ${pcr.cycle}`;
    $("#pcr-timer-card").classList.remove("cycle-end");
    $("#pcr-timer").classList.remove("ended");
    $("#pcr-timer-sub").textContent = "Compressões contínuas — troque o socorrista a cada ciclo";
  }

  function tick() {
    const now = Date.now();

    // Tempo total
    $("#total-timer").textContent = fmt(Math.floor((now - pcr.startedAt) / 1000));

    // Timer do ciclo
    const remaining = Math.ceil((pcr.cycleEndsAt - now) / 1000);
    const timerEl = $("#pcr-timer");

    if (remaining > 0) {
      timerEl.textContent = fmt(remaining);
      timerEl.classList.toggle("warning", remaining <= 15);
      if (remaining === 15) beep(660, 0.2, 0.5); // pré-aviso: preparar checagem de ritmo
    } else {
      timerEl.textContent = "0:00";
      timerEl.classList.add("ended");
      if (!$("#pcr-timer-card").classList.contains("cycle-end")) {
        $("#pcr-timer-card").classList.add("cycle-end");
        $("#pcr-timer-sub").textContent = "CHECAR RITMO E PULSO — máx. 10 s de pausa";
        showAlert("FIM DO CICLO — CHECAR RITMO");
        alarm();
        logEvent(`Fim do ciclo ${pcr.cycle} — checagem de ritmo`);
        // Próximo ciclo inicia automaticamente após a janela de checagem
        pcr.autoCycleTimeout = setTimeout(() => { if (pcr.running) startCycle(); }, 10000);
      }
    }

    // Timer de adrenalina
    const tile = $("#tile-adrenaline");
    if (pcr.lastAdrenalineAt) {
      const since = Math.floor((now - pcr.lastAdrenalineAt) / 1000);
      $("#adrenaline-timer").textContent = fmt(since);
      tile.classList.toggle("due", since >= ADRENALINE_DUE && since < ADRENALINE_OVERDUE);
      const overdue = since >= ADRENALINE_OVERDUE;
      if (overdue && !tile.classList.contains("overdue")) {
        showAlert("ADRENALINA: janela de 3–5 min vencida");
        alarm();
      }
      tile.classList.toggle("overdue", overdue);
    }
  }

  $("#btn-pcr-start").addEventListener("click", function () {
    if (!pcr.running) {
      pcr.running = true;
      if (!pcr.startedAt) {
        pcr.startedAt = new Date();
        logEvent("Início da RCP");
      }
      startCycle();
      pcr.interval = setInterval(tick, 250);
      this.textContent = "PAUSAR";
      this.classList.add("running");
      $("#pcr-timer-card").classList.add("running");
      setActionsEnabled(true);
      getAudio(); // desbloqueia áudio com o gesto do usuário
      requestWakeLock();
    } else {
      pcr.running = false;
      clearInterval(pcr.interval);
      this.textContent = "RETOMAR";
      this.classList.remove("running");
      logEvent("RCP pausada");
    }
  });

  $("#btn-shock").addEventListener("click", () => {
    pcr.shocks += 1;
    $("#shock-count").textContent = pcr.shocks;
    $("#shock-last").textContent = `último ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    logEvent(`Choque nº ${pcr.shocks} aplicado`);
    startCycle(); // após o choque, RCP recomeça imediatamente
    if (navigator.vibrate) navigator.vibrate(120);
  });

  $("#btn-adrenaline").addEventListener("click", () => {
    pcr.adrenalineDoses += 1;
    pcr.lastAdrenalineAt = Date.now();
    $("#adrenaline-count").textContent = `${pcr.adrenalineDoses} dose${pcr.adrenalineDoses > 1 ? "s" : ""}`;
    $("#tile-adrenaline").classList.remove("due", "overdue");
    logEvent(`Adrenalina 1 mg IV — dose nº ${pcr.adrenalineDoses}`);
    if (navigator.vibrate) navigator.vibrate(120);
  });

  $("#btn-amiodarone").addEventListener("click", () => {
    pcr.amiodaroneDoses += 1;
    const dose = pcr.amiodaroneDoses === 1 ? "300 mg" : "150 mg";
    logEvent(`Amiodarona ${dose} IV — dose nº ${pcr.amiodaroneDoses}`);
    $("#amiodarone-dose").textContent =
      pcr.amiodaroneDoses === 1 ? "2ª dose: 150 mg" : "dose máx. atingida";
    if (pcr.amiodaroneDoses >= 2) $("#btn-amiodarone").disabled = true;
    if (navigator.vibrate) navigator.vibrate(120);
  });

  $("#btn-rosc").addEventListener("click", () => {
    logEvent("RCE — retorno da circulação espontânea");
    pcr.running = false;
    clearInterval(pcr.interval);
    if (metronomeOn) $("#btn-metronome").click();
    $("#btn-pcr-start").textContent = "RETOMAR";
    $("#btn-pcr-start").classList.remove("running");
    $("#pcr-timer-card").classList.remove("cycle-end", "running");
    $("#pcr-timer-sub").textContent = "RCE registrado — seguir para cuidados pós-PCR";
    showAlert("RCE! Abrindo cuidados pós-PCR…", 2500);
    setTimeout(() => navigate("pospcr"), 1200);
  });

  $("#btn-reset-pcr").addEventListener("click", () => {
    if (!confirm("Reiniciar o atendimento? O registro atual será apagado.")) return;
    clearInterval(pcr.interval);
    Object.assign(pcr, {
      running: false, startedAt: null, cycleEndsAt: null, cycle: 0, shocks: 0,
      adrenalineDoses: 0, lastAdrenalineAt: null, amiodaroneDoses: 0, events: [],
    });
    $("#pcr-timer").textContent = "2:00";
    $("#pcr-timer").classList.remove("warning", "ended");
    $("#pcr-timer-card").classList.remove("cycle-end", "running");
    $("#pcr-timer-sub").textContent = "Toque em iniciar ao começar as compressões";
    $("#pcr-cycle-count").textContent = "Ciclo 0";
    $("#adrenaline-timer").textContent = "—";
    $("#adrenaline-count").textContent = "0 doses";
    $("#tile-adrenaline").classList.remove("due", "overdue");
    $("#shock-count").textContent = "0";
    $("#shock-last").textContent = "—";
    $("#amiodarone-dose").textContent = "1ª dose: 300 mg";
    $("#btn-amiodarone").disabled = true;
    $("#btn-pcr-start").textContent = "INICIAR RCP";
    $("#btn-pcr-start").classList.remove("running");
    setActionsEnabled(false);
    renderLog();
  });

  $("#btn-copy-log").addEventListener("click", async () => {
    const text = pcr.events
      .map((e) => `${e.clock} (+${fmt(e.elapsed)}) ${e.text}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text || "Sem eventos.");
      showAlert("Registro copiado", 1500);
    } catch (_) {
      showAlert("Não foi possível copiar", 1500);
    }
  });

  /* ---------------- Abas de ritmo ---------------- */

  function selectRhythm(shockable) {
    $("#tab-shockable").classList.toggle("active", shockable);
    $("#tab-shockable").setAttribute("aria-selected", String(shockable));
    $("#tab-nonshockable").classList.toggle("active", !shockable);
    $("#tab-nonshockable").setAttribute("aria-selected", String(!shockable));
    $("#steps-shockable").classList.toggle("hidden", !shockable);
    $("#steps-nonshockable").classList.toggle("hidden", shockable);
  }
  $("#tab-shockable").addEventListener("click", () => selectRhythm(true));
  $("#tab-nonshockable").addEventListener("click", () => selectRhythm(false));

  /* ---------------- Banner de alerta ---------------- */

  let alertTimeout = null;

  function showAlert(msg, duration = 4000) {
    const el = $("#alert-banner");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => el.classList.add("hidden"), duration);
  }

  /* ---------------- Medicações ---------------- */

  const DRUGS = [
    { name: "Adrenalina (Epinefrina)", ind: "PCR · Bradicardia · Anafilaxia",
      dose: "PCR: 1 mg IV/IO a cada 3–5 min", obs: "Bradicardia: infusão 2–10 mcg/min. Sem dose máxima na PCR." },
    { name: "Amiodarona", ind: "FV/TV sem pulso refratária · TV estável",
      dose: "PCR: 300 mg IV bolus; 2ª dose 150 mg", obs: "TV estável: 150 mg em 10 min, depois 1 mg/min por 6 h." },
    { name: "Lidocaína", ind: "Alternativa à amiodarona na FV/TV",
      dose: "1–1,5 mg/kg IV; repetir 0,5–0,75 mg/kg", obs: "Máx. 3 mg/kg. Manutenção 1–4 mg/min." },
    { name: "Atropina", ind: "Bradicardia sintomática",
      dose: "1 mg IV em bolus a cada 3–5 min", obs: "Dose máxima total: 3 mg. Pouco eficaz em BAVT/Mobitz II." },
    { name: "Adenosina", ind: "TSV regular com QRS estreito",
      dose: "6 mg IV rápido + flush 20 mL; 2ª dose 12 mg", obs: "Avisar o paciente sobre sensação de desconforto transitório." },
    { name: "Sulfato de Magnésio", ind: "Torsades de pointes · hipomagnesemia",
      dose: "1–2 g IV/IO diluídos em 10 mL SG5%", obs: "Em PCR: bolus. Com pulso: infundir em 15 min." },
    { name: "Dopamina", ind: "Bradicardia/hipotensão refratária",
      dose: "Infusão 5–20 mcg/kg/min", obs: "Titular pela resposta. Segunda linha após atropina." },
    { name: "Noradrenalina", ind: "Hipotensão pós-RCE / choque",
      dose: "Infusão 0,1–0,5 mcg/kg/min", obs: "Meta pós-PCR: PAS ≥ 90 / PAM ≥ 65 mmHg." },
    { name: "Bicarbonato de Sódio", ind: "Hipercalemia · acidose grave · intoxicação por tricíclicos",
      dose: "1 mEq/kg IV", obs: "Não usar rotineiramente na PCR." },
    { name: "Cálcio (Gluconato/Cloreto)", ind: "Hipercalemia · hipocalcemia · intoxicação por BCC",
      dose: "Gluconato 10%: 15–30 mL IV · Cloreto 10%: 5–10 mL IV", obs: "Não usar rotineiramente na PCR." },
    { name: "Naloxona", ind: "Suspeita de intoxicação por opioides",
      dose: "0,4–2 mg IV/IM/IN; repetir a cada 2–3 min", obs: "Prioridade é ventilação; PCR segue algoritmo padrão." },
  ];

  function renderDrugs(filter = "") {
    const q = filter.trim().toLowerCase();
    const list = DRUGS.filter(
      (d) => !q || d.name.toLowerCase().includes(q) || d.ind.toLowerCase().includes(q)
    );
    $("#drug-list").innerHTML = list.length
      ? list.map((d) => `
        <div class="drug-card">
          <h3>${d.name}</h3>
          <div class="drug-ind">${d.ind}</div>
          <dl>
            <div><dt>DOSE</dt><dd>${d.dose}</dd></div>
            <div><dt>OBSERVAÇÕES</dt><dd>${d.obs}</dd></div>
          </dl>
        </div>`).join("")
      : '<p class="disclaimer">Nenhuma medicação encontrada.</p>';
  }

  renderDrugs();
  $("#drug-search").addEventListener("input", (e) => renderDrugs(e.target.value));

  /* ---------------- Service worker ---------------- */

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
