# Guias de uso (documentação animada)

Os guias são SEMPRE em modo claro (mais fácil de ler; não seguem o tema escuro do aparelho). Cada guia é um HTML único (animações em CSS, marca do Credenciei, telas reais com os dados pessoais borrados).
Dentro do sistema: página pública `/guia-<perfil>` e, no menu da foto, o item "Tutorial <perfil>".

| Guia | Arquivo | Link público | Item no menu da foto |
|---|---|---|---|
| Supervisor | `guia-supervisor.html` | `/guia-supervisor` | Tutorial supervisor |
| Operador de portão | `guia-operador-portao.html` | `/guia-operador` | Tutorial operador |
| Encarregado | `guia-encarregado.html` | `/guia-encarregado` | link "Ver o guia do Encarregado" no painel de consulta |
| Administrador | a fazer, em capítulos (A montar o evento, B pessoas e acessos, C dia do evento, D comunicação e controle, E biometria e veículos) | | |

## Vídeo narrado

Cada guia tem um vídeo no topo (`public/videos/guias/guia-<perfil>.mp4`), com a voz do sistema lendo o guia e a tela rolando junto.
Foi gerado com um roteiro por guia (voz `Luciana` do macOS + gravação da própria página + ffmpeg). **Mudou o guia? O vídeo precisa ser refeito**
(roteiros e scripts em `scripts/guias-video/`). Para trocar pela voz de uma pessoa, é só substituir o .mp4.

## Regra de ouro: toda mudança no sistema pede conferência nos guias

Mexeu em tela, botão, fluxo ou regra de um perfil? Abra o guia daquele perfil e atualize o texto (e a imagem, se mudou).
Texto curto: um passo, uma imagem. O usuário não lê até o fim.

## Pendências nos guias por causa de ajustes já feitos no sistema

- **Supervisor**: depoimentos (feito em 08/10/2026) e botão do evento no topo (feito). Falta: "Criar Encarregado" agora pede o evento e filtra por setor.
- **Operador de portão**: em dia. Conferir se o scanner ou o Registrar ponto mudarem.
- **Encarregado**: guia pronto (08/10/2026). Conferir se a tela de consulta mudar ou quando o modelo de WhatsApp do Encarregado for aprovado (o texto da mensagem no guia é ilustrativo).
- **Administrador** (a criar) deve cobrir: botão do evento no topo e "Trocar de perfil"; mais de uma função por CPF; Gestor de credenciamento por organização; "Tirar do setor" (não apaga a conta); excluir a conta só em Acessos, só o master; regra de aviso (não repete mensagem para o mesmo supervisor no mesmo evento); contagem do supervisor como pessoa do setor.
