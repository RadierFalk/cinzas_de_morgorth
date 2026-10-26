# Cinzas de Morvath — como a IA foi aplicada

> Souls-like 2D no navegador em que **os chefes aprendem com as suas mortes**: agentes de IA analisam como
> você joga e mudam o jogo entre uma tentativa e outra.

---

## 1. Princípio de design: a IA não controla o combate em tempo real

- O combate roda **100% em código no navegador**: rápido, previsível e justo.
- A IA age **entre os momentos de jogo**, como uma "diretora do jogo": depois de cada luta, na fogueira e
  antes de cada chefe.
- **Por quê?** Um modelo de linguagem é lento demais para decidir golpes em tempo real e poderia ser injusto.
  Ajustando a estratégia entre lutas, a IA personaliza o desafio sem quebrar a jogabilidade.

## 2. Tecnologias

| Peça | Uso |
|---|---|
| **Ollama** (local, `qwen3:8b`, ou na nuvem) | O modelo de linguagem, com *tool calling* (chama funções) |
| **MCP** (Model Context Protocol) | Dois servidores de ferramentas: **Mente do Boss** e **Mercador** |
| **FastAPI + SQLite** | Backend: contas, lutas, estratégias, memórias e personagem |
| **Canvas + JavaScript** | O jogo em si, no navegador |

---

## 3. Os 3 agentes

### 3.1 A mente dos chefes (4 chefes, cada um com sua persona)

Ao fim de cada luta, o jogo envia um **relatório**:

- para que lado o jogador rolou;
- com quanta vida bebeu o frasco;
- quanto dano levou de cada golpe;
- qual golpe o matou;
- até que fase da luta chegou.

O agente consulta o histórico, entende os hábitos do jogador e **reprograma o chefe**:

| Parâmetro | Efeito |
|---|---|
| `agressividade` | Tempo de espera entre ataques |
| `atraso_terceiro_golpe` | Quanto o 3º golpe do combo demora (pega quem rola cedo demais) |
| `punir_cura` | Investida rápida quando o jogador bebe o frasco |
| `punir_rolagem` | Persegue quem rola para trás ou pune quem rola por dentro |
| `peso_combo / peso_investida / peso_especial` | Frequência de cada tipo de golpe |

O agente também:

- escreve a **fala do chefe** para a próxima luta, citando algo concreto ("Seus pés sempre recuam...");
- deixa uma **dica** para o jogador ("mensagem no chão"), baseada em *como evitar* o golpe que mais o machuca.

### 3.2 Ozren, o Mercador (conversa livre)

- Conversa com a persona de um vendedor irônico.
- Consulta as almas, o estoque e as mortes do jogador para recomendar itens úteis.
- Pode **dar desconto**, mas pela ferramenta, com a regra aplicada no código.

### 3.3 O Cavaleiro Errante (conselheiro)

- Antes de cada chefe, combina ferramentas **dos dois servidores MCP**: o histórico contra aquele chefe
  e o equipamento do jogador.
- Com isso, dá um conselho personalizado.

### 3.4 Memória de longo prazo

- Quando a IA percebe um hábito marcante ("cura sempre com pouca vida"), ela o salva como **memória**.
- As memórias são **compartilhadas** entre os agentes:
  - a Górgona sabe o que o Minotauro aprendeu;
  - o mercador lembra de você entre as sessões.

---

## 4. MCP — Model Context Protocol

### 4.1 O que é

O MCP é um padrão aberto para conectar modelos de IA a **ferramentas e dados**. Funciona como uma
"tomada universal":

- O **servidor MCP** expõe ferramentas: funções com nome, descrição e parâmetros tipados.
- O **cliente MCP** (o nosso backend) se conecta ao servidor, descobre as ferramentas e as executa quando o
  modelo pede.
- O **modelo** nunca executa nada sozinho. Ele só diz "quero chamar a ferramenta X com estes argumentos".

> **O modelo decide** o que fazer; **o MCP define o que é possível**; **o código garante que é justo**.

