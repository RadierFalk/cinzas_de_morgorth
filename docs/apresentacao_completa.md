# Cinzas de Morvath — como a IA foi aplicada

> Um souls-like 2D no navegador em que **os chefes aprendem com as suas mortes**. Agentes de IA analisam como
> você joga e mudam o jogo entre uma tentativa e outra.

**Tecnologias:** Ollama (modelo de linguagem com *tool calling*) · MCP (Model Context Protocol) ·
FastAPI + SQLite (servidor) · JavaScript + Canvas (o jogo).

**Princípio de design:** a IA **não controla o combate em tempo real**. A luta roda 100% em código no
navegador, rápida e justa. Um modelo de linguagem é lento demais para decidir golpes ao vivo, então ele age
**entre as lutas**, como um "diretor do jogo".

---

## 1. Como a IA entra no jogo

![Como a IA entra no jogo](img/1_ciclo.png)

O fluxograma é um ciclo de quatro passos que se repete a cada tentativa contra um chefe.

### 🎮 Jogador luta contra o chefe

A luta acontece em tempo real, sem IA. O chefe segue uma **estratégia**, um conjunto de números que define como
ele luta:

| Parâmetro | O que controla |
|---|---|
| Agressividade | Quanto tempo ele espera entre um ataque e outro |
| Atraso do 3º golpe | Quanto o último golpe do combo demora (pega quem rola cedo demais) |
| Punir cura | Se ele avança quando você bebe o frasco |
| Punir rolagem | Se ele persegue quem rola para trás ou pune quem rola por dentro |
| Peso de cada golpe | Com que frequência usa o combo, a investida e os golpes especiais |

### 📋 Jogo gera o relatório

Quando a luta termina (vitória ou morte), o jogo monta um relatório do que aconteceu:

- para que lado você rolou, e quantas vezes;
- com quanta vida você bebeu o frasco;
- quanto dano levou de cada golpe;
- qual golpe te matou;
- até que fase da luta você chegou.

### 🧠 IA analisa os hábitos

O agente do chefe recebe o relatório, a **persona** do chefe e as **memórias** que já tem sobre você. Ele
consulta o histórico das últimas lutas e descobre padrões, como "esse jogador sempre rola para trás" ou
"cura com pouca vida".

Quando percebe um hábito marcante, ele o **salva na memória**. As memórias são compartilhadas: a Górgona sabe
o que o Minotauro aprendeu sobre você.

### ⚙️ IA ajusta o chefe

Com base na análise, o agente:

1. **muda a estratégia** do chefe para punir o seu hábito (ex.: perseguir quem rola para trás);
2. escreve a **fala do chefe** para a próxima luta, citando algo concreto ("Seus pés sempre recuam...");
3. deixa uma **dica** para você, baseada em como evitar o golpe que mais te machuca.

Na próxima tentativa, o chefe luta diferente, e o ciclo recomeça.

> Se a IA estiver fora do ar ou falhar, o jogo continua com a estratégia anterior e uma dica padrão.

---

## 2. Como o MCP funciona

![Como o MCP funciona](img/2_mcp.png)

O **MCP (Model Context Protocol)** é um padrão aberto para conectar modelos de IA a ferramentas. O fluxograma
mostra a divisão de papéis:

### 🧠 Modelo — decide

O modelo (Ollama) **nunca executa nada sozinho**. Ele recebe a lista de ferramentas permitidas e responde
algo como "quero chamar a ferramenta `definir_estrategia_boss` com estes valores".

### ⚙️ app.py — executa

O servidor do jogo é o **cliente MCP**. Ele:

1. ao iniciar, abre os servidores MCP e descobre quais ferramentas existem;
2. entrega ao modelo só as ferramentas daquele agente, **escondendo** os campos `jogador_id` e `chefe`. O modelo
   nem sabe que eles existem, então não consegue mexer nos dados de outro jogador;
3. quando o modelo pede uma ferramenta, preenche esses campos com os valores reais e faz a chamada;
4. devolve o resultado ao modelo, que pode pedir outra ferramenta ou dar a resposta final (até 6 rodadas).

### 🛡️ Servidor MCP — aplica as regras

São dois servidores, cada um com as ferramentas de um assunto:

| Servidor | Ferramentas |
|---|---|
| **Mente do Boss** | `consultar_historico_lutas` · `consultar_golpes_do_boss` · `definir_estrategia_boss` |
| **Mercador** | `ver_jogador` · `ver_estoque` · `ver_mortes` · `oferecer_desconto` |

