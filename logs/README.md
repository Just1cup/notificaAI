# Logs

Use esta pasta para guardar os arquivos exportados pelo popup da extensao.

Como gerar:

1. Abra o popup da extensao.
2. Clique em `Exportar logs`.
3. Salve o arquivo JSON baixado nesta pasta.
4. Envie esse arquivo junto com a descricao do problema.

Observacao: extensoes Chrome nao podem escrever diretamente na pasta do projeto em tempo de execucao. Por isso os logs ficam em `chrome.storage.local` e sao exportados manualmente pelo popup.