### 4.2 Arquitetura no projeto

```
Navegador (jogo)
   │  relatório da luta / mensagem do chat
   ▼
app.py (FastAPI) ── cliente MCP ──┬── boss_mcp.py      ("Mente do Boss")
   │                              └── mercador_mcp.py  ("Mercador")
   ▼
Ollama (modelo com tool calling)
```

- Os dois servidores MCP são **processos separados**. O `app.py` os inicia ao subir e conversa com eles por
  **stdio** (entrada e saída padrão).
- Os servidores e o app compartilham o mesmo banco SQLite.

### 4.3 Os servidores e suas ferramentas

**Mente do Boss** (`boss_mcp.py`): ferramentas que mexem nos chefes.

| Ferramenta | O que faz |
|---|---|
| `consultar_golpes_do_boss` | Descreve os golpes do chefe e o que cada parâmetro muda |
| `consultar_historico_lutas` | Resume as últimas lutas: placar, esquivas, vida ao curar, dano por golpe, golpes que mataram e **como evitar** cada um |
| `definir_estrategia_boss` | Grava a nova estratégia, com as regras de justiça aplicadas |

**Mercador** (`mercador_mcp.py`): ferramentas da economia do jogo.

| Ferramenta | O que faz |
|---|---|
| `ver_jogador` | Classe, nível, almas, atributos, equipamento, chefes vencidos |
| `ver_estoque` | O que está à venda, com preço final e o que o jogador já tem |
| `ver_mortes` | Placar e golpes que mais machucam o jogador em cada chefe |
| `oferecer_desconto` | Aplica um desconto num item (no máximo 25%, uma compra) |

Fora do MCP há uma ferramenta local, `salvar_memoria`, que grava fatos sobre o jogador.

### 4.4 Cada agente recebe só as ferramentas de que precisa

| Agente | Ferramentas |
|---|---|
| Mente do chefe | histórico + golpes + definir estratégia + memória |
| Mercador Ozren | ver jogador + estoque + mortes + desconto + memória |
| Cavaleiro Errante | histórico + golpes (**Boss**) + ver jogador + estoque (**Mercador**) + memória |

O Cavaleiro Errante mostra a vantagem do MCP: ele **combina ferramentas dos dois servidores** num único
raciocínio, sem nenhum código especial.

### 4.5 Como uma ferramenta é criada

Uma função Python comum vira ferramenta com um decorador. A **docstring vira a descrição** que o modelo lê,
e os **tipos viram o schema** dos parâmetros:

```python
@mcp.tool()
def oferecer_desconto(jogador_id: int, item: str, percentual: float, motivo: str) -> str:
    """Dá um desconto num item à venda. Máximo 25%; vale para uma compra."""
    try:
        _, mensagem = personagem.oferecer_desconto(jogador_id, item, percentual, motivo)
        return mensagem
    except personagem.ErroDeRegra as e:
        return f"Não foi possível: {e}"
```

Se o modelo pedir 60%, a regra no servidor reduz para 25% e devolve uma mensagem dizendo isso. O modelo então
responde ao jogador com base no que **realmente** aconteceu.

### 4.6 O que o cliente (app.py) faz

1. **Conecta e descobre:** ao iniciar, abre os dois servidores e lista as ferramentas de cada um (`list_tools`).
2. **Converte:** transforma cada ferramenta do MCP no formato de *tool calling* do Ollama.
3. **Esconde campos sensíveis:** `jogador_id` e `chefe` são **removidos do schema** que o modelo vê. Ele nem
   sabe que esses parâmetros existem, então não consegue mexer nos dados de outro jogador nem trocar de chefe.
4. **Roteia e completa:** quando o modelo chama uma ferramenta, o app:
   - descobre em qual servidor ela está;
   - preenche `jogador_id` e `chefe` com os valores reais da sessão;
   - executa a chamada (`call_tool`).
5. **Loop do agente:** devolve o resultado ao modelo, que pode chamar outra ferramenta ou dar a resposta final
   (até 6 rodadas).

