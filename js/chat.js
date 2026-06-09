const chatFrames = Array.from({ length: 30 }, (_, index) =>
  `assets/animations/flipbook/frame-${String(index + 1).padStart(3, "0")}.jpg`
);

const waterfallCutoutFrames = Array.from({ length: 12 }, (_, index) =>
  `assets/animations/waterfall/waterfall-smooth-${String(index + 1).padStart(3, "0")}.png`
);

const avatarAssetVersion = "sketchbook-connectors-20260530";
const avatarAsset = (path) => `${path}?v=${avatarAssetVersion}`;
const avatarTransitionFrames = (mood) =>
  Array.from({ length: 24 }, (_, index) =>
    avatarAsset(`assets/avatars/${mood}/gold-${String(index + 1).padStart(3, "0")}.png`)
  );

const avatarSources = {
  default: avatarAsset("assets/avatars/happy/gold-001.png"),
  happy: avatarAsset("assets/avatars/happy/gold-360.png"),
  confused: avatarAsset("assets/avatars/confused/gold-360.png"),
  sad: avatarAsset("assets/avatars/sad/gold-360.png"),
};

const avatarTransitions = {
  happy: avatarTransitionFrames("happy"),
  confused: avatarTransitionFrames("confused"),
  sad: avatarTransitionFrames("sad"),
};

const chatFrame = document.getElementById("chatFrame");
const waterfallCutout = document.getElementById("waterfallCutout");
const form = document.getElementById("chatForm");
const input = document.getElementById("chatInput");
const conversation = document.getElementById("conversation");
const avatar = document.getElementById("goldAvatar");
const avatarCard = document.querySelector(".avatar-card");

const waterfallDefaults = {
  left: 61.45,
  top: 72.6,
  width: 20.35,
  height: 32.6,
  opacity: 0.64,
  clipTop: 6,
  clipRight: 5,
};

const waterfallSettings = waterfallDefaults;

const goldDefaults = {
  left: 71.1,
  top: 14.8,
  width: 21.6,
  height: 38.7,
};

const goldStorageKey = "herpeto-gold-official-layout";
const goldSettings = { ...goldDefaults };

const backgroundFrameDelay = 115;
const waterfallFrameDelay = 55;
const goldFrameRate = 60;

let bgIndex = 0;
let waterfallCutoutIndex = 0;
let thinkingNode = null;
let lastFrameAt = 0;
let lastWaterfallCutoutAt = 0;
let frameRafId = 0;
let avatarMood = "default";
let avatarAnimationId = 0;
let avatarRafId = 0;
const preloadedImages = new Map();

function preloadChatAssets() {
  [...chatFrames, ...waterfallCutoutFrames, ...Object.values(avatarSources)].forEach((source) => {
    if (preloadedImages.has(source)) return;
    const image = new Image();
    image.src = source;
    preloadedImages.set(source, image);
  });
}

function decodeAvatarFrames(frames) {
  return Promise.all(
    frames.map((source) => {
      let image = preloadedImages.get(source);
      if (!image) {
        image = new Image();
        image.src = source;
        preloadedImages.set(source, image);
      }
      if (!image?.decode) return Promise.resolve();
      return image.decode().catch(() => {});
    })
  );
}

function applyWaterfallSettings() {
  document.documentElement.style.setProperty("--waterfall-left", `${waterfallSettings.left}%`);
  document.documentElement.style.setProperty("--waterfall-top", `${waterfallSettings.top}%`);
  document.documentElement.style.setProperty("--waterfall-width", `${waterfallSettings.width}%`);
  document.documentElement.style.setProperty("--waterfall-height", `${waterfallSettings.height}%`);
  document.documentElement.style.setProperty("--waterfall-opacity", waterfallSettings.opacity.toFixed(2));
  document.documentElement.style.setProperty("--waterfall-clip-top", `${waterfallSettings.clipTop}%`);
  document.documentElement.style.setProperty("--waterfall-clip-right", `${waterfallSettings.clipRight}%`);
}

