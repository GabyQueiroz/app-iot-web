// Interface: telas, navegação e ligação dos dados com os cards
(() => {
  const $ = (id) => document.getElementById(id);
  const fmtHora = (t) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const fmtDataHora = (t) => {
    const d = new Date(t);
    return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${fmtHora(t)}`;
  };
  const fmtDur = (s) => { s = Math.round(s); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; };
  const num = (v, d = 1) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

  // ---------------- Toast ----------------
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2500);
  }

  // ---------------- Telas ----------------
  function mostrarTela(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  }

  const TITULOS = {
    home: ["Monitoramento IoT", "Ponta Grossa · PR"],
    modo: ["Modo", "Modo de Operação"],
    agenda: ["Agenda", "Histórico de irrigação"],
  };

  function rota() {
    const r = (location.hash || "#home").slice(1);
    const view = TITULOS[r] ? r : "home";
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.nav === view));
    $("pageTitle").textContent = TITULOS[view][0];
    $("pageSub").textContent = TITULOS[view][1];
    if (view === "agenda") renderHistorico();
    if (view === "modo") renderModo();
    window.scrollTo(0, 0);
  }

  // ---------------- Login ----------------
  $("cpf").addEventListener("input", (e) => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 11);
    v = v.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    e.target.value = v;
  });

  $("formLogin").addEventListener("submit", (e) => {
    e.preventDefault();
    const cpf = $("cpf").value.replace(/\D/g, "");
    const senha = $("senha").value;
    if (!cpf || !senha) return toast("Preencha todos os campos");
    if (cpf.length !== 11) return toast("CPF ou senha incorretos");
    sessionStorage.setItem("iot_sessao", "1");
    toast("Bem-vindo(a)!");
    entrarNoApp();
  });

  $("btnSair").addEventListener("click", () => {
    sessionStorage.removeItem("iot_sessao");
    $("senha").value = "";
    mostrarTela("login");
  });

  let appIniciado = false;
  function entrarNoApp() {
    mostrarTela("app");
    if (!location.hash) location.hash = "#home";
    rota();
    if (appIniciado) return;
    appIniciado = true;
    ESP32.iniciarTudo();
    ESP32.observar(atualizarUI);
    carregarClima();
    setInterval(carregarClima, 30 * 60 * 1000);
  }

  // ---------------- Clima ----------------
  async function carregarClima() {
    try {
      const { atual, previsao } = await Clima.buscar();
      setStatus($("tvApiStatus"), true, "🟢 Conectado", "");
      $("tvCidadeTempo").textContent = `${atual.cidade}: ${atual.descricao}`;
      $("tvTemp").textContent = `${num(atual.temp)} °C`;
      $("tvUmidadeAr").textContent = `${atual.umidade} %`;
      $("tvSensacao").textContent = `${num(atual.sensacao)} °C`;
      $("tvVento").textContent = `${num(atual.vento)} km/h`;
      $("tvUV").textContent = atual.descricao;
      ESP32.definirPrevisao(previsao);
    } catch (err) {
      console.error("Clima:", err);
      setStatus($("tvApiStatus"), false, "", "🔴 Falha na Conexão");
    }
  }

  function setStatus(el, ok, txtOk, txtErr) {
    el.classList.remove("ok", "err", "warn");
    if (ok === null) { el.classList.add("warn"); return; }
    el.classList.add(ok ? "ok" : "err");
    el.textContent = ok ? txtOk : txtErr;
  }

  // ---------------- Atualização dos cards ----------------
  function atualizarUI(e) {
    const modo = ESP32.modo();
    const isAuto = modo === "AUTOMATICO";

    // Conexões
    if (e.brokerConectado !== null) setStatus($("tvBrokerStatus"), e.brokerConectado, "🟢 Conectado", "🔴 Desconectado");
    setStatus($("tvFirmwareStatus"), e.esp32Online, "🟢 Conectado", "🔴 Sem sinal");

    // Modo
    $("tvModoOperacaoCard").textContent = isAuto ? "Modo: Automático" : "Modo: Manual";
    const badge = $("tvBadgeModo");
    badge.textContent = isAuto ? "AUTOMÁTICO" : "MANUAL";
    badge.className = "badge " + (isAuto ? "auto" : "manual");

    // Umidade
    if (e.umidade != null) {
      const u = e.umidade;
      $("tvUmidadeSolo").textContent = `${u} %`;
      $("gaugeArc").style.strokeDashoffset = 314.16 * (1 - Math.min(u, 100) / 100);
      $("tvFaixaSolo").textContent =
        u < CONFIG.LIMITE_SOLO_SECO ? "Solo seco (< 40%)" :
        u > CONFIG.LIMITE_SOLO_UMIDO ? "Solo úmido (> 60%)" : "Faixa ideal (40% a 60%)";
      $("tvLeitura").textContent = `Última leitura: ${new Date(e.ultimaLeitura).toLocaleTimeString("pt-BR")}`;
    }

    // Bomba
    const pill = $("tvStatusBomba");
    pill.textContent = e.bombaLigada ? "💧 Irrigando" : e.bombaLigada === false ? "Desligada" : "Em espera";
    pill.classList.toggle("on", !!e.bombaLigada);

    // Decisão
    $("tvDecisaoEsp32").textContent = e.decisao || "Aguardando decisão do ESP32...";
    $("tvRecomendacaoAuto").textContent = ESP32.recomendacao();

    // Chuva
    if (e.previsaoChuva != null) {
      const c = e.previsaoChuva;
      $("tvPrevisaoChuvaCard").textContent = `${c} %`;
      $("tvRegraChuvaCard").textContent =
        c > CONFIG.LIMITE_CHUVA_ALTA ? "Bloqueia irrigação (> 70%)" :
        c < CONFIG.LIMITE_CHUVA_BAIXA ? "Libera irrigação (< 60%)" : "Faixa neutra (60% a 70%)";
      $("tvProximaChuvaCard").textContent =
        e.proximaChuvaEm ? `~${fmtHora(e.proximaChuvaEm)} (${e.proximaChuvaPop}%)` : "Tempo firme (12h)";
    }
    if (e.chuvaMm != null) $("tvVolumeChuvaCard").textContent = `Volume: ${num(e.chuvaMm)} mm`;

    // Modo (tela)
    $("tvAutoUmidade").textContent = e.umidade != null ? `${e.umidade} %` : "-- %";
    $("tvAutoChuva").textContent = e.previsaoChuva != null ? `${e.previsaoChuva} %` : "-- %";
    $("tvAutoDecisao").textContent = e.decisao || "Aguardando dados...";
    const ab = $("tvAutoBomba");
    ab.textContent = e.bombaLigada ? "LIGADA" : "DESLIGADA";
    ab.style.color = e.bombaLigada ? "#2E7D32" : "#C62828";
    $("btnIniciar").disabled = !!e.bombaLigada;
    $("btnIniciar").textContent = e.bombaLigada ? "IRRIGANDO..." : "INICIAR";
    $("btnParar").classList.toggle("hidden", !e.bombaLigada);

    renderResumoHistorico();
    renderGrafico(e.serie);
    if ($("view-agenda").classList.contains("active")) renderHistorico();
  }

  // ---------------- Gráfico ----------------
  function renderGrafico(serie) {
    const svg = $("chartUmidade");
    if (!serie || serie.length < 2) return;
    const W = 320, H = 120, min = 30, max = 80;
    const x = (i) => (i / (serie.length - 1)) * W;
    const y = (v) => H - ((v - min) / (max - min)) * H;
    const pts = serie.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const faixa = `<rect x="0" y="${y(60)}" width="${W}" height="${y(40) - y(60)}" fill="#E0F7FA"/>`;
    const linhas = [40, 60].map((v) =>
      `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#B2EBF2" stroke-dasharray="4 4"/>` +
      `<text x="4" y="${y(v) - 3}" font-size="9" fill="#9CA3AF">${v}%</text>`).join("");
    const area = `<polygon points="0,${H} ${pts} ${W},${H}" fill="rgba(22,138,152,.12)"/>`;
    const linha = `<polyline points="${pts}" fill="none" stroke="#168A98" stroke-width="2.5" stroke-linejoin="round"/>`;
    const ult = serie[serie.length - 1];
    const ponto = `<circle cx="${W - 3}" cy="${y(ult.v)}" r="4" fill="#168A98"/>`;
    svg.innerHTML = faixa + linhas + area + linha + ponto;
  }

  // ---------------- Histórico ----------------
  function renderResumoHistorico() {
    const h = ESP32.historico();
    const ult = h[0];
    if (ult) {
      $("tvUltimaIrrigacaoCard").textContent = fmtDataHora(ult.dataHora);
      $("tvUltimaDuracaoCard").textContent = `Duração: ${fmtDur(ult.duracao)} • Solo: ${ult.umidadeInicial}%`;
    }
    const ini = new Date(); ini.setHours(0, 0, 0, 0);
    const hoje = h.filter((r) => r.dataHora >= ini.getTime());
    $("tvCiclosHojeCard").textContent = hoje.length === 1 ? "1 ciclo" : `${hoje.length} ciclos`;
    $("tvTempoHojeCard").textContent = `Tempo total: ${fmtDur(hoje.reduce((a, r) => a + r.duracao, 0))}`;
  }

  function renderHistorico() {
    const h = ESP32.historico();
    const lista = $("listaHistorico");
    if (!h.length) { lista.innerHTML = `<p class="empty">Sem registros</p>`; return; }
    lista.innerHTML = h.map((r) => {
      const d = new Date(r.dataHora);
      const data = `${d.toLocaleDateString("pt-BR")} ${fmtHora(r.dataHora)}`;
      const man = r.modo === "MANUAL";
      return `<div class="hist">
        <span class="hist-ico">💧</span>
        <div class="hist-body">
          <span class="hist-data">${data}</span>
          <span class="hist-meta">Umidade Inicial: ${r.umidadeInicial}% · Tempo: ${num(r.duracao)}s</span>
        </div>
        <span class="hist-tag ${man ? "manual" : ""}">${man ? "MANUAL" : "AUTO"}</span>
      </div>`;
    }).join("");
  }

  // ---------------- Modo ----------------
  function renderModo() {
    const isManual = ESP32.modo() === "MANUAL";
    document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.modo === ESP32.modo()));
    $("layoutManualControls").classList.toggle("hidden", !isManual);
    $("layoutAutoControls").classList.toggle("hidden", isManual);
  }

  document.querySelectorAll(".seg-btn").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.modo === ESP32.modo()) return;
      if (ESP32.estado.bombaLigada) ESP32.parar();
      ESP32.definirModo(b.dataset.modo);
      renderModo();
      toast(`Modo ${b.dataset.modo} enviado ao ESP32`);
    }));

  let tempoManual = 10;
  const setTempo = (v) => { tempoManual = Math.max(5, Math.min(120, v)); $("tvTempoManual").textContent = tempoManual; };
  $("btnMenos").addEventListener("click", () => setTempo(tempoManual - 5));
  $("btnMais").addEventListener("click", () => setTempo(tempoManual + 5));

  $("btnIniciar").addEventListener("click", () => {
    if (ESP32.iniciar(tempoManual)) toast("Irrigação iniciada. Aguardando sinal do ESP32...");
  });
  $("btnParar").addEventListener("click", () => { ESP32.parar(); toast("Comando PARAR enviado"); });

  // ---------------- Início ----------------
  window.addEventListener("hashchange", rota);
  setTimeout(() => {
    if (sessionStorage.getItem("iot_sessao")) entrarNoApp();
    else mostrarTela("login");
  }, 1800);
})();