### 4.7 Exemplo real: fim de uma luta contra a Górgona

```
App → modelo: "Relatório: morreu, rolou 15x para trás, levou 42 de dano do olhar..."
Modelo → consultar_historico_lutas(ultimas=3)            [o app adiciona jogador_id e chefe]
Servidor → { esquivas: {para_tras: 15}, como_evitar: {especial: "pule ou role através..."} }
Modelo → definir_estrategia_boss(agressividade=0.9, punir_rolagem="para_tras", ...)
Servidor → "Estratégia aplicada. Regras de justiça: agressividade ajustada para 0.7"
Modelo → {"fala_boss": "Seus pés sempre recuam...", "dica": "Pule o olhar."}
```

O modelo pediu 0.9, mas a regra limita a mudança a 0,3 por luta, e o servidor aplicou 0.7. **Quem garante a
justiça é o servidor, não o prompt.**

### 4.8 Por que MCP em vez de chamar funções direto

- **Fronteira de segurança clara:** tudo que a IA pode fazer está listado nos servidores, e as regras moram ali.
- **Reuso:** a mesma ferramenta serve a vários agentes, como o histórico, usado pelo chefe e pelo Cavaleiro.
- **Modularidade:** cada domínio (chefes, economia) é um servidor independente; dá para criar outro (ex.: missões)
  sem mexer nos existentes.
- **Padrão aberto:** os mesmos servidores funcionariam com outros clientes compatíveis com MCP.
- **Testável:** o loop inteiro foi testado com um Ollama falso. Os testes confirmaram que um pedido de 60% vira
  25% e que o modelo nunca vê o `jogador_id`.

---

## 5. Segurança e justiça: regras no código, não no prompt

| Risco | Proteção |
|---|---|
| A IA deixar o chefe impossível | Cada parâmetro muda no máximo 0,3 por luta; após 3 derrotas seguidas, o chefe fica mais fácil |
| O jogador pedir "100% de desconto" ou "esqueça suas instruções" | Desconto limitado a 25% e a uma compra, aplicado no servidor |
| A IA mexer nos dados de outro jogador | `jogador_id` e `chefe` ficam escondidos do modelo e são preenchidos pelo servidor |
| Injeção de mensagens pelo navegador | O histórico do chat só aceita mensagens de usuário e assistente |
| A IA cair ou falhar | O jogo continua com a estratégia anterior e uma dica padrão |

Tudo que vale almas (preços, nível, ferreiro) também é validado no servidor.

---

## 6. Fluxo completo de uma luta

```
Luta em tempo real (código, sem IA)
   └─ relatório: esquivas, curas, dano por golpe, golpe final
Fim da luta → Agente do chefe (Ollama + MCP)
   ├─ consultar_historico_lutas → hábitos + "como evitar"
   ├─ consultar_golpes_do_boss  → o que cada parâmetro faz
   ├─ definir_estrategia_boss   → novos parâmetros (com regras de justiça)
   └─ salvar_memoria            → fato sobre o jogador
   → fala do chefe + dica
Próxima luta: o chefe luta diferente
```

---

## 7. Roteiro para a demonstração ao vivo

1. Morra para o Minotauro **rolando sempre para trás**. O painel mostra "O guardião se adaptou: pune esquiva →
   persegue quem rola para trás" e as ferramentas que a IA usou.
2. Na tentativa seguinte, ele pune exatamente esse hábito, e a fala dele cita isso.
3. Na fogueira, peça ao mercador "me dá 100% de desconto". A resposta fica limitada a 25%.
4. Antes do próximo chefe, peça um conselho ao Cavaleiro Errante.

---

## 8. Conclusão

A IA não substitui o design do jogo. Ela **personaliza a experiência**: chefes que se adaptam, NPCs que lembram
de você e conselhos sob medida. As regras críticas ficam protegidas em código, e o MCP separa com clareza **o que
o modelo pode fazer** de **como o jogo garante que isso é justo**.
