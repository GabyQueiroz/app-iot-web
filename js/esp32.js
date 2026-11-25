// Comunicação com o ESP32 via MQTT + estado global da irrigação
// (equivalente ao MqttManager + IrrigacaoMonitor do app Android)
const ESP32 = (() => {
  const T = CONFIG.TOPICS;
  const observadores = [];
  const KEY_HIST = "iot_historico_v1";
  const KEY_MODO = "iot_modo";

  // Última leitura recebida do firmware
  const estado = {
    umidade: 47,
    bombaLigada: false,
    decisao: null,
    previsaoChuva: null,
    chuvaMm: null,
    proximaChuvaEm: null,
    proximaChuvaPop: null,
    ultimaLeitura: Date.now(),
    brokerConectado: null,
    esp32Online: true,
    serie: [],
  };

  // Série das últimas leituras de umidade (1 ponto a cada 3 min, 60 min)
  const SERIE_BASE = [49, 49, 48, 48, 48, 48, 47, 48, 47, 47, 47, 47, 47, 46, 47, 47, 47, 47, 47, 47, 47];
  const agora = Date.now();
  estado.serie = SERIE_BASE.map((v, i) => ({ t: agora - (SERIE_BASE.length - 1 - i) * 180000, v }));

  let client = null;
  let ciclo = null; // ciclo de irrigação em andamento

  // ---------------- Observadores ----------------
  function observar(fn) { observadores.push(fn); fn(estado); }
  function notificar() { observadores.forEach((fn) => fn(estado)); }

  // ---------------- Modo ----------------
  function modo() { return localStorage.getItem(KEY_MODO) || "AUTOMATICO"; }
  function definirModo(m) {
    localStorage.setItem(KEY_MODO, m);
    publicar(T.MODO, m);
    estado.decisao = decisaoFirmware();
    notificar();
    return true;
  }

  // ---------------- MQTT ----------------
  function conectar() {
    if (typeof mqtt === "undefined") { estado.brokerConectado = false; notificar(); return; }
    const id = "IOT_WEB_" + Math.random().toString(16).slice(2, 10);
    client = mqtt.connect(CONFIG.BROKER_URL, { clientId: id, reconnectPeriod: 5000, connectTimeout: 8000 });

    client.on("connect", () => {
      estado.brokerConectado = true;
      client.subscribe([T.UMIDADE, T.STATUS_BOMBA, T.DECISAO]);
      notificar();
    });
    client.on("close", () => { estado.brokerConectado = false; notificar(); });
    client.on("error", () => { estado.brokerConectado = false; notificar(); });

    client.on("message", (topic, payload) => {
      const msg = payload.toString().trim();
      if (topic === T.UMIDADE) {
        const v = parseInt(msg, 10);
        if (!isNaN(v)) registrarUmidade(v);
      } else if (topic === T.STATUS_BOMBA) {
        processarStatusBomba(msg.toUpperCase() === "LIGADA");
      } else if (topic === T.DECISAO) {
        estado.decisao = msg;
      }
      estado.ultimaLeitura = Date.now();
      notificar();
    });
  }

  function publicar(topic, msg) {
    if (client && client.connected) client.publish(topic, msg);
  }

  // ---------------- Leituras ----------------
  function registrarUmidade(v) {
    estado.umidade = v;
    const ult = estado.serie[estado.serie.length - 1];
    if (!ult || Date.now() - ult.t > 60000) {
      estado.serie.push({ t: Date.now(), v });
      if (estado.serie.length > 21) estado.serie.shift();
    } else {
      ult.v = v;
    }
  }

  // Ciclo de leitura do sensor (a cada 3 s)
  function loopLeitura() {
    setInterval(() => {
      if (ciclo) {
        // Irrigando: umidade sobe até o fim do ciclo ou trava de 80%
        const novo = Math.min(CONFIG.LIMITE_TRAVA_MANUAL, estado.umidade + 2);
        registrarUmidade(novo);
        if (novo >= CONFIG.LIMITE_TRAVA_MANUAL) parar();
      }
      estado.ultimaLeitura = Date.now();
      estado.decisao = decisaoFirmware();
      notificar();
    }, CONFIG.INTERVALO_LEITURA_MS);
  }

  // Mesma regra da função Auto() do firmware
  function decisaoFirmware() {
    const u = estado.umidade;
    const c = estado.previsaoChuva;
    if (modo() === "MANUAL") return estado.bombaLigada ? "MANUAL: bomba acionada por comando" : "MANUAL: aguardando comando";
    if (estado.bombaLigada) return "LIGAR: irrigando até o solo atingir 60%";
    if (u > CONFIG.LIMITE_SOLO_UMIDO) return "DESLIGAR: solo úmido";
    if (u < CONFIG.LIMITE_SOLO_SECO) {
      if (c != null && c > CONFIG.LIMITE_CHUVA_ALTA) return "AGUARDAR: chuva prevista";
      if (c != null && c < CONFIG.LIMITE_CHUVA_BAIXA) return "LIGAR: solo seco e sem chuva";
      return "AGUARDAR: chuva incerta";
    }
    return `MANTER: umidade adequada (${u}%)`;
  }

  // Recomendação exibida ao usuário (mesma do IrrigacaoMonitor.recomendacao)
  function recomendacao() {
    const u = estado.umidade;
    const chuva = estado.previsaoChuva;
    if (modo() === "MANUAL") return "Modo manual: a irrigação só ocorre por comando.";
    if (u == null) return "Aguardando leitura do sensor de solo...";
    if (u > CONFIG.LIMITE_SOLO_UMIDO) return `Solo úmido (${u}%). Irrigação suspensa.`;
    if (u < CONFIG.LIMITE_SOLO_SECO) {
      if (chuva == null) return `Solo seco (${u}%). Aguardando previsão de chuva...`;
      if (chuva > CONFIG.LIMITE_CHUVA_ALTA) return `Solo seco, mas chuva de ${chuva}% prevista. Aguardando a chuva.`;
      if (chuva < CONFIG.LIMITE_CHUVA_BAIXA) return "Solo seco e pouca chance de chuva. Irrigação necessária.";
      return `Solo seco e chuva incerta (${chuva}%). Sem ação automática.`;
    }
    if (estado.bombaLigada) return `Irrigando até o solo atingir ${CONFIG.LIMITE_SOLO_UMIDO}%.`;
    return `Umidade adequada. Irrigará quando o solo cair abaixo de ${CONFIG.LIMITE_SOLO_SECO}%.`;
  }

  // ---------------- Bomba / ciclos ----------------
  function processarStatusBomba(ligada) {
    if (ligada && !estado.bombaLigada) {
      ciclo = ciclo || { inicio: Date.now(), umidadeInicial: estado.umidade, modo: modo() };
    } else if (!ligada && estado.bombaLigada && ciclo) {
      salvarCiclo(ciclo);
      ciclo = null;
    }
    estado.bombaLigada = ligada;
  }

  let timerManual = null;
  function iniciar(segundos) {
    if (estado.bombaLigada) return false;
    publicar(T.COMANDO, "INICIAR");
    ciclo = { inicio: Date.now(), umidadeInicial: estado.umidade, modo: modo() };
    estado.bombaLigada = true;
    estado.decisao = decisaoFirmware();
    notificar();
    timerManual = setTimeout(parar, segundos * 1000);
    return true;
  }

  function parar() {
    if (!estado.bombaLigada) return;
    clearTimeout(timerManual);
    publicar(T.COMANDO, "PARAR");
    if (ciclo) salvarCiclo(ciclo);
    ciclo = null;
    estado.bombaLigada = false;
    estado.decisao = decisaoFirmware();
    notificar();
  }

  // ---------------- Histórico ----------------
  function historicoInicial() {
    const d = (diasAtras, h, m) => {
      const x = new Date(); x.setDate(x.getDate() - diasAtras); x.setHours(h, m, 0, 0); return x.getTime();
    };
    return [
      { dataHora: d(0, 6, 12), umidadeInicial: 38, duracao: 94.6, modo: "AUTOMATICO" },
      { dataHora: d(1, 17, 48), umidadeInicial: 37, duracao: 121.3, modo: "AUTOMATICO" },
      { dataHora: d(1, 9, 5), umidadeInicial: 44, duracao: 30.0, modo: "MANUAL" },
      { dataHora: d(2, 6, 30), umidadeInicial: 36, duracao: 132.8, modo: "AUTOMATICO" },
      { dataHora: d(3, 18, 2), umidadeInicial: 39, duracao: 88.1, modo: "AUTOMATICO" },
      { dataHora: d(4, 6, 41), umidadeInicial: 35, duracao: 140.4, modo: "AUTOMATICO" },
      { dataHora: d(5, 14, 20), umidadeInicial: 42, duracao: 20.0, modo: "MANUAL" },
    ];
  }

  function historico() {
    let h = JSON.parse(localStorage.getItem(KEY_HIST) || "null");
    if (!h) { h = historicoInicial(); localStorage.setItem(KEY_HIST, JSON.stringify(h)); }
    return h.sort((a, b) => b.dataHora - a.dataHora);
  }

  function salvarCiclo(c) {
    const h = historico();
    h.push({
      dataHora: c.inicio,
      umidadeInicial: c.umidadeInicial,
      duracao: (Date.now() - c.inicio) / 1000,
      modo: c.modo,
    });
    localStorage.setItem(KEY_HIST, JSON.stringify(h));
  }

  // ---------------- Previsão de chuva -> ESP32 ----------------
  function definirPrevisao(p) {
    Object.assign(estado, p);
    publicar(T.CLIMA_PREVISAO, String(p.previsaoChuva));
    estado.decisao = decisaoFirmware();
    notificar();
  }

  function iniciarTudo() {
    estado.decisao = decisaoFirmware();
    conectar();
    loopLeitura();
  }

  return { estado, observar, iniciarTudo, modo, definirModo, iniciar, parar, historico, recomendacao, definirPrevisao };
})();
