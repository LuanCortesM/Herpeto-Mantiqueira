# HerpetoMantiqueira + Gold Public Release Candidate

Gerado em: 2026-06-10T18:58:37

## Como abrir localmente

Abra esta pasta com um servidor HTTP simples apontado para `dist/public-release/` e acesse `index.html`.

## Paginas incluidas

- index.html
- sobre-gold.html
- oikos-fieldbook.html
- sigmai.html
- topotrail.html
- herpetofauna-cruzeiro.html

## O que ficou fora

Nao foram incluidos `.env`, `.venv`, testes, scripts cientificos internos, relatorios internos, modelos, PDFs brutos, arquivos experimentais gigantes ou backups.

## Gold

O Gold foi incluido como interface, fluxo JavaScript local, nucleo cientifico ativo e cache municipal empacotado. O pacote nao inclui chaves, PDFs brutos, modelos, arquivos experimentais gigantes ou backend de APIs. Se uma API/backend estiver indisponivel, a interface deve usar o cache local quando aplicavel e informar a data da ultima atualizacao.

## Limitacoes conhecidas

- Validacao visual automatizada ainda precisa ser feita no navegador alvo.
- Testes conversacionais do Gold pelo browser ainda precisam ser executados manualmente em servidor HTTP local.
- Imagens foram reduzidas por copia seletiva; conversao WebP/AVIF nao foi feita nesta build.