function applyGoldSettings() {
  document.documentElement.style.setProperty("--gold-left", `${goldSettings.left}%`);
  document.documentElement.style.setProperty("--gold-top", `${goldSettings.top}%`);
  document.documentElement.style.setProperty("--gold-width", `${goldSettings.width}%`);
  document.documentElement.style.setProperty("--gold-height", `${goldSettings.height}%`);
}

function readOfficialGoldSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(goldStorageKey));
    if (!saved || typeof saved !== "object") return;

    Object.keys(goldDefaults).forEach((key) => {
      const value = Number(saved[key]);
      if (Number.isFinite(value)) goldSettings[key] = value;
    });
  } catch {
    Object.assign(goldSettings, goldDefaults);
  }
}

function animateFlipbook(timestamp) {
  if (!lastFrameAt) lastFrameAt = timestamp;
  if (!lastWaterfallCutoutAt) lastWaterfallCutoutAt = timestamp;

  if (timestamp - lastFrameAt >= backgroundFrameDelay) {
    bgIndex = (bgIndex + 1) % chatFrames.length;
    chatFrame.src = chatFrames[bgIndex];
    lastFrameAt = timestamp;
  }

  if (timestamp - lastWaterfallCutoutAt >= waterfallFrameDelay) {
    waterfallCutoutIndex = (waterfallCutoutIndex + 1) % waterfallCutoutFrames.length;
    waterfallCutout.src = waterfallCutoutFrames[waterfallCutoutIndex];
    lastWaterfallCutoutAt = timestamp;
  }

  frameRafId = window.requestAnimationFrame(animateFlipbook);
}

function setMood(mood) {
  const nextMood = avatarSources[mood] ? mood : "default";
  if (nextMood === avatarMood) return;

  avatarAnimationId += 1;
  const animationId = avatarAnimationId;
  const frameDelay = 1000 / goldFrameRate;
  let frames = [];

  if (nextMood === "default" && avatarMood !== "default" && avatarTransitions[avatarMood]) {
    frames = [...avatarTransitions[avatarMood]].reverse();
  } else if (avatarMood === "default" && avatarTransitions[nextMood]) {
    frames = avatarTransitions[nextMood];
  } else if (avatarTransitions[nextMood]) {
    const currentTransition = avatarTransitions[avatarMood] || [avatarSources.default];
    frames = [
      ...[...currentTransition].reverse(),
      ...avatarTransitions[nextMood].slice(1),
    ];
  } else {
    frames = [avatarSources.default];
  }

  avatarMood = nextMood;
  avatar.dataset.mood = nextMood;
  avatarCard?.classList.add("is-avatar-transition");

  if (avatarRafId) {
    window.cancelAnimationFrame(avatarRafId);
    avatarRafId = 0;
  }

  decodeAvatarFrames(frames).then(() => {
    if (animationId !== avatarAnimationId) return;
    let startedAt = 0;
    let lastIndex = -1;

    function playAvatarFrame(timestamp) {
      if (animationId !== avatarAnimationId) return;
      if (!startedAt) startedAt = timestamp;

      const index = Math.min(frames.length - 1, Math.floor((timestamp - startedAt) / frameDelay));
      if (index !== lastIndex) {
        avatar.src = frames[index];
        lastIndex = index;
      }

      if (index < frames.length - 1) {
        avatarRafId = window.requestAnimationFrame(playAvatarFrame);
      } else {
        avatarRafId = 0;
        avatarCard?.classList.remove("is-avatar-transition");
      }
    }

    avatarRafId = window.requestAnimationFrame(playAvatarFrame);
  });
}

function addMessage(text, owner) {
  const message = document.createElement("article");
  message.className = `message message--${owner}`;

  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  message.append(paragraph);
  conversation.append(message);
  conversation.scrollTop = conversation.scrollHeight;

  return message;
}

function addThinking() {
  thinkingNode = document.createElement("article");
  thinkingNode.className = "message message--gold message--thinking";
  thinkingNode.innerHTML = "<span></span><span></span><span></span>";
  conversation.append(thinkingNode);
  conversation.scrollTop = conversation.scrollHeight;
}

function removeThinking() {
  thinkingNode?.remove();
  thinkingNode = null;
}

