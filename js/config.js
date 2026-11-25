// Configuração central — mesmos valores do app Android e do firmware do ESP32
const CONFIG = {
  // Broker MQTT (mesmo do ESP32). No navegador o acesso é via WebSocket seguro.
  BROKER_URL: "wss://test.mosquitto.org:8081/mqtt",

  TOPICS: {
    // ESP32 -> Web
    UMIDADE: "flavio/uepg/irrigacao/umidade",
    STATUS_BOMBA: "flavio/uepg/eaic/sensor/status_bomba",
    DECISAO: "flavio/uepg/eaic/status/decisao",
    // Web -> ESP32
    COMANDO: "flavio/uepg/irrigacao/comando",
    MODO: "flavio/uepg/eaic/comando/modo",
    CLIMA_PREVISAO: "flavio/uepg/eaic/clima/previsao",
  },

  // Limites da função Auto() do firmware
  LIMITE_SOLO_SECO: 40,
  LIMITE_SOLO_UMIDO: 60,
  LIMITE_CHUVA_BAIXA: 60,
  LIMITE_CHUVA_ALTA: 70,
  LIMITE_PROXIMA_CHUVA: 50,
  LIMITE_TRAVA_MANUAL: 80,

  // Ponta Grossa - PR
  CIDADE: "Ponta Grossa",
  LAT: -25.0945,
  LON: -50.1633,

  INTERVALO_LEITURA_MS: 3000, // o ESP32 publica a cada 3 s
};
