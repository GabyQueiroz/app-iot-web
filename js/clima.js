// Clima atual e previsão de chuva (próximas 12 h) para Ponta Grossa
const Clima = (() => {
  const DESCRICOES = {
    0: "Céu limpo", 1: "Predominantemente limpo", 2: "Parcialmente nublado", 3: "Nublado",
    45: "Neblina", 48: "Neblina com geada", 51: "Garoa fraca", 53: "Garoa", 55: "Garoa forte",
    61: "Chuva fraca", 63: "Chuva moderada", 65: "Chuva forte", 66: "Chuva congelante", 67: "Chuva congelante forte",
    71: "Neve fraca", 73: "Neve", 75: "Neve forte", 80: "Pancadas de chuva", 81: "Pancadas moderadas",
    82: "Pancadas fortes", 95: "Trovoadas", 96: "Trovoadas com granizo", 99: "Trovoadas com granizo",
  };

  const URL =
    `https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.LAT}&longitude=${CONFIG.LON}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code` +
    `&hourly=precipitation_probability,precipitation&forecast_hours=12&timezone=America%2FSao_Paulo`;

  async function buscar() {
    const r = await fetch(URL);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    const c = j.current;
    const h = j.hourly;

    const pops = h.precipitation_probability || [];
    const chuva = pops.length ? Math.max(...pops) : 0;
    const mm = (h.precipitation || []).reduce((a, b) => a + (b || 0), 0);
    const idx = pops.findIndex((p) => p >= CONFIG.LIMITE_PROXIMA_CHUVA);

    return {
      atual: {
        cidade: CONFIG.CIDADE,
        descricao: DESCRICOES[c.weather_code] || "--",
        temp: c.temperature_2m,
        umidade: c.relative_humidity_2m,
        sensacao: c.apparent_temperature,
        vento: c.wind_speed_10m,
      },
      previsao: {
        previsaoChuva: chuva,
        chuvaMm: mm,
        proximaChuvaEm: idx >= 0 ? new Date(h.time[idx]).getTime() : null,
        proximaChuvaPop: idx >= 0 ? pops[idx] : null,
      },
    };
  }

  return { buscar };
})();
