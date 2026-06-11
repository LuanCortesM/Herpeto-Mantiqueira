(function (global) {
  const backboneDefault =
    global.GoldTaxonomyBackbone ||
    (typeof require === "function" ? require("./taxonomy-backbone.js") : null);

  const PROFILES = [
    ["cascavel", "popular_name", /\bcascav(?:el|eis|éis)\b/, "Cascavel e um nome popular geralmente associado a serpentes do genero Crotalus, especialmente ao complexo de Crotalus durissus no Brasil. O nome popular ajuda na conversa, mas nao confirma sozinho a especie nem a ocorrencia em um municipio. Cascaveis pertencem a Viperidae, sao peconhentas e tem importancia ecologica como predadoras; a presenca do chocalho na cauda e uma caracteristica marcante, mas identificacao segura deve ser feita com distancia e cautela. Se encontrar uma serpente assim, nao tente capturar ou matar. Em caso de acidente, procure atendimento medico imediatamente e nao faca procedimentos caseiros. Posso explicar Crotalus de forma geral, recuperar mencoes da biblioteca local ou consultar registros municipais quando voce indicar o municipio."],
    ["crotalus", "genus", /\bcrotalus\b/, "Crotalus e um genero de serpentes peconhentas da familia Viperidae, popularmente associado as cascaveis. No Brasil, o grupo e frequentemente discutido em torno de Crotalus durissus e linhagens relacionadas, mas a taxonomia e a distribuicao exigem fonte atualizada. Como regra cientifica, o Gold nao deve transformar uma mencao geral a Crotalus em registro municipal; para isso e preciso consultar cache, iNaturalist, speciesLink ou literatura local."],
    ["coral", "popular_name", /\b(cobras?\s+)?cor(?:al|ais)\b/, "Cobra-coral e um nome popular ambiguo. Pode se referir a corais verdadeiras, geralmente associadas a Elapidae, ou a serpentes nao elapideas com padroes de coloracao parecidos, chamadas popularmente de falsas-corais. Cor e aneis sozinhos podem enganar; por seguranca, nunca manuseie para tentar diferenciar. O Gold pode explicar a diferenca geral, mas registros municipais dependem de dados estruturados e identificacao confiavel."],
    ["jiboia", "popular_name", /\bjiboias?\b/, "Jiboia e um nome popular geralmente associado a Boa constrictor e a serpentes boideas. Em geral, jiboias nao sao peconhentas e usam constricao para subjugar presas, mas ainda assim devem ser observadas sem captura ou perseguicao. A ocorrencia local precisa ser tratada como pergunta de registro, nao como deducao a partir do nome popular."],
    ["surucucu", "popular_name", /\bsurucucus?\b/, "Surucucu e um nome popular que pode ser usado para serpentes grandes e peconhentas, frequentemente associado a Lachesis em parte do Brasil. Como todo nome popular, ele e regional e pode gerar confusao. O Gold deve responder de forma geral sem afirmar presenca local; para ocorrencia municipal, e necessaria consulta a registros e literatura."],
    ["mussurana", "popular_name", /\b(mu[cç]uranas?|mussuranas?)\b/, "Mucurana, tambem escrita como mussurana, e um nome popular usado para algumas serpentes, incluindo formas conhecidas por predar outras serpentes. O uso popular pode variar e nao define sozinho especie. A explicacao geral pode tratar de ecologia e seguranca; registros locais precisam de fonte."],
    ["caninana", "popular_name", /\bcaninanas?\b/, "Caninana e um nome popular usado para serpentes grandes e ageis em diferentes regioes do Brasil. O nome sozinho nao e uma identificacao cientifica fechada. O Gold pode explicar o uso popular e orientar observacao segura, mas nao deve presumir ocorrencia municipal sem evidencia."],
    ["jararaca", "popular_name", /\bjararacas?\b/, "Jararaca é um nome popular geralmente associado a serpentes peçonhentas do gênero Bothrops, mas o uso pode variar regionalmente e o nome sozinho não confirma uma espécie. Bothrops jararaca é uma referência importante na Mata Atlântica, sem que isso transforme todo uso do nome popular em identificação fechada. Como seleção introdutória, o gênero inclui espécies como Bothrops jararaca, Bothrops jararacussu, Bothrops alternatus, Bothrops moojeni, Bothrops neuwiedi, Bothrops atrox, Bothrops erythromelas e Bothrops leucurus. Essas são referências gerais, não checklist oficial nem confirmação de ocorrência municipal. Essas serpentes têm importância ecológica como predadoras. Segurança: mantenha distância, não tente capturar ou matar. Em caso de picada, procure atendimento médico imediatamente; não faça torniquete, cortes ou aplicações caseiras. Posso explicar o grupo, listar menções de Bothrops recuperadas da biblioteca local ou consultar registros municipais."],
    ["sapos", "popular_name", /\bsapos?\b/, "Sapo é um nome popular amplo para anuros. Muitas vezes ele é associado a representantes de Bufonidae, mas não equivale perfeitamente a uma família ou espécie. Sapos, rãs e pererecas são nomes úteis na conversa; a identificação formal exige características diagnósticas e contexto. Posso explicar Anura, falar de Bufonidae ou consultar registros locais."],
    ["ras", "popular_name", /\br[aã]s?\b/, "Rã é um nome popular amplo usado para anuros. Ele não define sozinho uma família ou espécie. Posso explicar diferenças gerais entre sapos, rãs e pererecas ou consultar registros locais."],
    ["pererecas", "popular_name", /\bpererecas?\b/, "Perereca é um nome popular amplo para anuros frequentemente associados a hábitos arborícolas. O nome não confirma família ou espécie. Posso explicar Hylidae, ecologia geral ou registros locais."],
    ["cecilias", "popular_name", /\b(cec[ií]lias?|gymnophiona)\b/, "Gymnophiona é a ordem das cecílias: anfíbios alongados, sem membros, geralmente fossoriais ou associados a ambientes úmidos. São menos observados que muitos anuros, e a detectabilidade em campo é uma limitação importante."],
    ["amphibia", "class", /\bamphibia\b|\banf[ií]bios?\b/, "Amphibia é a classe dos anfíbios. Inclui Anura, Gymnophiona e Caudata. Em geral, anfíbios têm pele permeável e forte relação ecológica com umidade, embora exista grande diversidade de modos de vida e reprodução."],
    ["anura", "order", /\banura\b|\banuros?\b/, "Anura é a ordem dos anfíbios sem cauda na fase adulta. Inclui animais chamados popularmente de sapos, rãs e pererecas. Muitas espécies dependem de água ou umidade para reprodução, e vocalizações são importantes em diversos grupos. Anuros têm papel ecológico como consumidores e presas e podem responder a alterações ambientais."],
    ["caudata", "order", /\b(caudata|urodelos?|salamandras?)\b/, "Caudata é a ordem que inclui salamandras e tritões. É um grupo de anfíbios com cauda persistente na fase adulta. O Gold pode explicar o grupo em caráter geral; consultas municipais dependem das fontes estruturadas disponíveis."],
    ["reptilia", "class", /\breptilia\b|\br[eé]pteis?\b/, "Reptilia é a classe tradicionalmente usada para organizar répteis. No escopo do Gold, ela inclui explicações sobre Squamata, Testudines e Crocodylia. A classificação filogenética detalhada exige contexto taxonômico adicional."],
    ["squamata", "order", /\bsquamata\b/, "Squamata é a ordem que inclui serpentes, lagartos e anfisbenas. É um grupo muito diverso, com ampla variedade de formas corporais, estratégias ecológicas e modos de vida."],
    ["serpentes", "group", /\bserpentes?\b/, "Serpentes formam um grupo dentro de Squamata. Nem toda serpente é peçonhenta. Identificação segura exige cautela, observação à distância e, quando necessário, avaliação especializada."],
    ["lagartos", "group", /\blagartos?\b/, "Lagartos são representantes diversos de Squamata. O termo reúne linhagens com ecologia, morfologia e hábitos variados; não corresponde a uma única família."],
    ["anfisbenas", "group", /\b(anfisbenas?|amphisbaenia)\b/, "Anfisbenas são répteis escavadores de Squamata, com corpo alongado e hábitos fossoriais. São frequentemente pouco detectadas em levantamentos por causa do modo de vida subterrâneo."],
    ["testudines", "order", /\b(testudines|quel[oô]nios?|tartarugas?|c[aá]gados?|jabutis?)\b/, "Testudines é a ordem dos quelônios, incluindo tartarugas, cágados e jabutis. O casco é uma característica marcante, mas ecologia e habitat variam entre os grupos."],
    ["crocodylia", "order", /\b(crocodylia|crocodilianos?|jacar[eé]s?)\b/, "Crocodylia é a ordem dos crocodilianos, incluindo jacarés. O Gold trata esse grupo em explicações gerais; ele não deve presumir ocorrência municipal sem consultar dados adequados."],
    ["viperidae", "family", /\bviperidae\b/, "Viperidae é uma família de serpentes peçonhentas. Seus representantes possuem dentição solenóglifa. A fosseta loreal é característica aplicável às víboras de fosseta, como Bothrops, mas não deve ser generalizada sem ressalva para toda a família. Bothrops é um exemplo importante no Brasil."],
    ["dipsadidae", "family", /\b(dipsadidae|colubridae)\b/, "Dipsadidae e Colubridae são famílias importantes na diversidade de serpentes. A circunscrição taxonômica desses grupos exige fonte atualizada; o Gold oferece uma explicação geral e evita converter menções locais em checklist oficial."],
    ["hylidae", "family", /\bhylidae\b/, "Hylidae é uma família diversa de anuros, frequentemente associada a espécies arborícolas chamadas popularmente de pererecas. O nome popular não substitui identificação taxonômica."],
    ["bufonidae", "family", /\bbufonidae\b/, "Bufonidae é uma família de anuros que inclui diversos animais chamados popularmente de sapos. O termo sapo é mais amplo que Bufonidae e não deve ser usado como equivalência perfeita."],
    ["leptodactylidae", "family", /\bleptodactylidae\b/, "Leptodactylidae é uma família de anuros com diversidade ecológica e reprodutiva relevante na região Neotropical. A confirmação de espécies exige fonte taxonômica e evidência adequadas."],
    ["bothrops", "genus", /\bbothrops\b/, "Bothrops é um gênero da família Viperidae. Reúne serpentes peçonhentas ecologicamente importantes como predadoras. Nomes populares como jararaca podem ser associados ao gênero, mas variam regionalmente. Como seleção introdutória, podem ser citadas Bothrops jararaca, Bothrops jararacussu, Bothrops alternatus, Bothrops moojeni, Bothrops neuwiedi, Bothrops atrox, Bothrops erythromelas e Bothrops leucurus. Essas são referências gerais, não checklist oficial nem confirmação de ocorrência municipal. Posso explicar o grupo, mostrar menções recuperadas da biblioteca local ou consultar evidência municipal."],
    ["rhinella", "genus", /\brhinella\b/, "Rhinella é um gênero de anuros da família Bufonidae. Muitas espécies são chamadas popularmente de sapos, mas o nome popular sozinho não confirma o gênero ou a espécie."],
    ["boana", "genus", /\bboana\b/, "Boana é um gênero de anuros da família Hylidae. Algumas espécies são chamadas popularmente de pererecas. Para espécies e distribuição, o Gold diferencia explicação geral, menções da biblioteca e registros municipais."],
    ["scinax", "genus", /\bscinax\b/, "Scinax é um gênero de anuros da família Hylidae. A identificação em nível de espécie pode exigir caracteres diagnósticos e vocalizações, além de revisão especializada."],
    ["leptodactylus", "genus", /\bleptodactylus\b/, "Leptodactylus é um gênero de anuros da família Leptodactylidae. O grupo inclui espécies com diversidade ecológica e reprodutiva; a identificação específica requer evidência adequada."],
  ];

  const PROFILE_ANSWER_OVERRIDES = {
    anura: "Anura e a ordem dos anfibios sem cauda na fase adulta. Inclui animais chamados popularmente de sapos, rãs e pererecas, mas esses nomes populares nao equivalem perfeitamente a familias ou especies. Em muitos anuros, ovos, larvas, vocalizacao e atividade dependem de agua, umidade, temperatura e sazonalidade. Por isso, inventarios costumam combinar busca ativa visual, escuta de cantos, gravacao acustica e registro de micro-habitat. Anura fica dentro de Amphibia: Amphibia e a classe maior; Anura e uma das ordens dessa classe, ao lado de grupos como Gymnophiona e Caudata.",
    hylidae: "Hylidae e uma familia diversa de anuros, frequentemente associada a muitas especies chamadas popularmente de pererecas. Muitos hilideos usam vegetacao, brejos, margens de riachos ou ambientes temporariamente alagados, e em varios grupos a vocalizacao ajuda muito na identificacao. O nome popular perereca e util para conversa, mas nao confirma Hylidae nem especie. Para uso cientifico, o Gold deve separar explicacao geral, mencoes recuperadas da biblioteca local e registros municipais validados por fonte.",
    bufonidae: "Bufonidae e uma familia de anuros que inclui muitos animais chamados popularmente de sapos. Em geral, bufonideos podem ter corpo robusto, glandulas parotoides evidentes em varios grupos e habitos frequentemente terrestres, mas essas caracteristicas nao devem ser usadas como identificacao automatica. O termo sapo e mais amplo que Bufonidae: nem todo sapo popular e necessariamente Bufonidae, e nem toda resposta sobre sapos deve virar uma lista municipal.",
    leptodactylidae: "Leptodactylidae e uma familia neotropical de anuros com diversidade ecologica e reprodutiva importante. Inclui grupos associados a ambientes terrestres, alagados, margens de corpos d'agua e diferentes estrategias de reproducao, dependendo do genero e da especie. A familia e relevante em inventarios porque pode aparecer em busca ativa, vocalizacoes e encontros ocasionais. Identificacao em especie exige evidencia adequada, como foto, canto, localidade, literatura e revisao especializada.",
    rhinella: "Rhinella e um genero de anuros da familia Bufonidae. Muitas especies sao chamadas popularmente de sapos, mas nome popular sozinho nao confirma genero nem especie. Em inventarios, Rhinella pode ser registrada por observacao visual, fotos diagnosticas, vocalizacao em alguns contextos e localidade, sempre com cautela porque juvenis, especies parecidas e fotos ruins podem gerar identificacao incerta. Para o Gold, Rhinella deve ser tratado como genero: ele pode explicar o grupo, buscar especies ou mencoes na biblioteca local, ou consultar registros municipais quando o usuario pedir um municipio.",
  };

  function removeAccents(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function normalize(value) {
    return removeAccents(value).toLowerCase().replace(/[^a-z0-9\s.-]/g, " ").replace(/\s+/g, " ").trim();
  }

  function createHerpetologyEngine(dependencies = {}) {
    const backbone = dependencies.backbone || backboneDefault;
    function findProfile(question) {
      const q = normalize(question);
      const matches = PROFILES.filter((profile) => profile[2].test(q));
      const priorityByRank = {
        species: 7,
        genus: 6,
        family: 5,
        order: 4,
        popular_name: 3,
        group: 2,
        class: 1,
      };
      return matches.sort((a, b) => (priorityByRank[b[1]] || 0) - (priorityByRank[a[1]] || 0))[0] || null;
    }
    function shouldHandle(question, parsed = {}) {
      if (parsed.municipalities?.length) return false;
      if (parsed.conversationIntent === "municipal_occurrence_query") return false;
      return Boolean(findProfile(question));
    }
    async function answerQuestion(question, parsed = {}) {
      if (!shouldHandle(question, parsed)) return null;
      const profile = findProfile(question);
      const [id, rank, , answer] = profile;
      const finalAnswer = PROFILE_ANSWER_OVERRIDES[id] || answer;
      let backboneSummary = null;
      if (backbone?.getTaxonSummary) {
        try {
          backboneSummary = await backbone.getTaxonSummary(id === "sapos" ? "sapo" : id);
        } catch (error) {
          if (global.console?.warn) {
            global.console.warn("Backbone taxonomico indisponivel; usando resposta herpetologica curada.", error);
          }
        }
      }
      return {
        answer: finalAnswer,
        kind: "herpetology_engine",
        profile: { id, rank },
        evidence: backboneSummary ? [backboneSummary] : [],
      };
    }
    return { PROFILES, PROFILE_ANSWER_OVERRIDES, normalize, findProfile, shouldHandle, answerQuestion };
  }

  const api = createHerpetologyEngine();
  api.createHerpetologyEngine = createHerpetologyEngine;
  global.GoldHerpetologyEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