function classifyQuestion(text) {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized.length < 4 || /^(oi|ola|hey|e ai|bom dia|boa tarde|boa noite)\b/.test(normalized)) {
    return "hello";
  }

  if (/(erro|falha|bug|nao funciona|quebrou|problema|ruim)/.test(normalized)) {
    return "problem";
  }

  if (/(nao sei|confuso|duvida|entendi|o que e|qual e|como assim)/.test(normalized)) {
    return "confused";
  }

  if (/(sapo|ra|perereca|anfibio|reptil|cobra|jararaca|lagarto|serpente|bothrops|rhinella|anura|viperidae|bufonidae|hylidae|mantiqueira|mata atlantica|trilha|conservacao|veneno|observacao|campo)/.test(normalized)) {
    return "success";
  }

  return "unknown";
}

function answerFor(text) {
  const intent = classifyQuestion(text);
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/\bjararacas?\b/.test(normalized)) {
    return {
      mood: "happy",
      text: [
        "Jararaca é um nome popular usado para serpentes peçonhentas do grupo Bothrops. Na Mantiqueira, o nome pode incluir Bothrops jararaca, mas uma identificação segura precisa observar o animal com cuidado e sem aproximação.",
        "Mantenha distância e não tente capturar. Em caso de picada, procure atendimento médico imediatamente. Não faça torniquete, não corte, não fure e não aplique substâncias no local.",
        "Posso aprofundar por identificação, segurança, hábitos, conservação ou registros em um município.",
      ].join("\n\n"),
    };
  }

  if (/\bbothrops\b/.test(normalized)) {
    return {
      mood: "happy",
      text: [
        "Bothrops é um gênero da família Viperidae. Reúne serpentes peçonhentas ecologicamente importantes como predadoras.",
        "Nomes populares como jararaca podem estar associados ao gênero, mas variam regionalmente e não confirmam espécie sozinhos.",
        "Posso explicar o grupo, comentar espécies conhecidas ou consultar evidência municipal quando você indicar uma cidade.",
      ].join("\n\n"),
    };
  }

  if (/\bviperidae\b/.test(normalized)) {
    return {
      mood: "happy",
      text: "Viperidae é uma família de serpentes peçonhentas. No Brasil, inclui grupos como Bothrops. Posso explicar a família, comentar segurança ou consultar registros municipais se você indicar uma cidade.",
    };
  }

  if (/\banura\b|\banuros?\b/.test(normalized)) {
    return {
      mood: "happy",
      text: "Anura é a ordem dos anfíbios sem cauda na fase adulta. Inclui animais chamados popularmente de sapos, rãs e pererecas. Posso explicar o grupo, falar de reprodução, vocalização ou métodos de inventário.",
    };
  }

  if (/\bsapos?\b/.test(normalized)) {
    return {
      mood: "happy",
      text: "Sapo é um nome popular amplo para anuros. Muitas vezes lembra Bufonidae, mas não equivale perfeitamente a uma família ou espécie. Posso explicar sapos, rãs e pererecas de forma geral ou consultar registros locais se você indicar município.",
    };
  }

  if (/\brhinella\b/.test(normalized)) {
    return {
      mood: "happy",
      text: "Rhinella é um gênero de anuros da família Bufonidae. Muitas espécies são chamadas popularmente de sapos, mas a identificação em espécie exige cuidado, localidade, fotos, vocalização quando aplicável e fonte taxonômica.",
    };
  }

  if (/\bbusca ativa\b|\binventario\b|\binventario de anuros\b/.test(normalized)) {
    return {
      mood: "happy",
      text: "Busca ativa é um método de campo em que pesquisadores procuram animais de forma planejada, registrando tempo, local, micro-habitat e esforço amostral. Em inventários de anuros, costuma ser combinada com escuta de vocalizações, registros fotográficos, dados ambientais e visitas em diferentes horários e épocas.",
    };
  }

  const responses = {
    hello: {
      mood: "happy",
      text: "Oi! Estou de olhos bem abertos por aqui. Pode perguntar sobre especies, identificacao, habitos, seguranca em campo ou conservacao.",
    },
    success: {
      mood: "happy",
      text: "Boa pergunta. Na Mantiqueira, um bom olhar comeca pelo ambiente: umidade, horario, altitude, vegetacao e proximidade de agua contam muito. Me diga a especie ou situacao e eu aprofundo.",
    },
    confused: {
      mood: "confused",
      text: "Acho que preciso de mais uma pista. Voce quer identificar um animal, entender um comportamento, planejar uma saida de campo ou saber se ha risco?",
    },
    problem: {
      mood: "sad",
      text: "Poxa, isso parece um problema. Me descreva o que aconteceu com detalhes e eu tento separar o que e falha tecnica, duvida de identificacao ou alerta de seguranca.",
    },
    unknown: {
      mood: "confused",
      text: "Ainda nao consegui ligar essa pergunta ao meu repertorio de herpetofauna. Tente mencionar o animal, o local, o comportamento ou mandar uma descricao mais especifica.",
    },
  };

  return responses[intent];
}

