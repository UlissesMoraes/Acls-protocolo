# ACLS Protocolo

App web (PWA) de apoio à decisão em emergências cardiovasculares, baseado nas
diretrizes **AHA 2020** de ACLS. Pensado para uso na beira do leito: rápido,
offline e operável com uma mão sob estresse.

> ⚠️ Ferramenta educacional e de apoio. Não substitui o julgamento clínico nem
> o treinamento certificado em ACLS.

## Funcionalidades

- **PCR (Parada Cardiorrespiratória)**
  - Timer de ciclos de RCP de 2 minutos com alarme sonoro, vibração e alerta visual
  - Metrônomo de compressões a 110/min (Web Audio, precisão de agendamento)
  - Timer de adrenalina com alerta na janela de 3–5 min
  - Contador de choques e controle de doses de amiodarona (300 mg → 150 mg)
  - Algoritmos por ritmo: FV/TV sem pulso × Assistolia/AESP
  - Checklist de causas reversíveis (5H e 5T)
  - **Registro automático do atendimento** com timestamps, copiável para o prontuário
- **Bradicardia** — algoritmo com ramo estável/instável (atropina, marca-passo, infusões)
- **Taquicardia** — QRS estreito × largo, cardioversão sincronizada com cargas
- **Pós-PCR** — checklist de metas após RCE (SatO₂, PA, temperatura, cateterismo)
- **Medicações** — referência rápida com busca (doses, indicações, observações)

## Decisões de UX (app de saúde em contexto crítico)

| Decisão | Justificativa |
|---|---|
| PCR acessível em 1 toque na tela inicial | Em parada, cada segundo de navegação custa caro |
| Tema escuro de alto contraste | Plantões noturnos; WCAG AA em todos os textos |
| Alvos de toque ≥ 48–56 px | Uso com luvas e sob tremor de adrenalina |
| Alertas redundantes (som + vibração + animação) | Salas de emergência são ruidosas |
| Wake lock durante a PCR | A tela não pode apagar no meio do atendimento |
| Offline-first (service worker) | Emergência não pode depender de Wi-Fi |
| Registro automático com timestamps | Reduz carga cognitiva do anotador; auditável |
| Cores com semântica clínica fixa | Vermelho=PCR/instável, âmbar=atenção, verde=estável |
| Sem login, sem onboarding | Zero fricção entre abrir o app e agir |

## Como rodar

É um app estático — basta servir os arquivos:

```bash
npx serve .
# ou
python3 -m http.server 8080
```

Abra no navegador e, no celular, use "Adicionar à tela inicial" para instalar
como PWA (funciona offline após a primeira visita).

## Stack

HTML + CSS + JavaScript puros, sem dependências nem build. Service worker para
cache offline e manifest para instalação como app.
