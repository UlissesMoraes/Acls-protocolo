# Protocolos ACLS 2025 — versão com melhorias de UX

Cópia do app [`UlissesMoraes/Acls-protocol`](https://github.com/UlissesMoraes/Acls-protocol)
com melhorias de UX aplicadas, publicada em produção via GitHub Pages.

> ⚠️ Ferramenta de apoio baseada nas diretrizes AHA/ACLS 2020–2025. As decisões
> terapêuticas são de responsabilidade exclusiva do médico assistente.

## Melhorias de UX nesta versão

| Melhoria | Por quê |
|---|---|
| ⏱ **Timer de RCP** no protocolo de PCR (ciclos de 2 min, metrônomo 110/min, controle de adrenalina 3–5 min e choques) | Tira a carga cognitiva de cronometrar durante a parada; alarme sonoro + vibração ao fim do ciclo |
| 💓 **Botão flutuante "PCR"** em todas as telas | Em parada, cada segundo de navegação custa caro — acesso em 1 toque |
| ⚖️ **Peso global do paciente** | Digitado uma vez no cabeçalho do protocolo, vale para todas as calculadoras de dose |
| 💾 **Persistência** (checklist + peso em localStorage) | Refresh acidental não perde o progresso do atendimento |
| ◀️ **Gesto/botão voltar do navegador** | Antes saía do site; agora fecha o protocolo (essencial no mobile) |
| 🔗 **Deep-link** (`#pcr`, `#sepse`…) | Recarregar ou compartilhar a URL reabre o protocolo |
| 📖 **Expandir/recolher todas as etapas** | Leitura contínua da cascata sem abrir passo a passo |
| ♿ **Acessibilidade** | `aria-expanded`/`aria-pressed`, alvos de toque maiores, scroll ao topo ao abrir protocolo, tela não apaga durante a RCP (wake lock) |

## Desenvolvimento

```bash
npm install
npm run dev      # desenvolvimento
npm run build    # produção (dist/)
```

O deploy em produção é automático a cada push (GitHub Actions → GitHub Pages).

## Como aplicar no repositório original

As melhorias estão concentradas em `src/App.jsx`. Para levar ao
`Acls-protocol`, basta substituir o conteúdo de `src/App.jsx` lá pelo
arquivo desta versão.