function shouldUseINaturalist(text) {
  if (!window.INatHerpeto) return false;
  const normalized = window.INatHerpeto.normalizeText(text);
  if (shouldUseSpeciesLink(text)) return false;
  const municipalities = window.INatHerpeto.detectMunicipality(text);
  const hasTargetGroup =
    /\b(anfibio|anfibios|amphibia|sapo|sapos|ra|ras|perereca|pererecas|anuro|anuros|reptil|repteis|reptilia|cobra|cobras|serpente|serpentes|lagarto|lagartos|quelonio|quelonios|herpetofauna|inaturalist|registros|taxons|taxon|especies|espécies|riqueza|inventario|inventário)\b/.test(
      normalized
    );
  return municipalities.length > 0 || hasTargetGroup;
}

function shouldUseSpeciesLink(text) {
  if (!window.SpeciesLinkHerpeto) return false;
  const normalized = window.SpeciesLinkHerpeto.normalizeText(text);
  const municipalities = window.SpeciesLinkHerpeto.detectSpeciesLinkMunicipalities(text);
  return (
    normalized.includes("specieslink") ||
    /\b(voucher|vouchers|colecao|coleção|catalogo|catálogo|material preservado|preservado|coordenada|coordenadas|georreferenciado|latitude|longitude)\b/.test(normalized) ||
    (municipalities.length > 0 && /\b(registros biologicos|registros biológicos|colecoes|coleções|ocorrencias documentadas|ocorrências documentadas)\b/.test(normalized))
  );
}

function shouldUseConversationBrain(text) {
  if (!window.HerpetoChatBrain) return false;
  return classifyQuestion(text) !== "hello";
}

async function answerForChat(text) {
  if (window.location.protocol !== "file:") {
    try {
      const response = await fetch("/api/gold/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
        signal: AbortSignal.timeout(95000),
      });
      if (response.ok) {
        const result = await response.json();
        if (result.handled && result.answer) {
          return { mood: "happy", text: result.answer };
        }
      }
    } catch (error) {
      console.warn("Camada cientifica experimental indisponivel; usando fluxo atual.", error);
    }
  }
  if (shouldUseConversationBrain(text)) {
    return {
      mood: "happy",
      text: await window.HerpetoChatBrain.receiveUserQuestion(text),
    };
  }

  return answerFor(text);
}

function resizeInput() {
  input.style.overflowY = input.scrollHeight > input.clientHeight ? "auto" : "hidden";
}

function submitMessage(text) {
  addMessage(text, "user");
  input.value = "";
  resizeInput();
  setMood("default");
  addThinking();

  window.setTimeout(() => {
    answerForChat(text)
      .then((response) => {
        removeThinking();
        setMood(response.mood);
        addMessage(response.text, "gold");
      })
      .catch((error) => {
        console.error("Falha ao responder pergunta:", error);
        removeThinking();
        setMood("sad");
        addMessage("Tive uma falha interna ao montar a resposta agora. Tente de novo ou reformule a pergunta; se for consulta municipal, eu uso os dados locais/cache quando estiverem disponíveis.", "gold");
      });
  }, 650 + Math.min(text.length * 10, 650));
}

readOfficialGoldSettings();
applyWaterfallSettings();
applyGoldSettings();
preloadChatAssets();
frameRafId = window.requestAnimationFrame(animateFlipbook);

input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) {
    setMood("confused");
    input.focus();
    return;
  }

  submitMessage(text);
});
