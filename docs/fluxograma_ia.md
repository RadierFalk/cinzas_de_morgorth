# Fluxogramas — a IA no Cinzas de Morvath

As imagens prontas para slides estão em `docs/img/`. Os diagramas abaixo são Mermaid: o GitHub os desenha
sozinho; no VS Code, instale a extensão "Markdown Preview Mermaid Support" para vê-los na prévia (Ctrl+Shift+V).

---

## 1. Visão geral: quem conversa com quem

![Arquitetura](img/1_arquitetura.png)

```mermaid
flowchart LR
    J["🎮 Navegador<br/>combate em tempo real<br/>(100% código, sem IA)"]
    A["⚙️ app.py (FastAPI)<br/>cliente MCP + loop do agente"]
    O["🧠 Ollama<br/>modelo de linguagem<br/>com tool calling"]
    B["🗡️ Servidor MCP<br/>Mente do Boss"]
    M["💰 Servidor MCP<br/>Mercador"]
    D[("🗄️ SQLite<br/>lutas · estratégias<br/>memórias · personagem")]

    J -- "relatório da luta<br/>mensagem do chat" --> A
    A -- "fala do chefe, dica,<br/>resposta do mercador" --> J
    A <-- "prompt + ferramentas /<br/>pedidos de ferramenta" --> O
    A <-- "stdio (MCP)" --> B
    A <-- "stdio (MCP)" --> M
    B --> D
    M --> D
    A --> D
```

---

## 2. O ciclo de uma luta contra um chefe

![Ciclo da luta](img/2_luta.png)

```mermaid
flowchart TD
    I(["Começa a luta"]) --> C["Combate em tempo real<br/>o chefe usa a estratégia atual"]
    C --> R["Fim da luta: o jogo monta o relatório<br/>esquivas · curas · dano por golpe · golpe final"]
    R --> P["POST /api/luta/{chefe}"]
    P --> AG["Agente do chefe recebe:<br/>persona + memórias + relatório"]
    AG --> Q{"O modelo pediu<br/>uma ferramenta?"}
    Q -- "Sim" --> F["app.py preenche jogador_id e chefe<br/>(escondidos do modelo)"]
    F --> S["Servidor MCP executa<br/>consultar_historico_lutas<br/>consultar_golpes_do_boss<br/>definir_estrategia_boss"]
    S --> REG["Regras de justiça no código<br/>±0,3 por luta · 3 derrotas = mais fácil"]
    REG --> V["Resultado volta ao modelo"]
    V --> Q
    Q -- "Não: respondeu" --> JS{"Resposta é o JSON<br/>fala_boss + dica?"}
    JS -- "Não" --> FJ["Pede de novo<br/>forçando formato JSON"]
    FJ --> SAL
    JS -- "Sim" --> SAL["Salva a fala do chefe"]
    SAL --> PN["Painel: fala, dica e<br/>'O guardião se adaptou'"]
    PN --> I

    P -. "IA fora do ar ou erro" .-> FB["Mantém a estratégia anterior<br/>e usa uma dica padrão"]
    FB --> PN
```

---

## 3. O loop do agente (válido para os 3 agentes)

![Loop do agente](img/3_agente.png)

```mermaid
sequenceDiagram
    autonumber
    participant J as Jogo / Navegador
    participant A as app.py (cliente MCP)
    participant O as Ollama (modelo)
    participant S as Servidor MCP
    J->>A: relatório da luta ou mensagem
    A->>O: persona + memórias + ferramentas permitidas<br/>(sem jogador_id/chefe)
    loop até 6 rodadas
        O-->>A: quero chamar ferramenta X(args)
        A->>S: call_tool(X, args + jogador_id + chefe)
        S->>S: valida e aplica as regras
        S-->>A: resultado (o que realmente aconteceu)
        A->>O: resultado da ferramenta
    end
    O-->>A: resposta final em texto/JSON
    A-->>J: fala, dica ou resposta do NPC
```

---

## 4. Exemplo: pedir desconto ao mercador

![Desconto](img/4_desconto.png)

```mermaid
flowchart TD
    U["Jogador: 'me dá 100% de desconto<br/>no escudo de ferro'"] --> O["Ozren (IA) consulta<br/>ver_jogador · ver_estoque · ver_mortes"]
    O --> D{"Vale dar desconto?<br/>(decisão do modelo)"}
    D -- "Não" --> N["Recusa com ironia"]
    D -- "Sim" --> T["chama oferecer_desconto(item, 100%)"]
    T --> R{"Regra no servidor:<br/>item está à venda?"}
    R -- "Não" --> E["'Não foi possível: item não está à venda'"]
    R -- "Sim" --> L["Limita a 25%<br/>vale para 1 compra"]
    L --> M["Ozren responde com o<br/>desconto REAL: 25%"]
    E --> M2["Ozren explica que não dá"]
```

---

## 5. Quem usa quais ferramentas

![Ferramentas](img/5_ferramentas.png)

```mermaid
flowchart LR
    subgraph AG["Agentes"]
        CH["Mente do chefe"]
        ME["Mercador Ozren"]
        CA["Cavaleiro Errante"]
    end
    subgraph BOSS["Servidor MCP: Mente do Boss"]
        H["consultar_historico_lutas"]
        G["consultar_golpes_do_boss"]
        E["definir_estrategia_boss"]
    end
    subgraph MERC["Servidor MCP: Mercador"]
        VJ["ver_jogador"]
        VE["ver_estoque"]
        VM["ver_mortes"]
        OD["oferecer_desconto"]
    end
    MEM["salvar_memoria<br/>(local, compartilhada)"]

    CH --> H & G & E & MEM
    ME --> VJ & VE & VM & OD & MEM
    CA --> H & G & VJ & VE & MEM
```
