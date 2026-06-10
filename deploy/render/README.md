# Deploy do HerpetoMantiqueira no Render

Este pacote sobe como **Web Service Node** no Render, porque o site precisa de backend para:

- responder `/api/gold/chat`;
- consultar/cachear iNaturalist, speciesLink e IUCN;
- servir o cache municipal;
- proteger a area administrativa;
- manter o fluxo antigo do Gold e a camada cientifica sob feature flag.

## O que vai para o Render

- HTML, CSS, JavaScript e imagens publicas do site;
- arquivos JavaScript do backend;
- cache municipal leve em `backend-data/biodiversity-cache/database.json`;
- indices cientificos publicos em `IAAprendaAqui/*.json`;
- indice taxonomico completo entregue como `taxonomic_context_index.json.gz`, servido pelo backend como JSON;
- `package.json` e `render.yaml`.

## O que nao vai para o Render/GitHub

- `.env` e qualquer segredo;
- `.venv`;
- PDFs brutos;
- OCR bruto gigante;
- logs;
- checkpoints;
- pasta local do MinIO;
- licencas, tokens ou chaves.

## Variaveis que devem ser configuradas no Render

Configure em **Environment**:

```text
NODE_ENV=production
GOLD_NEXT_LEVEL_RAG=false
HERPETO_ALLOWED_ORIGIN=https://SEU-SERVICO.onrender.com
HERPETO_ADMIN_EMAIL=seu-email-admin
HERPETO_ADMIN_PASSWORD_HASH=hash-scrypt-gerado-localmente
SPECIESLINK_API_KEY=sua-chave-no-render
IUCN_API_KEY=sua-chave-no-render
```

Para gerar o hash da senha admin:

```powershell
npm run admin:hash
```

Copie apenas o resultado `scrypt:...` para `HERPETO_ADMIN_PASSWORD_HASH`.

## MinIO e dados grandes

O upload local para MinIO ja separou os dados em:

- `herpeto-public`: midias publicas;
- `gold-science`: corpus cientifico pesado e indices completos.

No Render, o site usa os indices necessarios para o funcionamento publico e consulta o cache local versionado. Para integrar MinIO de verdade na versao oficial online, o MinIO precisa estar acessivel pela internet em um servidor proprio ou os objetos precisam ser migrados para um storage S3 compativel publico/privado. O Render nao consegue ler o MinIO que esta apenas no computador de casa.

## Comandos do Render

Build:

```text
npm install
```

Start:

```text
npm start
```

Health check:

```text
/api/biodiversity/local/health
```

## Testes depois do deploy

Abrir:

- `/`
- `/sobre-gold.html`
- `/oikos-fieldbook.html`
- `/sigmai.html`
- `/topotrail.html`
- `/herpetofauna-cruzeiro.html`
- `/admin.html`

Testar no Gold:

- "O que e busca ativa?"
- "Me fale sobre Bothrops"
- "Quais anfibios tem em Cruzeiro?"
- "Como fazer inventario de anuros?"
- "Quais ameacas atingem anfibios na Mata Atlantica?"
