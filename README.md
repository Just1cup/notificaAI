# WhatsApp Sound Notify

Extensao Chrome/Brave Manifest V3 para tocar um som personalizado quando uma nova mensagem recebida aparece no WhatsApp Web.

## Recursos

- Funciona somente em `https://web.whatsapp.com/*`.
- Permite escolher um arquivo de audio local.
- Salva o audio e as preferencias em `chrome.storage.local`.
- Permite ativar/desativar a extensao.
- Permite testar o som pelo popup.
- Permite controlar o volume.
- Usa `MutationObserver` no content script para detectar mensagens recebidas.
- Nao le, coleta, envia ou armazena o conteudo das mensagens.

## Instalar no Chrome ou Brave

1. Abra `chrome://extensions`.
2. Ative `Modo do desenvolvedor`.
3. Clique em `Carregar sem compactacao`.
4. Selecione esta pasta do projeto.
5. Abra `https://web.whatsapp.com/`.
6. Clique no icone da extensao e escolha um arquivo de audio.
7. Use `Testar` para confirmar o volume.

## Observacoes

- Use arquivos de audio de ate 4 MB.
- Se o WhatsApp Web mudar sua estrutura interna, o detector pode precisar de ajuste.
- O primeiro carregamento de uma conversa e tratado como historico para evitar sons indevidos.