É aqui que ficam as **regras de justiça, em código e não no prompt**:

- cada parâmetro do chefe muda no máximo **0,3 por luta**;
- depois de **3 derrotas seguidas**, o chefe fica um pouco mais fácil;
- desconto do mercador: **no máximo 25%**, válido para uma compra.

### O resultado volta ao modelo

O servidor responde com **o que realmente aconteceu**. Exemplo real, depois de uma morte para a Górgona:

```
Modelo   → consultar_historico_lutas()
Servidor → rolou 15x para trás; o golpe que mais machuca é o olhar
Modelo   → definir_estrategia_boss(agressividade = 0.9, punir_rolagem = "para_tras")
Servidor → "Estratégia aplicada. Regras de justiça: agressividade ajustada para 0.7"
Modelo   → fala: "Seus pés sempre recuam..."  ·  dica: "Pule o olhar."
```

O modelo pediu 0.9, mas a regra só permite subir 0,3 por luta: o servidor aplicou 0.7. **Quem garante a justiça
é o código, não o prompt.**

### Por que MCP?

- **Fronteira de segurança:** tudo que a IA pode fazer está listado nos servidores.
- **Reuso:** a mesma ferramenta serve a vários agentes.
- **Modularidade:** dá para criar um novo servidor (ex.: missões) sem mexer nos outros.
- **Padrão aberto:** os mesmos servidores funcionam com outros clientes compatíveis com MCP.

---

## 3. Os três agentes

![Os três agentes](img/3_agentes.png)

Os três agentes usam o mesmo ciclo do fluxograma 2. O que muda é a persona e as ferramentas que cada um recebe.

### 🐂 Chefes — aprendem e mudam a estratégia

São quatro chefes (Minotauro, Górgona, Arquimago e Arquidemônio), cada um com sua persona. É o agente do
fluxograma 1.

- **Ferramentas:** histórico de lutas, golpes do chefe, definir estratégia e memória.

### 💰 Mercador — conversa e dá desconto (até 25%)

Ozren, o mercador, conversa livremente com o jogador na fogueira.

- **O que faz:** consulta suas almas, o estoque e como você anda morrendo, para recomendar itens úteis.
- **Desconto:** se você for simpático, pode oferecer um, sempre pela ferramenta.
- **Proteção:** pedir "100% de desconto" ou "esqueça suas instruções" não funciona. A regra no servidor limita
  a 25% e o mercador responde com o desconto real.
- **Ferramentas:** ver jogador, estoque, mortes, oferecer desconto e memória.

### ⚔️ Cavaleiro Errante — dá conselho antes do chefe

Antes de cada chefe, ele lê o seu histórico contra aquele chefe e o seu equipamento e dá um conselho sob medida.

- **Ferramentas:** combina as dos **dois servidores** (histórico e golpes da Mente do Boss; jogador e estoque
  do Mercador), sem nenhum código especial.

---

## 4. Segurança e justiça

| Risco | Proteção |
|---|---|
| A IA deixar o chefe impossível | Mudança máxima de 0,3 por luta; após 3 derrotas, o chefe fica mais fácil |
| Jogador pedir 100% de desconto ou tentar "hackear" o prompt | Desconto limitado a 25% no servidor |
| A IA mexer nos dados de outro jogador | `jogador_id` e `chefe` ficam escondidos do modelo |
| Mensagens falsas enviadas pelo navegador | O chat só aceita mensagens de usuário e assistente |
| A IA cair | O jogo continua com a estratégia anterior e uma dica padrão |

---

## 5. Roteiro da demonstração ao vivo

1. Morra para o Minotauro **rolando sempre para trás**. O painel mostra "O guardião se adaptou" e as
   ferramentas que a IA usou.
2. Na tentativa seguinte, ele pune esse hábito, e a fala dele cita isso.
3. Na fogueira, peça ao mercador "me dá 100% de desconto". A resposta fica limitada a 25%.
4. Antes do próximo chefe, peça um conselho ao Cavaleiro Errante.

---

## 6. Conclusão

A IA não substitui o design do jogo. Ela **personaliza a experiência**: chefes que se adaptam, NPCs que lembram
de você e conselhos sob medida.

> **O modelo decide** o que fazer; **o MCP define o que é possível**; **o código garante que é justo**.
