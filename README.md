# Irrigação Inteligente · Interface Web

Versão web do aplicativo **APP_IOT** de monitoramento e controle da irrigação com **ESP32** (UEPG).

**Acesse:** https://gabyqueiroz.github.io/app-iot-web/

## Telas
- **Login** por CPF e senha
- **Home**: status do broker MQTT e do módulo ESP32, umidade do solo, estado da bomba, decisão inteligente (solo × chuva), resumo das irrigações e clima de Ponta Grossa
- **Modo**: troca entre Automático e Manual; acionamento manual da bomba (INICIAR/PARAR)
- **Agenda**: histórico dos ciclos de irrigação

## Comunicação com o ESP32
Broker `test.mosquitto.org` (WebSocket seguro, porta 8081), mesmos tópicos do firmware:

| Direção | Tópico | Conteúdo |
|---|---|---|
| ESP32 → Web | `flavio/uepg/irrigacao/umidade` | % de umidade do solo (a cada 3 s) |
| ESP32 → Web | `flavio/uepg/eaic/sensor/status_bomba` | `LIGADA` / `DESLIGADA` |
| ESP32 → Web | `flavio/uepg/eaic/status/decisao` | decisão tomada pelo firmware |
| Web → ESP32 | `flavio/uepg/irrigacao/comando` | `INICIAR` / `PARAR` |
| Web → ESP32 | `flavio/uepg/eaic/comando/modo` | `AUTOMATICO` / `MANUAL` |
| Web → ESP32 | `flavio/uepg/eaic/clima/previsao` | % de chuva prevista (12 h) |

Regras do modo automático: liga com solo < 40% e chuva < 60%; desliga com solo > 60% ou chuva > 70%.

## Clima
Dados atuais e previsão de chuva das próximas 12 h via [Open-Meteo](https://open-meteo.com/) (sem chave de API).

## Rodar localmente
```bash
python -m http.server 8000
```
Abra http://localhost:8000

## Estrutura
```
index.html      telas (splash, login, home, modo, agenda)
css/style.css   visual (mesmas cores do app Android)
js/config.js    broker, tópicos e limites
js/esp32.js     MQTT, estado da irrigação e histórico
js/clima.js     clima e previsão de chuva
js/app.js       navegação e atualização dos cards
```
