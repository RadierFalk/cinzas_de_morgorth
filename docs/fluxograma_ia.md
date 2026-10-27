# Fluxogramas — a IA no Cinzas de Morvath

Imagens prontas para slides em `docs/img/`. (Os blocos abaixo são Mermaid: o GitHub desenha sozinho.)

---

## 1. Como a IA entra no jogo

![Como a IA entra no jogo](img/1_ciclo.png)

```mermaid
flowchart LR
    A["🎮 Jogador<br/>luta contra o chefe"] --> B["📋 Jogo gera<br/>o relatório"]
    B --> C["🧠 IA analisa<br/>os hábitos"]
    C --> D["⚙️ IA ajusta<br/>o chefe"]
    D --> A
```

---

## 2. Como o MCP funciona

![Como o MCP funciona](img/2_mcp.png)

```mermaid
flowchart LR
    M["🧠 Modelo<br/><b>decide</b>"] -- "pede ferramenta" --> A["⚙️ app.py<br/><b>executa</b>"]
    A -- "chama" --> S["🛡️ Servidor MCP<br/><b>aplica as regras</b>"]
    S -- "resultado" --> M
```

---

## 3. Os três agentes

![Os três agentes](img/3_agentes.png)

```mermaid
flowchart TD
    IA["🧠 IA (Ollama + MCP)"] --> C["🐂 Chefes<br/>aprendem e mudam a estratégia"]
    IA --> M["💰 Mercador<br/>conversa e dá desconto (até 25%)"]
    IA --> K["⚔️ Cavaleiro Errante<br/>dá conselho antes do chefe"]
```
