# WhatsApp Sound Notify

Extensao Chrome/Brave Manifest V3 para tocar um som personalizado quando uma nova mensagem recebida aparece no WhatsApp Web.

## Recursos

- Funciona somente em `https://web.whatsapp.com/*`.
- Permite escolher um arquivo de audio local.
- Salva as preferencias em `chrome.storage.local`.
- Salva o arquivo de audio localmente no IndexedDB da propria extensao.
- Permite ativar/desativar a extensao.
- Permite testar o som pelo popup.
- Permite pausar o audio em execucao.
- Permite controlar o volume.
- Permite escolher por quantos segundos o som toca.
- Usa `MutationObserver` no content script para detectar mensagens recebidas.
- Revalida os observers a cada 30 segundos para manter o monitoramento ativo sem recarregar a pagina.
- Usa um offscreen document do Manifest V3 para reproduzir audio fora da pagina do WhatsApp.
- Guarda logs locais para depuracao e permite exportar um JSON pelo popup.
- Nao le, coleta, envia ou armazena o conteudo das mensagens.

## Instalar no Chrome ou Brave

1. Abra `chrome://extensions`.
2. Ative `Modo do desenvolvedor`.
3. Clique em `Carregar sem compactacao`.
4. Selecione esta pasta do projeto.
5. Abra `https://web.whatsapp.com/`.
6. Clique no icone da extensao e escolha um arquivo de audio.
7. Use `Testar` para confirmar o volume.
8. Ajuste a duracao. O padrao e 10 segundos.

## Debug

1. Abra o popup da extensao.
2. Reproduza o problema: escolha audio, teste o som ou aguarde uma mensagem.
3. Clique em `Exportar logs`.
4. Salve o JSON baixado em `logs/`.

Os logs registram eventos tecnicos da extensao, como selecao de arquivo, salvamento local, deteccao de mensagem e tentativa de reproducao. O conteudo das mensagens do WhatsApp nao e lido nem gravado.

## Monitoramento

A extensao nao recarrega o WhatsApp Web a cada 30 segundos. Em vez disso, ela usa um watchdog interno a cada 30 segundos para revalidar os observers do DOM, o contador do titulo e os badges de mensagens nao lidas da lista lateral.

Essa abordagem e melhor que `location.reload()` porque nao interrompe digitacao, chamadas, login, carregamento de midia nem o estado visual da conversa aberta.

## Observacoes

- Use arquivos de audio de ate 50 MB.
- A duracao pode ficar entre 1 e 120 segundos.
- Se o WhatsApp Web mudar sua estrutura interna, o detector pode precisar de ajuste.
- O primeiro carregamento de uma conversa e tratado como historico para evitar sons indevidos.
