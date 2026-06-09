(function (global) {
  const COMPLEX_GUIDES = [
    {
      id: "comparacao_inaturalist_specieslink",
      match: /\b(diferenca|compare|comparar)\b.*\b(inaturalist)\b.*\b(specieslink)\b|\b(diferenca|compare|comparar)\b.*\b(specieslink)\b.*\b(inaturalist)\b/,
      title: "Comparacao entre iNaturalist e speciesLink",
      answer: [
        "iNaturalist e speciesLink documentam biodiversidade de formas diferentes e complementares.",
        "O iNaturalist concentra observacoes de ciencia cidada, geralmente com data, foto, localidade e identificacao comunitaria. Ele e util para registros recentes e evidencia visual, mas observacao nao equivale a voucher nem a inventario completo.",
        "O speciesLink integra dados de colecoes e outras bases biologicas. Ele e especialmente util para material preservado, vouchers e historico de coleta, mas pode conter nomes antigos, localidades amplas, coordenadas imprecisas ou registros que exigem revisao.",
        "Ao combinar as fontes, mantenha separadas observacao, voucher, data, qualidade espacial e status taxonomico. Ausencia em qualquer uma delas nao prova ausencia da especie na natureza.",
      ],
    },
    {
      id: "inventario_anuros_guia",
      match: /\b(inventario|levantamento|metodologia|metodologias|comecar|começar)\b.*\b(anuro|anuros|anfibio|anfibios|sapo|sapos|ra|ras|perereca|pererecas)\b|\b(anuro|anuros|anfibio|anfibios|sapo|sapos|ra|ras|perereca|pererecas)\b.*\b(inventario|levantamento|metodologia|metodologias|comecar|começar)\b/,
      title: "Guia inicial para inventario de anuros",
      answer: [
        "Para comecar um inventario de anuros, pense como um pequeno projeto cientifico: defina a area, o objetivo, o periodo de amostragem e quais evidencias voce vai registrar. Anuros incluem sapos, ras e pererecas; muitos sao mais detectaveis a noite, em noites umidas ou chuvosas, perto de brejos, poças, riachos e bordas de mata.",
        "Metodologias principais: busca ativa visual e auditiva em trilhas, margens de agua, serrapilheira e vegetacao; procura visual limitada por tempo, registrando horas-observador; gravacao acustica para especies que vocalizam; encontros ocasionais como complemento; e, em projetos licenciados, armadilhas de interceptacao e queda. Para anuros, tambem pode ser util registrar girinos, desovas e cantos, mas sempre com cuidado na identificacao.",
        "Um roteiro funcional seria: 1. escolher pontos de amostragem representativos; 2. repetir visitas em periodos chuvosos e secos; 3. padronizar horario, duracao e numero de observadores; 4. fotografar dorso, lateral, ventre quando possivel e sem manipular desnecessariamente; 5. registrar data, horario, clima, micro-habitat, coordenada e metodo; 6. separar observacao, foto, audio e voucher quando houver licenca; 7. revisar identificacoes com literatura, especialistas ou colecao cientifica.",
        "Cuidados importantes: nao chame uma lista de iNaturalist ou speciesLink de inventario completo. Essas bases ajudam a planejar e comparar lacunas, mas inventario exige esforco amostral documentado. Coleta, captura, marcacao, transporte ou voucher exigem autorizacao, etica e equipe treinada. No Vale Historico da Mantiqueira, comece conectando municipios, altitude, chuva, riachos, fragmentos florestais e acessibilidade.",
        "Aplicacao em herpetologia: transformar observacoes em dados comparaveis, com metodo, esforco, evidencia e revisao taxonomica.",
        "Limitacao importante: sem padronizacao e licencas adequadas, o resultado pode servir como triagem, mas nao como inventario cientifico completo.",
      ],
    },
    {
      id: "projetos_conservacao_herpetofauna",
      match: /\b(projeto|projetos|acao|acoes|conservacao|preservacao|proteger|ajudar|manejo|restauracao|corredor|corredores|educacao ambiental)\b.*\b(serpente|serpentes|cobra|cobras|anfibio|anfibios|reptil|repteis|herpetofauna|sapo|sapos|anuro|anuros)\b|\b(serpente|serpentes|cobra|cobras|anfibio|anfibios|reptil|repteis|herpetofauna|sapo|sapos|anuro|anuros)\b.*\b(projeto|projetos|acao|acoes|conservacao|preservacao|proteger|ajudar|manejo|restauracao|corredor|corredores|educacao ambiental)\b/,
      title: "Projetos de conservacao para anfibios e repteis",
      answer: [
        "Projetos bons para anfibios e serpentes costumam combinar habitat, educacao, monitoramento e reducao de mortalidade. A primeira regra e nao pensar so em uma especie: anfibios dependem muito de umidade, corpos d'agua, micro-habitats e qualidade ambiental; serpentes dependem de abrigo, presas, conectividade e menor perseguicao humana.",
        "Acoes fortes: restaurar matas ciliares e nascentes; proteger brejos, poças temporarias, riachos e serrapilheira; criar corredores ecologicos entre fragmentos; monitorar atropelamentos e propor sinalizacao/passagens de fauna; reduzir fogo, lixo, agrotoxicos e contaminacao da agua; mapear areas de reproducao de anuros; e acompanhar registros com fotos, audio, coordenada e revisao taxonomica.",
        "Para serpentes, educacao ambiental e central: ensinar identificacao segura, distancia, importancia ecologica e o que fazer em encontros. Projetos nao devem estimular captura por pessoas sem treinamento. Remocao ou manejo deve ficar com equipes autorizadas. Para anfibios, vale incluir vigilancia de doencas, qualidade da agua, sombreamento, conectividade e monitoramento de vocalizacoes.",
        "Um projeto inicial no Vale Historico pode comecar com tres frentes: 1. diagnostico de registros e lacunas; 2. campo padronizado em pontos prioritarios; 3. devolutiva publica com educacao e protocolo de seguranca. O Gold pode ajudar a transformar isso em plano de trabalho, lista de dados de campo e matriz de prioridades.",
        "Aplicacao em herpetologia: integrar dados de campo, ciencia cidada, colecoes e paisagem para escolher prioridades realistas.",
        "Limitacao importante: conservacao responsavel exige evidencia local, autorizacao quando houver manejo e acompanhamento ao longo do tempo.",
      ],
    },
    {
      id: "ameacas_doencas_herpetofauna",
      match: /\b(doenca|doencas|patogeno|patogenos|perigo|perigos|ameaca|ameacas|atingem|afetam|declinio|quitridio|quitridiomicose|ranavirus|ranavirose|fungo|parasita|atropelamento|perseguicao|trafico|poluicao|agrotoxico|agrotoxicos)\b/,
      title: "Doencas, perigos e ameacas para herpetofauna",
      answer: [
        "A resposta muda conforme o grupo. Em anfibios, ameacas importantes incluem perda e fragmentacao de habitat, alteracao de riachos e brejos, poluicao, agrotoxicos, mudancas climaticas, atropelamento, especies invasoras e doencas como quitridiomicose, associada a fungos quitridios, e ranavirose. Isso nao significa diagnosticar um animal em campo: doenca exige protocolo, amostra e analise adequada.",
        "Em serpentes e outros repteis, os perigos mais comuns incluem perda de habitat, atropelamento, fogo, perseguicao e morte por medo, captura ilegal, contaminacao por pesticidas ou rodenticidas, isolamento de populacoes e degradacao de micro-habitats. Tambem existem problemas sanitarios, parasitas e doencas fungicas em repteis, mas a importancia local precisa de evidencia.",
        "Para humanos, o risco principal com serpentes peconhentas e acidente ofidico. A conduta segura e manter distancia, nao capturar, nao matar e procurar atendimento medico imediatamente em caso de picada. Para os animais, o maior perigo costuma ser a combinacao de habitat degradado, estradas, poluicao e conflito com pessoas.",
        "Um bom projeto cientifico separa tres coisas: ameaca ambiental, evidencia de doenca e risco de acidente. No Vale Historico, isso pode virar monitoramento de atropelamentos, vigilancia de pontos reprodutivos de anuros, educacao sobre serpentes, qualidade de agua e comparacao entre registros atuais, colecoes e ciencia cidada.",
        "Aplicacao em herpetologia: orientar vigilancia sanitaria, educacao ambiental, monitoramento de atropelamentos e priorizacao de habitats sensiveis.",
        "Limitacao importante: suspeita de doenca nao e diagnostico; confirmar patogenos exige protocolo, amostragem adequada e analise especializada.",
      ],
    },
    {
      id: "ficha_dados_campo",
      match: /\b(ficha de campo|dados minimos|observacao cientifica util|registrar uma observacao|registro cientifico|dados de campo)\b/,
      title: "Ficha de campo e dados minimos",
      answer: [
        "Uma observacao cientifica util precisa permitir revisao. Registre: data, horario, municipio/localidade, coordenada com incerteza quando possivel, ambiente, micro-habitat, metodo, observador, evidencia e identificacao proposta.",
        "Para herpetologia, acrescente condicoes ambientais, como chuva, temperatura aproximada, umidade percebida, corpo d'agua proximo, tipo de vegetacao, substrato e comportamento. Para anuros, audio de canto pode ser tao importante quanto foto. Para serpentes, priorize foto a distancia e seguranca.",
        "Uma ficha simples pode ter campos para: ponto amostral, esforco amostral, grupo, nome cientifico ou identificacao provisoria, nome popular, evidencia fotografica/audio, numero de individuos, observacoes e grau de confianca.",
        "Aplicacao em herpetologia: transformar observacoes soltas em registros auditaveis, comparaveis e uteis para ciencia cidadã, colecoes, relatorios e planejamento de campo.",
        "Limitacao importante: dado sem localidade, data, evidencia ou criterio de identificacao fica fraco para uso cientifico; ainda pode orientar curiosidade, mas nao sustenta conclusoes fortes.",
      ],
    },
    {
      id: "ecologia_herpetofauna_paisagem",
      match: /\b(sensiveis|alteracao ambiental|altitude|serrapilheira|fragmentacao florestal|riachos|pocas temporarias|borda de mata|composicao da herpetofauna|bioindicadores?|bioindicadoras|mudancas climaticas|anfibios de altitude|atividade de repteis)\b/,
      title: "Ecologia da herpetofauna na paisagem",
      answer: [
        "Anfibios e repteis respondem a um conjunto de fatores ambientais: umidade, temperatura, altitude, cobertura vegetal, corpos d'agua, serrapilheira, disponibilidade de abrigos, presas e conectividade entre habitats.",
        "Anfibios tendem a ser especialmente sensiveis porque muitos têm pele permeavel, ovos ou larvas dependentes de agua ou umidade, e forte relacao com sazonalidade. Riachos, brejos, poças temporarias e micro-habitats umidos podem definir onde eles vocalizam, reproduzem e sobrevivem.",
        "Serpentes e lagartos tambem respondem a estrutura do habitat. Fragmentacao, borda de mata, fogo, atropelamento e perda de presas podem alterar composicao, deslocamento e risco de morte. Serrapilheira, troncos, rochas e vegetacao fornecem abrigo, alimento e estabilidade microclimatica.",
        "Em altitude, a temperatura, a nebulosidade, a umidade e o isolamento podem favorecer endemismo, mas tambem aumentar vulnerabilidade a mudancas climaticas. Na Mantiqueira, isso e essencial para interpretar registros sem reduzir tudo a limite municipal.",
        "Aplicacao em herpetologia: usar variaveis ambientais para planejar amostragem, formular hipoteses e explicar diferencas entre comunidades.",
        "Limitacao importante: padrao ecologico exige dados comparaveis; uma lista de registros isolados nao prova causa, abundancia real ou ausencia biologica.",
      ],
    },
    {
      id: "taxonomia_conceitual",
      match: /\b(genero ou especie|binomio cientifico|sinonimo taxonomico|nomes cientificos mudam|nome cientifico muda|taxonomia muda|nome aceito|nome valido)\b/,
      title: "Taxonomia conceitual",
      answer: [
        "Na nomenclatura zoologica, especie costuma ser escrita como binomio: genero com inicial maiuscula e epiteto especifico em minuscula, por exemplo Bothrops jararaca. O genero sozinho, como Bothrops ou Rhinella, agrupa varias especies.",
        "Sinonimo taxonomico e um nome que ja foi usado para um taxon, mas que pode nao ser o nome aceito atualmente. Mudancas acontecem por revisao de material, novas evidencias morfologicas, moleculares, filogeneticas, prioridade nomenclatural ou melhor delimitacao de especies.",
        "Para o Gold, isso importa porque OCR, nomes populares, sinonimos e registros antigos podem misturar nomes aceitos, mencoes historicas e identificacoes pendentes. O correto e separar nome aceito, sinonimo, mencao local, voucher e incerteza.",
        "Aplicacao em herpetologia: evitar transformar qualquer palavra parecida em especie valida e revisar nomes com fonte taxonomica atualizada.",
        "Limitacao importante: sem uma fonte taxonomica validada, o Gold deve marcar como pendente ou ambiguo em vez de inventar status.",
      ],
    },
    {
      id: "dados_evidencia_fontes",
      match: /\b(base cientifica|pedir municipio|ausencia de retorno|ausencia de registros|ausencia da especie|api|registro antigo|registros publicos|priorizar areas|priorizar areas para conservacao|lacunas de amostragem|colecao com observacoes recentes|fonte citavel|evidencia suficiente|conhecimento geral|ocorrencia municipal|qualidade de coordenadas)\b/,
      title: "Escopo de dados, evidencias e fontes",
      answer: [
        "O Gold deve separar tres coisas: conhecimento geral, evidencia bibliografica e dado estruturado local. Perguntas sobre conceitos, taxonomia, metodologia, ecologia e conservacao usam base cientifica, glossario, RAG ou backbone taxonomico. Municipio so e necessario quando a pergunta pede ocorrencia local, voucher, registros, comparacao municipal ou consulta a cache/API.",
        "iNaturalist e util para observacoes com fotos, datas e identificacao comunitaria, mas nao equivale a voucher nem a inventario completo. speciesLink e mais forte para colecoes, materiais preservados e historico de coleta, mas tambem pode ter nomes antigos, coordenadas imprecisas e lacunas.",
        "Ausencia de retorno em uma API nao significa ausencia biologica. Pode ser falta de amostragem, filtro inadequado, falha de rede, chave ausente, cache antigo, identificacao pendente ou dado nao digitalizado. Registro antigo pode ser valioso, mas precisa de revisao taxonomica, espacial e temporal.",
        "Uma resposta precisa de fonte citavel quando faz afirmacao cientifica especifica, compara dados, fala de distribuicao, ameaca, status de conservacao, metodologia formal ou decisao de manejo. Se a evidencia for insuficiente, o Gold deve dizer isso claramente, oferecer caminhos de verificacao e nao fingir certeza.",
        "Aplicacao em herpetologia: combinar literatura, colecoes, ciencia cidada e campo sem confundir os tipos de evidencia.",
        "Limitacao importante: dados secundarios orientam hipoteses; decisoes cientificas fortes exigem filtros documentados, validacao e, muitas vezes, trabalho de campo.",
      ],
    },
    {
      id: "seguranca_serpentes_educacao",
      match: /\b(picada de serpente|nao fazer em caso de picada|matar serpentes|registrar uma serpente com seguranca|orientar criancas sobre serpentes|orientar criancas|sem criar panico|chamar bombeiros|orgao ambiental|manejo perigoso)\b/,
      title: "Seguranca com serpentes e educacao",
      answer: [
        "Em encontro com serpente, a regra pratica e distancia. Nao tente pegar, encurralar, matar ou deslocar o animal. Para registrar, fotografe de longe, use zoom, mantenha rota de fuga e nunca coloque mao em frestas, troncos ou vegetacao sem visibilidade.",
        "Em caso de picada, procure atendimento medico imediatamente. Nao faca torniquete, nao corte, nao fure, nao sugue, nao aplique substancias e nao tente capturar a serpente. Se houver foto segura, ela pode ajudar, mas atendimento vem primeiro.",
        "Matar serpentes aumenta risco porque aproxima a pessoa do animal e remove predadores importantes do ecossistema. Educacao com criancas deve ser simples: nao tocar, chamar um adulto, observar de longe e respeitar o animal.",
        "Chame bombeiros, defesa civil ou orgao ambiental quando a serpente estiver dentro de casa, em escola, area de circulacao intensa, local sem rota segura de saida ou quando houver acidente. Remocao deve ser feita por equipe treinada.",
        "Aplicacao em herpetologia: reduzir conflito humano-fauna e mortalidade de serpentes sem romantizar manejo perigoso.",
        "Limitacao importante: orientacao geral nao substitui atendimento medico, protocolo oficial ou equipe autorizada em situacao de risco.",
      ],
    },
  ];

  const TOPICS = [
    ["inventario_faunistico", /\b(invent[aá]rio faun[ií]stico|invent[aá]rio)\b/, "Inventário faunístico", "levantamento planejado para documentar a fauna de uma área em um período definido", "combinar métodos adequados aos grupos-alvo, registrar esforço, local, data, evidência e critérios de identificação", "uma lista de bases públicas não substitui amostragem padronizada; detectabilidade, sazonalidade e acesso influenciam resultados"],
    ["busca_ativa", /\b(busca ativa|procura ativa)\b/, "Busca ativa", "procura direta por animais em micro-hábitats, trilhas, vegetação, solo, serrapilheira, margens de riachos e abrigos", "usar observadores treinados, período e esforço registrados, com atenção a horários e condições ambientais", "depende da detectabilidade, experiência da equipe, clima, horário e acesso; comparações exigem esforço documentado"],
    ["vlt", /\b(procura visual limitada por tempo|visual encounter survey|ves)\b/, "Procura visual limitada por tempo", "modalidade de busca ativa com duração ou esforço previamente definidos", "comparar unidades amostrais usando tempo, número de observadores e condições de campo registrados", "não detecta todos os grupos igualmente e pode favorecer organismos mais visíveis ou ativos"],
    ["encontros_ocasionais", /\b(encontros? ocasionais?|registro ocasional)\b/, "Encontros ocasionais", "registros obtidos fora de um protocolo amostral principal", "complementar listas e documentar observações relevantes com foto, coordenada, data e contexto", "não permitem comparar abundância ou esforço como uma amostragem padronizada"],
    ["pitfall", /\b(pitfall|armadilhas? de intercepta[cç][aã]o e queda|armadilhas? de interceptacao e queda|armadilhas? de queda)\b/, "Armadilhas de interceptação e queda (pitfall traps)", "conjunto de recipientes enterrados frequentemente associados a cercas-guia para interceptar animais em deslocamento", "amostrar parte da fauna terrestre ou fossorial com vistorias frequentes e desenho ético apropriado", "eficiência varia entre grupos; exige licenças, manejo responsável, inspeção frequente e registro do esforço"],
    ["gravacao_acustica", /\b(grava[cç][aã]o ac[uú]stica|monitoramento ac[uú]stico|vocaliza[cç][aã]o)\b/, "Gravação acústica", "registro de vocalizações para detectar e analisar espécies que se comunicam por som", "apoiar levantamentos de anuros, documentando horário, local, equipamento e condições ambientais", "nem toda espécie vocaliza durante a amostragem; ruído, sazonalidade e sobreposição de cantos afetam a identificação"],
    ["esforco_amostral", /\besfor[cç]o amostral\b/, "Esforço amostral", "quantidade de trabalho investida na coleta de dados, como horas-observador, noites, armadilhas-dia ou pontos gravados", "permitir comparação mais responsável entre locais, períodos e métodos", "números brutos de registros sem esforço comparável podem induzir interpretações erradas"],
    ["riqueza", /\briqueza de esp[eé]cies\b/, "Riqueza de espécies", "número de espécies registrado ou estimado para um recorte", "descrever diversidade taxonômica com filtros e esforço documentados", "riqueza observada é sensível à amostragem e não equivale automaticamente à riqueza real"],
    ["abundancia_relativa", /\babund[aâ]ncia relativa\b/, "Abundância relativa", "medida comparativa da frequência de registros ou indivíduos dentro de um protocolo", "comparar padrões sob método e esforço consistentes", "registros de plataformas públicas e coleções não devem ser tratados diretamente como abundância populacional"],
    ["curva_acumulacao", /\bcurva de acumula[cç][aã]o\b/, "Curva de acumulação de espécies", "gráfico que relaciona espécies registradas ao aumento do esforço ou das unidades amostrais", "avaliar se novas amostras continuam acrescentando espécies e orientar planejamento", "estabilização aparente depende do desenho amostral; a curva não prova completude absoluta"],
    ["estimadores_riqueza", /\bestimadores? de riqueza\b/, "Estimadores de riqueza", "métodos estatísticos usados para estimar espécies não detectadas a partir do padrão de registros", "complementar riqueza observada quando o desenho amostral permite", "a escolha do estimador e a qualidade dos dados importam; não corrigem automaticamente amostragem inadequada"],
    ["vies_amostral", /\bvi[eé]s amostral\b/, "Viés amostral", "distorção causada quando o processo de amostragem favorece locais, períodos, espécies ou observadores", "interpretar dados de campo, coleções e ciência cidadã com cautela", "mais registros podem refletir acesso e esforço, não uma diferença biológica real"],
    ["vies_espacial", /\bvi[eé]s espacial\b/, "Viés espacial", "concentração desigual de registros no território", "avaliar proximidade de estradas, trilhas, cidades e áreas mais visitadas", "lacunas geográficas podem ser lacunas de amostragem, não ausência biológica"],
    ["vies_temporal", /\bvi[eé]s temporal\b/, "Viés temporal", "concentração desigual de registros em estações, anos ou horários", "considerar sazonalidade, chuva e períodos de atividade", "comparações temporais exigem cuidado com mudanças de esforço e método"],
    ["voucher", /\b(voucher|material preservado)\b/, "Voucher", "evidência documental vinculada a uma ocorrência, frequentemente um exemplar ou material depositado em coleção científica", "permitir verificação posterior da identificação e apoiar revisão taxonômica", "nem toda observação possui voucher; exigências éticas, legais e de conservação devem ser consideradas"],
    ["colecao", /\bcole[cç][aã]o cient[ií]fica\b/, "Coleção científica", "acervo institucional que preserva exemplares, tecidos, registros e metadados", "sustentar pesquisa taxonômica, histórica e biogeográfica", "nomes e coordenadas podem precisar de revisão; ausência no acervo não prova ausência na natureza"],
    ["ciencia_cidada", /\bci[eê]ncia cidad[aã]\b/, "Ciência cidadã", "participação pública na produção e compartilhamento de observações", "ampliar cobertura espacial e temporal, especialmente com fotos e metadados", "observações variam em esforço, acesso e qualidade de identificação"],
    ["inaturalist", /\binaturalist\b/, "iNaturalist", "plataforma de ciência cidadã com observações públicas e identificações comunitárias", "consultar observações documentadas, fotos e padrões exploratórios", "observação não é voucher e registros disponíveis não equivalem a inventário completo ou abundância real"],
    ["specieslink", /\bspecieslink\b/, "speciesLink", "infraestrutura que integra dados de coleções e outras bases de biodiversidade", "consultar registros históricos, material preservado e metadados de coleta", "registros podem exigir revisão taxonômica e espacial; falha da fonte não significa ausência biológica"],
    ["darwin_core", /\b(darwin core|dwc)\b/, "Darwin Core", "padrão de termos para compartilhar dados de biodiversidade", "organizar campos como táxon, localidade, data, tipo de registro e instituição", "padronização facilita integração, mas não garante que o conteúdo esteja taxonomicamente ou espacialmente correto"],
    ["georreferenciamento", /\bgeorreferenciamento|coordenadas?\b/, "Georreferenciamento", "associação de um registro a uma posição espacial", "mapear ocorrências, avaliar distribuição e planejar trabalho de campo", "coordenadas podem ter incerteza, erro ou generalização; precisão deve ser avaliada antes do uso"],
    ["mata_atlantica", /\bmata atl[aâ]ntica\b/, "Mata Atlântica", "bioma com elevada diversidade e forte heterogeneidade ambiental", "interpretar herpetofauna considerando umidade, altitude, riachos, fragmentação e cobertura vegetal", "listas municipais são pontos de partida; paisagem e esforço amostral atravessam limites administrativos"],
    ["mantiqueira", /\b(serra da mantiqueira|mantiqueira)\b/, "Serra da Mantiqueira", "região montanhosa com variação de altitude, clima, vegetação e disponibilidade de micro-hábitats", "formular hipóteses ecológicas e planejar amostragem no Vale Histórico", "a região não deve ser reduzida a uma lista administrativa de municípios"],
    ["conservacao", /\bconserva[cç][aã]o de anf[ií]bios e r[eé]pteis\b/, "Conservação de anfíbios e répteis", "conjunto de ações para proteger espécies, populações, habitats e processos ecológicos", "combinar evidência de campo, coleções, ciência cidadã, validação taxonômica e contexto da paisagem", "priorização responsável exige dados auditáveis e reconhecimento explícito das lacunas"],
    ["endemismo", /\bendemismo|endemismos|endemicas?|endemicos?\b/, "Endemismo", "condicao em que um taxon tem distribuicao restrita a uma regiao, bioma, serra, bacia ou outro recorte geografico", "avaliar singularidade biogeografica, prioridade de conservacao e vulnerabilidade de linhagens com distribuicao pequena", "o termo depende da escala usada; uma especie pode ser endemica de um bioma, mas nao de um municipio especifico"],
    ["bioindicadores", /\bbioindicadores?|indicadores? biologicos?\b/, "Bioindicadores", "organismos ou comunidades usados para inferir condicoes ambientais, pressoes ecologicas ou mudancas no habitat", "interpretar respostas de anfibios e repteis a umidade, qualidade de riachos, fragmentacao, cobertura vegetal e perturbacao", "um grupo indicador nao substitui medicoes ambientais diretas; detectabilidade e identificacao tambem influenciam o padrao observado"],
    ["corredores_ecologicos", /\bcorredores? ecologicos?|conectividade ecologica\b/, "Corredores ecologicos", "faixas ou redes de habitat que favorecem conectividade entre fragmentos e reduzem isolamento biologico", "pensar deslocamento, fluxo genico, refugios e continuidade de micro-habitats para a herpetofauna", "nem todo corredor funciona igual para todos os grupos; matriz, largura, qualidade do habitat e barreiras locais importam"],
    ["restauracao_ecologica", /\brestauracao ecologica|recuperacao ambiental\b/, "Restauracao ecologica", "processo de auxiliar a recuperacao de ecossistemas degradados, considerando estrutura, funcao e continuidade ecologica", "melhorar cobertura vegetal, microclima, serrapilheira, riachos e conectividade que sustentam anfibios e repteis", "recuperar vegetacao nao garante automaticamente retorno da fauna; monitoramento e tempo ecologico sao necessarios"],
    ["ecotono", /\becotono|ecotonal|zona de transicao\b/, "Ecotono", "zona de transicao entre formacoes, ambientes ou comunidades ecologicas", "avaliar encontros entre gradientes de altitude, umidade, borda florestal, campos, matas e areas riparias", "os limites podem ser difusos e variam com escala, sazonalidade e criterio usado para delimitar o ambiente"],
    ["fragmentacao", /\bfragmentacao florestal|fragmentos? florestais?\b/, "Fragmentacao florestal", "divisao de habitats continuos em fragmentos menores e mais isolados", "interpretar perda de micro-habitats, efeito de borda, conectividade e disponibilidade de areas umidas para herpetofauna", "registros em fragmentos refletem tambem esforco, acesso e historico de ocupacao; nao devem ser lidos como inventario completo"],
    ["declinio_anfibios", /\bdeclinio de anfibios|declinio populacional\b/, "Declinio de anfibios", "reducao de populacoes ou desaparecimento local de anfibios ao longo do tempo", "discutir ameacas como perda de habitat, poluicao, mudancas climaticas, doencas, alteracoes hidrologicas e fragmentacao", "confirmar declinio exige dados temporais comparaveis; ausencia de registro recente nao prova desaparecimento"],
    ["microhabitat", /\bmicro-?habitat|microhabitats?\b/, "Micro-habitat", "recorte fino do ambiente usado por organismos, como serrapilheira, bromelias, troncos, riachos, pocos, rochas ou solo umido", "relacionar especies a condicoes locais de abrigo, reproducao, forrageamento e umidade", "micro-habitats podem mudar rapidamente com chuva, estacao, manejo e degradacao"],
    ["sazonalidade", /\bsazonalidade|estacoes?|periodo chuvoso|periodo seco\b/, "Sazonalidade", "variacao temporal associada a chuva, temperatura, fotoperiodo e ciclos reprodutivos", "planejar amostragens de anfibios e repteis considerando atividade, vocalizacao, deslocamento e detectabilidade", "comparar meses ou anos sem padronizar esforco e condicoes pode gerar interpretacoes enviesadas"],
  ];

  function removeAccents(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function normalize(value) {
    return removeAccents(value).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  }
  function createScientificMethodologyEngine() {
    function findComplexGuide(question) {
      const q = normalize(question);
      return COMPLEX_GUIDES.find((guide) => guide.match.test(q)) || null;
    }
    function findTopic(question) {
      const q = normalize(question);
      return TOPICS.find((topic) => topic[1].test(q)) || null;
    }
    function shouldHandle(question, parsed = {}) {
      if (parsed.municipalities?.length) return false;
      return Boolean(findComplexGuide(question) || findTopic(question));
    }
    async function answerQuestion(question, parsed = {}) {
      if (!shouldHandle(question, parsed)) return null;
      const guide = findComplexGuide(question);
      if (guide) {
        return {
          answer: guide.answer.join("\n\n"),
          kind: "scientific_methodology_engine",
          evidence: [{ id: guide.id, source: "guia cientifico curado local" }],
        };
      }
      const [id, , title, concept, application, limitation] = findTopic(question);
      const sections = [
          `${title} é ${concept}.`,
          `Aplicação em herpetologia: ${application}.`,
          `Limitação importante: ${limitation}.`,
          "No Vale Histórico da Serra da Mantiqueira, esse conceito pode orientar planejamento e interpretação sem limitar a explicação aos municípios configurados.",
        ];
      if (id === "inventario_faunistico") sections.splice(1, 0, "Um inventário exige desenho amostral, esforço padronizado, validação taxonômica e análise espacial.");
      if (/\b(artigo|cient[ií]fic|tese|disserta[cç][aã]o|relat[oó]rio)\b/.test(normalize(question))) {
        sections.push("Para uso científico, é importante documentar filtros, data da consulta, fontes utilizadas, esforço amostral e limitações da análise.");
      }
      return {
        answer: sections.join("\n\n"),
        kind: "scientific_methodology_engine",
        evidence: [{ id, source: "síntese metodológica curada local" }],
      };
    }
    return { TOPICS, COMPLEX_GUIDES, normalize, findComplexGuide, findTopic, shouldHandle, answerQuestion };
  }
  const api = createScientificMethodologyEngine();
  api.createScientificMethodologyEngine = createScientificMethodologyEngine;
  global.GoldScientificMethodologyEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
