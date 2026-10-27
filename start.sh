#!/usr/bin/env bash

# ==============================================================================
# SupoClip - Script de Gerenciamento e Configurador Interativo
# ==============================================================================

set -eo pipefail

CWD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$CWD"

# Cores e Estilos
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Detectar comando docker compose
if docker compose version &> /dev/null; then
    COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE="docker-compose"
else
    echo -e "${RED}Erro: Docker Compose não foi encontrado no sistema.${NC}"
    exit 1
fi

print_header() {
    echo -e "${CYAN}=====================================================${NC}"
    echo -e "${BOLD}       🎬 SupoClip - AI Video Clipper Local          ${NC}"
    echo -e "${CYAN}=====================================================${NC}"
    echo ""
}

check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}Erro: O Docker não está rodando. Inicie o Docker e tente novamente.${NC}"
        exit 1
    fi
}

load_env() {
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            echo -e "${YELLOW}Arquivo .env não encontrado. Criando a partir de .env.example...${NC}"
            cp .env.example .env
        else
            echo -e "${RED}Erro: Arquivo .env não encontrado!${NC}"
            exit 1
        fi
    fi
    set -a
    # shellcheck disable=SC1091
    source <(grep -v '^\s*#' .env | grep -E '^[A-Za-z0-9_]+=')
    set +a
}

update_env_var() {
    local key="$1"
    local value="$2"
    python3 -c "
import sys
key = sys.argv[1]
val = sys.argv[2]
with open('.env', 'r') as f:
    lines = f.readlines()
found = False
new_lines = []
for line in lines:
    if line.strip().startswith(f'{key}='):
        new_lines.append(f'{key}={val}\n')
        found = True
    else:
        new_lines.append(line)
if not found:
    new_lines.append(f'{key}={val}\n')
with open('.env', 'w') as f:
    f.writelines(new_lines)
" "$key" "$value"
}

check_llm() {
    if [[ "${LLM:-}" == google* ]]; then
        local model_name="${LLM#*:}"
        echo -e "${BLUE}ℹ LLM configurado:${NC} Google Gemini (${BOLD}${model_name}${NC})"
        if [ -z "${GOOGLE_API_KEY:-}" ]; then
            echo -e "  ${YELLOW}⚠ GOOGLE_API_KEY não configurada no .env.${NC}"
            echo -e "    Gere sua chave em: ${BOLD}https://aistudio.google.com/apikey${NC}"
        else
            local status_code
            status_code=$(curl -s -o /dev/null -w "%{http_code}" -m 3 "https://generativelanguage.googleapis.com/v1beta/models?key=${GOOGLE_API_KEY}" || echo "000")
            if [ "$status_code" = "200" ]; then
                echo -e "  ${GREEN}✓ Chave Google Gemini conectada e validada.${NC}"
            elif [ "$status_code" = "400" ] || [ "$status_code" = "403" ]; then
                echo -e "  ${RED}✗ Chave GOOGLE_API_KEY inválida ou sem permissão (HTTP $status_code).${NC}"
            else
                echo -e "  ${YELLOW}ℹ Chave configurada (status: HTTP $status_code).${NC}"
            fi
        fi
    elif [[ "${LLM:-}" == ollama:* ]]; then
        local model_name="${LLM#ollama:}"
        echo -e "${BLUE}ℹ LLM configurado:${NC} Ollama Local (${BOLD}${model_name}${NC})"
        
        if curl -s -m 2 http://localhost:11434/api/tags > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓ Instância local do Ollama ativa na porta 11434.${NC}"
            local base_model="${model_name%:latest}"
            if curl -s http://localhost:11434/api/tags | grep -q "\"$model_name\"" || \
               curl -s http://localhost:11434/api/tags | grep -q "\"$base_model:latest\""; then
                echo -e "  ${GREEN}✓ Modelo '${model_name}' pronto no Ollama.${NC}"
            else
                echo -e "  ${YELLOW}⚠ Modelo '${model_name}' não encontrado no Ollama.${NC}"
                echo -e "    Baixe com: ${BOLD}ollama pull ${model_name}${NC}"
            fi
        else
            echo -e "  ${YELLOW}⚠ Não foi possível conectar ao Ollama em http://localhost:11434.${NC}"
        fi
    elif [ -n "${LLM:-}" ]; then
        echo -e "${BLUE}ℹ LLM configurado:${NC} ${LLM}"
    fi

    local trans_provider="${TRANSCRIPTION_PROVIDER:-whisper}"
    if [ "$trans_provider" = "whisper" ]; then
        echo -e "${BLUE}ℹ Transcrição:${NC} ${BOLD}Whisper Local${NC} (Modelo: ${WHISPER_MODEL_SIZE:-base})"
    elif [ "$trans_provider" = "assemblyai" ]; then
        echo -e "${BLUE}ℹ Transcrição:${NC} AssemblyAI Cloud"
    fi
    echo ""
}

get_tunnel_url() {
    if docker ps --format '{{.Names}}' | grep -q "^supoclip-tunnel$"; then
        docker logs supoclip-tunnel 2>&1 | grep -o 'https://[-a-zA-Z0-9]*\.trycloudflare\.com' | tail -n 1 || true
    fi
}

check_social() {
    local yt_set="${YOUTUBE_OAUTH_CLIENT_ID:-}"
    local tt_set="${TIKTOK_CLIENT_KEY:-}"
    local ig_set="${INSTAGRAM_APP_ID:-}"
    local tunnel_url
    tunnel_url="$(get_tunnel_url)"

    echo -e "${MAGENTA}=====================================================${NC}"
    echo -e "${BOLD}       📱 Status de Redes Sociais & Publicação       ${NC}"
    echo -e "${MAGENTA}=====================================================${NC}"
    
    # YouTube
    if [ -n "$yt_set" ]; then
        echo -e "  ▶️  ${BOLD}YouTube Shorts:${NC}  ${GREEN}✓ Configurado${NC} (${yt_set:0:12}...)"
    else
        echo -e "  ▶️  ${BOLD}YouTube Shorts:${NC}  ${YELLOW}⚠ Não configurado${NC}"
    fi

    # TikTok
    if [ -n "$tt_set" ]; then
        echo -e "  🎵 ${BOLD}TikTok:${NC}          ${GREEN}✓ Configurado${NC} (${tt_set:0:12}...)"
    else
        echo -e "  🎵 ${BOLD}TikTok:${NC}          ${YELLOW}⚠ Não configurado${NC}"
    fi

    # Instagram
    if [ -n "$ig_set" ]; then
        echo -e "  📸 ${BOLD}Instagram Reels:${NC} ${GREEN}✓ Configurado${NC} (${ig_set:0:12}...)"
    else
        echo -e "  📸 ${BOLD}Instagram Reels:${NC} ${YELLOW}⚠ Não configurado${NC}"
    fi

    # Túnel HTTPS
    if [ -n "$tunnel_url" ]; then
        echo -e "  🌐 ${BOLD}Túnel HTTPS:${NC}     ${GREEN}✓ Ativo${NC} -> ${CYAN}${tunnel_url}${NC}"
    else
        echo -e "  🌐 ${BOLD}Túnel HTTPS:${NC}     ${YELLOW}○ Inativo${NC} (necessário p/ TikTok e Instagram)"
    fi
    echo -e "${MAGENTA}=====================================================${NC}"
    echo ""
}

tunnel_start() {
    echo -e "${CYAN}Iniciando túnel Cloudflare seguro (HTTPS público)...${NC}"
    $COMPOSE --profile tunnel up -d tunnel
    echo -e "Aguardando obtenção da URL pública..."
    local count=0
    local tunnel_url=""
    while [ $count -lt 15 ]; do
        sleep 1
        tunnel_url="$(get_tunnel_url)"
        if [ -n "$tunnel_url" ]; then
            break
        fi
        count=$((count + 1))
    done

    if [ -n "$tunnel_url" ]; then
        echo -e "${GREEN}✓ Túnel HTTPS ativo com sucesso!${NC}"
        echo -e "  URL Pública: ${BOLD}${CYAN}${tunnel_url}${NC}"
        
        # Atualizar variáveis no .env
        update_env_var "SOCIAL_OAUTH_REDIRECT_BASE_URL" "$tunnel_url"
        update_env_var "SOCIAL_PUBLIC_MEDIA_BASE_URL" "$tunnel_url"
        
        echo -e "${BLUE}Atualizando serviços backend e worker com as novas URLs...${NC}"
        $COMPOSE up -d backend worker
        echo -e "${GREEN}✓ Serviços sincronizados com a URL pública!${NC}"
    else
        echo -e "${RED}Erro: Não foi possível obter a URL do túnel em tempo hábil.${NC}"
        echo -e "Verifique os logs com: ${YELLOW}docker logs supoclip-tunnel${NC}"
    fi
}

tunnel_stop() {
    echo -e "${YELLOW}Parando contêiner do túnel Cloudflare...${NC}"
    docker stop supoclip-tunnel > /dev/null 2>&1 || true
    docker rm supoclip-tunnel > /dev/null 2>&1 || true
    update_env_var "SOCIAL_OAUTH_REDIRECT_BASE_URL" ""
    update_env_var "SOCIAL_PUBLIC_MEDIA_BASE_URL" ""
    $COMPOSE up -d backend worker > /dev/null 2>&1 || true
    echo -e "${GREEN}✓ Túnel desativado e URLs restauradas para o padrão local.${NC}"
}


show_urls() {
    local frontend_port="${FRONTEND_PORT:-3107}"
    echo ""
    echo -e "${CYAN}=====================================================${NC}"
    echo -e "${BOLD}              Serviços Prontos para Uso              ${NC}"
    echo -e "${CYAN}=====================================================${NC}"
    echo -e "  🌐 ${BOLD}Frontend Web:${NC}     ${GREEN}http://localhost:${frontend_port}${NC}"
    echo -e "  ⚙️  ${BOLD}Backend API:${NC}      ${GREEN}http://localhost:8000${NC}"
    echo -e "  📚 ${BOLD}Docs Swagger:${NC}     ${GREEN}http://localhost:8000/docs${NC}"
    echo -e "  🤖 ${BOLD}MCP Server:${NC}       ${GREEN}http://localhost:9100${NC}"
    echo -e "${CYAN}=====================================================${NC}"
    echo ""
    echo -e "${BOLD}Comandos rápidos:${NC}"
    echo -e "  - Acompanhar logs de processamento: ${YELLOW}./start.sh logs worker${NC}"
    echo -e "  - Abrir seletor de configurações:  ${YELLOW}./start.sh config${NC}"
    echo -e "  - Ver status dos contêineres:       ${YELLOW}./start.sh status${NC}"
    echo -e "  - Parar os serviços:                ${YELLOW}./start.sh stop${NC}"
    echo ""
}

start_app() {
    local build_flag=""
    if [ "$1" = "--build" ] || [ "$1" = "-b" ]; then
        build_flag="--build"
        echo -e "${YELLOW}Recompilando imagens dos contêineres...${NC}"
    fi

    echo -e "${GREEN}Iniciando serviços do SupoClip...${NC}"
    # shellcheck disable=SC2086
    $COMPOSE up -d $build_flag

    echo ""
    echo -e "${CYAN}Aguardando os serviços inicializarem...${NC}"
    sleep 3

    show_urls
}

stop_app() {
    echo -e "${YELLOW}Parando contêineres do SupoClip...${NC}"
    $COMPOSE stop
    echo -e "${GREEN}Contêineres parados com sucesso!${NC}"
}

down_app() {
    echo -e "${YELLOW}Removendo contêineres do SupoClip (volumes mantidos)...${NC}"
    $COMPOSE down
    echo -e "${GREEN}Ambiente desligado com sucesso!${NC}"
}

restart_app() {
    echo -e "${YELLOW}Reiniciando SupoClip com novas configurações...${NC}"
    $COMPOSE up -d backend worker
    show_urls
}

status_app() {
    echo -e "${BOLD}Status dos Contêineres:${NC}"
    $COMPOSE ps
    echo ""
    show_urls
}

logs_app() {
    local service="${1:-}"
    if [ -n "$service" ]; then
        echo -e "${BLUE}Exibindo logs do serviço: ${BOLD}${service}${NC}"
        $COMPOSE logs -f "$service"
    else
        $COMPOSE logs -f
    fi
}

# ==============================================================================
# CONFIGURADOR INTERATIVO
# ==============================================================================
configure_wizard() {
    load_env
    echo -e "${MAGENTA}=====================================================${NC}"
    echo -e "${BOLD}      🛠️  Seletor de Configurações do SupoClip       ${NC}"
    echo -e "${MAGENTA}=====================================================${NC}"
    echo ""
    echo -e "${BOLD}Configuração Atual:${NC}"
    echo -e "  • LLM de Seleção:   ${CYAN}${LLM:-Nenhum}${NC}"
    echo -e "  • Transcrição:      ${CYAN}${TRANSCRIPTION_PROVIDER:-whisper} (${WHISPER_MODEL_SIZE:-base})${NC}"
    echo -e "  • Duração Clipes:   ${CYAN}${MIN_CLIP_DURATION:-60}s a ${MAX_CLIP_DURATION:-90}s (mín: ${MIN_CLIP_DURATION:-60}s)${NC}"
    echo ""

    # --- PASSO 1: Selecionar Provedor de LLM ---
    echo -e "${BOLD}[1/3] Escolha o Provedor de IA (LLM para Cortes de Vídeo):${NC}"
    echo -e "  ${GREEN}1)${NC} Google Gemini (Recomendado: Rápido e gratuito via API)"
    echo -e "  ${GREEN}2)${NC} Ollama Local (100% privado no seu hardware)"
    echo -e "  ${GREEN}3)${NC} Manter atual (${LLM:-não definido})"
    echo ""
    read -r -p "Selecione uma opção [1-3] (padrão: 1): " llm_choice
    llm_choice="${llm_choice:-1}"

    local chosen_llm="$LLM"
    case "$llm_choice" in
        1)
            echo ""
            echo -e "${BOLD}Selecione o Modelo Gemini:${NC}"
            echo -e "  1) gemini-3.1-flash-lite  (Recomendado: Ultra-rápido ~2s, sem timeout)"
            echo -e "  2) gemini-3.8-flash       (Modelo avançado de última geração)"
            echo -e "  3) gemini-3.7-flash       (Alta precisão e estabilidade)"
            echo -e "  4) Digitar outro modelo"
            read -r -p "Modelo [1-4] (padrão: 1): " gemini_choice
            gemini_choice="${gemini_choice:-1}"
            case "$gemini_choice" in
                1) chosen_llm="google-gla:gemini-3.1-flash-lite" ;;
                2) chosen_llm="google-gla:gemini-3.8-flash" ;;
                3) chosen_llm="google-gla:gemini-3.7-flash" ;;
                4)
                    read -r -p "Digite o identificador do modelo (ex: gemini-3.1-flash-lite): " custom_gemini
                    chosen_llm="google-gla:${custom_gemini}"
                    ;;
            esac

            # Verificar chave do Google
            if [ -n "${GOOGLE_API_KEY:-}" ]; then
                echo -e "${BLUE}Chave Google detectada:${NC} ${GOOGLE_API_KEY:0:8}...${GOOGLE_API_KEY: -4}"
                read -r -p "Deseja manter esta chave? (S/n): " keep_key
                keep_key="${keep_key:-s}"
                if [[ "$keep_key" =~ ^[Nn] ]]; then
                    read -r -p "Cole sua nova chave GOOGLE_API_KEY: " new_key
                    if [ -n "$new_key" ]; then
                        update_env_var "GOOGLE_API_KEY" "$new_key"
                    fi
                fi
            else
                read -r -p "Cole sua chave GOOGLE_API_KEY (Google AI Studio): " new_key
                if [ -n "$new_key" ]; then
                    update_env_var "GOOGLE_API_KEY" "$new_key"
                fi
            fi
            ;;
        2)
            echo ""
            echo -e "${BOLD}Modelos disponíveis no seu Ollama local:${NC}"
            local ollama_models=()
            if curl -s -m 2 http://localhost:11434/api/tags > /dev/null 2>&1; then
                while IFS= read -r line; do
                    [ -n "$line" ] && ollama_models+=("$line")
                done < <(python3 -c '
import json, urllib.request
try:
    with urllib.request.urlopen("http://localhost:11434/api/tags", timeout=2) as resp:
        data = json.load(resp)
        for m in data.get("models", []):
            name = m.get("name", "")
            if "embed" not in name:
                print(name)
except Exception:
    pass
')
            fi

            if [ ${#ollama_models[@]} -gt 0 ]; then
                local idx=1
                for m in "${ollama_models[@]}"; do
                    echo -e "  $idx) $m"
                    idx=$((idx + 1))
                done
                echo -e "  $idx) Digitar outro modelo"
                read -r -p "Selecione o modelo [1-$idx] (padrão: 1): " o_choice
                o_choice="${o_choice:-1}"
                if [ "$o_choice" -le "${#ollama_models[@]}" ] 2>/dev/null; then
                    chosen_llm="ollama:${ollama_models[$((o_choice - 1))]}"
                else
                    read -r -p "Digite o nome do modelo (ex: llama3.2:latest): " custom_ollama
                    chosen_llm="ollama:${custom_ollama}"
                fi
            else
                echo -e "${YELLOW}Nenhum modelo do Ollama detectado na porta 11434.${NC}"
                read -r -p "Digite o modelo desejado (ex: llama3.2:latest): " custom_ollama
                custom_ollama="${custom_ollama:-llama3.2:latest}"
                chosen_llm="ollama:${custom_ollama}"
            fi

            update_env_var "OLLAMA_BASE_URL" "http://host.docker.internal:11434/v1"
            ;;
        3)
            echo "Mantendo LLM atual."
            ;;
    esac

    update_env_var "LLM" "$chosen_llm"
    update_env_var "RERANK_LLM" "$chosen_llm"

    # --- PASSO 2: Selecionar Provedor de Transcrição ---
    echo ""
    echo -e "${BOLD}[2/3] Escolha o Provedor de Transcrição de Áudio:${NC}"
    echo -e "  ${GREEN}1)${NC} Whisper Local (100% gratuito e privado no host)"
    echo -e "  ${GREEN}2)${NC} AssemblyAI Cloud (Requer ASSEMBLY_AI_API_KEY)"
    echo -e "  ${GREEN}3)${NC} Manter atual (${TRANSCRIPTION_PROVIDER:-whisper})"
    read -r -p "Selecione [1-3] (padrão: 1): " trans_choice
    trans_choice="${trans_choice:-1}"

    case "$trans_choice" in
        1)
            update_env_var "TRANSCRIPTION_PROVIDER" "whisper"
            echo ""
            echo -e "${BOLD}Tamanho do Modelo Whisper (precisão vs velocidade):${NC}"
            echo -e "  1) base    (Recomendado para CPU: rápido e boa precisão)"
            echo -e "  2) small   (Equilíbrio ideal se tiver bom processador)"
            echo -e "  3) tiny    (Ultrarrápido, menor precisão)"
            echo -e "  4) medium  (Mais pesado e preciso)"
            read -r -p "Modelo Whisper [1-4] (padrão: 1): " w_choice
            w_choice="${w_choice:-1}"
            case "$w_choice" in
                1) update_env_var "WHISPER_MODEL_SIZE" "base" ;;
                2) update_env_var "WHISPER_MODEL_SIZE" "small" ;;
                3) update_env_var "WHISPER_MODEL_SIZE" "tiny" ;;
                4) update_env_var "WHISPER_MODEL_SIZE" "medium" ;;
            esac
            ;;
        2)
            update_env_var "TRANSCRIPTION_PROVIDER" "assemblyai"
            read -r -p "Cole sua ASSEMBLY_AI_API_KEY: " aai_key
            if [ -n "$aai_key" ]; then
                update_env_var "ASSEMBLY_AI_API_KEY" "$aai_key"
            fi
            ;;
        3)
            echo "Mantendo provedor de transcrição atual."
            ;;
    esac

    # --- PASSO 3: Configurar Duração dos Clipes ---
    echo ""
    echo -e "${BOLD}[3/3] Escolha a Duração dos Vídeos/Cortes:${NC}"
    echo -e "  ${GREEN}1)${NC} Pelo menos 1 minuto: 60s a 90s (Recomendado para Reels, Shorts e TikTok)"
    echo -e "  ${GREEN}2)${NC} Longos: 60s a 120s (1 a 2 minutos com mais contexto)"
    echo -e "  ${GREEN}3)${NC} Curtos: 30s a 60s (Formato curto tradicional)"
    echo -e "  ${GREEN}4)${NC} Personalizado (Digitar duração mínima e máxima em segundos)"
    echo -e "  ${GREEN}5)${NC} Manter atual (${MIN_CLIP_DURATION:-60}s a ${MAX_CLIP_DURATION:-90}s)"
    read -r -p "Selecione [1-5] (padrão: 1): " dur_choice
    dur_choice="${dur_choice:-1}"

    case "$dur_choice" in
        1)
            update_env_var "MIN_CLIP_DURATION" "60"
            update_env_var "MAX_CLIP_DURATION" "90"
            update_env_var "IDEAL_CLIP_MIN_DURATION" "60"
            update_env_var "IDEAL_CLIP_MAX_DURATION" "90"
            update_env_var "CLIP_DURATION" "60"
            ;;
        2)
            update_env_var "MIN_CLIP_DURATION" "60"
            update_env_var "MAX_CLIP_DURATION" "120"
            update_env_var "IDEAL_CLIP_MIN_DURATION" "60"
            update_env_var "IDEAL_CLIP_MAX_DURATION" "120"
            update_env_var "CLIP_DURATION" "60"
            ;;
        3)
            update_env_var "MIN_CLIP_DURATION" "30"
            update_env_var "MAX_CLIP_DURATION" "60"
            update_env_var "IDEAL_CLIP_MIN_DURATION" "30"
            update_env_var "IDEAL_CLIP_MAX_DURATION" "60"
            update_env_var "CLIP_DURATION" "30"
            ;;
        4)
            read -r -p "Duração mínima em segundos (ex: 60): " custom_min
            custom_min="${custom_min:-60}"
            read -r -p "Duração máxima em segundos (ex: 90): " custom_max
            custom_max="${custom_max:-90}"
            update_env_var "MIN_CLIP_DURATION" "$custom_min"
            update_env_var "MAX_CLIP_DURATION" "$custom_max"
            update_env_var "IDEAL_CLIP_MIN_DURATION" "$custom_min"
            update_env_var "IDEAL_CLIP_MAX_DURATION" "$custom_max"
            update_env_var "CLIP_DURATION" "$custom_min"
            ;;
        5)
            echo "Mantendo duração atual."
            ;;
    esac

    # Recarregar ambiente atualizado
    load_env

    echo ""
    echo -e "${GREEN}=====================================================${NC}"
    echo -e "${BOLD}         ✓ Configurações salvas no .env!            ${NC}"
    echo -e "${GREEN}=====================================================${NC}"
    echo -e "  • LLM:          ${CYAN}${LLM}${NC}"
    echo -e "  • Transcrição:  ${CYAN}${TRANSCRIPTION_PROVIDER} (Modelo: ${WHISPER_MODEL_SIZE:-base})${NC}"
    echo -e "  • Duração:      ${CYAN}${MIN_CLIP_DURATION:-60}s a ${MAX_CLIP_DURATION:-90}s (mínimo: ${MIN_CLIP_DURATION:-60}s)${NC}"
    echo ""

    read -r -p "Deseja iniciar/reiniciar os serviços do SupoClip agora? (S/n): " run_now
    run_now="${run_now:-s}"
    if [[ "$run_now" =~ ^[Ss] ]]; then
        echo ""
        check_llm
        $COMPOSE up -d backend worker frontend mcp postgres redis
        show_urls
    fi
}

social_wizard() {
    load_env
    while true; do
        print_header
        check_social

        local redirect_base="${SOCIAL_OAUTH_REDIRECT_BASE_URL:-http://localhost:${FRONTEND_PORT:-3107}}"
        local tunnel_url
        tunnel_url="$(get_tunnel_url)"
        if [ -n "$tunnel_url" ]; then
            redirect_base="$tunnel_url"
        fi

        echo -e "${BOLD}Gerenciador de Redes Sociais:${NC}"
        echo -e "  ${GREEN}1)${NC} Configurar YouTube Shorts (Google Cloud OAuth)"
        echo -e "  ${GREEN}2)${NC} Configurar TikTok (TikTok Developers API)"
        echo -e "  ${GREEN}3)${NC} Configurar Instagram Reels (Meta Developers API)"
        if [ -n "$tunnel_url" ]; then
            echo -e "  ${YELLOW}4)${NC} Desativar Túnel HTTPS Cloudflare"
        else
            echo -e "  ${CYAN}4)${NC} Iniciar Túnel HTTPS Cloudflare (necessário p/ TikTok & Instagram)"
        fi
        echo -e "  ${BLUE}5)${NC} Exibir URLs exatas de Callback para cadastrar nos portais"
        echo -e "  ${RED}6)${NC} Voltar ao menu principal"
        echo ""
        read -r -p "Selecione uma opção [1-6]: " opt_soc
        echo ""

        case "$opt_soc" in
            1)
                echo -e "${CYAN}=== Configuração do YouTube Shorts (Google Cloud) ===${NC}"
                echo -e "1. Acesse: ${BOLD}https://console.cloud.google.com/apis/credentials${NC}"
                echo -e "2. Crie ou selecione um projeto e ative a biblioteca: ${BOLD}YouTube Data API v3${NC}"
                echo -e "3. Em ${BOLD}Tela de consentimento OAuth${NC} (OAuth consent screen):"
                echo -e "   - Tipo de usuário: ${BOLD}Externo${NC}"
                echo -e "   - ${YELLOW}IMPORTANTE:${NC} Em ${BOLD}Usuários de teste${NC} (Test users), clique em ${BOLD}+ ADD USERS${NC}"
                echo -e "     e adicione o seu endereço de e-mail Google para evitar o erro 403 access_denied."
                echo -e "4. Em Credenciais -> Criar Credenciais -> ${BOLD}ID do cliente OAuth${NC}:"
                echo -e "   - Tipo de aplicativo: ${BOLD}Aplicativo da Web (Web application)${NC}"
                echo -e "   - URIs de redirecionamento autorizados adicione:"
                echo -e "     ${BOLD}${redirect_base}/api/social/callback/youtube${NC}"
                echo ""
                read -r -p "Cole seu YOUTUBE_OAUTH_CLIENT_ID: " yt_id
                if [ -n "$yt_id" ]; then
                    update_env_var "YOUTUBE_OAUTH_CLIENT_ID" "$yt_id"
                fi
                read -r -p "Cole seu YOUTUBE_OAUTH_CLIENT_SECRET: " yt_secret
                if [ -n "$yt_secret" ]; then
                    update_env_var "YOUTUBE_OAUTH_CLIENT_SECRET" "$yt_secret"
                fi
                update_env_var "SOCIAL_PUBLISHING_ACCESS" "all"
                $COMPOSE up -d backend worker > /dev/null 2>&1 || true
                echo -e "${GREEN}✓ Credenciais do YouTube salvas e serviços atualizados!${NC}"
                echo -e "${BLUE}Dica:${NC} Na primeira autenticação, clique em ${BOLD}Avançado -> Acessar (não seguro)${NC} no Google."
                read -r -p "Pressione Enter para continuar..." _
                ;;
            2)
                echo -e "${CYAN}=== Configuração do TikTok (TikTok for Developers) ===${NC}"
                if [ -z "$tunnel_url" ]; then
                    echo -e "${YELLOW}Aviso: O TikTok exige uma URL de redirecionamento HTTPS.${NC}"
                    echo -e "Recomenda-se iniciar o túnel na opção 4 antes de registrar o app.${NC}"
                    echo ""
                fi
                echo -e "1. Acesse: ${BOLD}https://developers.tiktok.com/${NC}"
                echo -e "2. Crie um app e adicione os produtos ${BOLD}Login Kit${NC} e ${BOLD}Content Posting API${NC}"
                echo -e "3. Em Redirect URI insira:"
                echo -e "   ${BOLD}${redirect_base}/api/social/callback/tiktok${NC}"
                echo ""
                read -r -p "Cole seu TIKTOK_CLIENT_KEY: " tt_key
                if [ -n "$tt_key" ]; then
                    update_env_var "TIKTOK_CLIENT_KEY" "$tt_key"
                fi
                read -r -p "Cole seu TIKTOK_CLIENT_SECRET: " tt_secret
                if [ -n "$tt_secret" ]; then
                    update_env_var "TIKTOK_CLIENT_SECRET" "$tt_secret"
                fi
                update_env_var "SOCIAL_PUBLISHING_ACCESS" "all"
                $COMPOSE up -d backend worker > /dev/null 2>&1 || true
                echo -e "${GREEN}✓ Credenciais do TikTok salvas e serviços atualizados!${NC}"
                read -r -p "Pressione Enter para continuar..." _
                ;;
            3)
                echo -e "${CYAN}=== Configuração do Instagram Reels (Meta Developers) ===${NC}"
                if [ -z "$tunnel_url" ]; then
                    echo -e "${YELLOW}Aviso: A Meta exige HTTPS e URL pública para download do vídeo.${NC}"
                    echo -e "Inicie o túnel na opção 4 antes de cadastrar ou publicar.${NC}"
                    echo ""
                fi
                echo -e "1. Acesse: ${BOLD}https://developers.facebook.com/apps${NC}"
                echo -e "2. Crie um app do tipo Empresa/Business com ${BOLD}Instagram API with Instagram Login${NC}"
                echo -e "3. Em Configurações de Redirecionamento de Login, insira:"
                echo -e "   ${BOLD}${redirect_base}/api/social/callback/instagram${NC}"
                echo ""
                read -r -p "Cole seu INSTAGRAM_APP_ID: " ig_id
                if [ -n "$ig_id" ]; then
                    update_env_var "INSTAGRAM_APP_ID" "$ig_id"
                fi
                read -r -p "Cole seu INSTAGRAM_APP_SECRET: " ig_secret
                if [ -n "$ig_secret" ]; then
                    update_env_var "INSTAGRAM_APP_SECRET" "$ig_secret"
                fi
                update_env_var "SOCIAL_PUBLISHING_ACCESS" "all"
                $COMPOSE up -d backend worker > /dev/null 2>&1 || true
                echo -e "${GREEN}✓ Credenciais do Instagram salvas e serviços atualizados!${NC}"
                read -r -p "Pressione Enter para continuar..." _
                ;;
            4)
                if [ -n "$tunnel_url" ]; then
                    tunnel_stop
                else
                    tunnel_start
                fi
                read -r -p "Pressione Enter para continuar..." _
                ;;
            5)
                echo -e "${CYAN}=== URLs de Callback para cada Rede Social ===${NC}"
                echo -e "Base URL ativa: ${BOLD}${redirect_base}${NC}"
                echo ""
                echo -e "  ▶️  ${BOLD}YouTube:${NC}   ${redirect_base}/api/social/callback/youtube"
                echo -e "  🎵 ${BOLD}TikTok:${NC}    ${redirect_base}/api/social/callback/tiktok"
                echo -e "  📸 ${BOLD}Instagram:${NC} ${redirect_base}/api/social/callback/instagram"
                echo ""
                echo -e "Configure essas URLs exatas no painel de desenvolvedor de cada provedor."
                echo ""
                read -r -p "Pressione Enter para voltar..." _
                ;;
            6|q|Q)
                break
                ;;
            *)
                echo -e "${YELLOW}Opção inválida.${NC}"
                sleep 1
                ;;
        esac
    done
}

# --- Execução Principal ---
print_header
check_docker
load_env

case "${1:-}" in
    config|--config|-c|setup)
        configure_wizard
        ;;
    social|--social|-s)
        social_wizard
        ;;
    tunnel)
        case "${2:-status}" in
            start|up)
                tunnel_start
                ;;
            stop|down)
                tunnel_stop
                ;;
            status)
                t_url="$(get_tunnel_url)"
                if [ -n "$t_url" ]; then
                    echo -e "Túnel HTTPS Ativo: ${GREEN}${t_url}${NC}"
                else
                    echo -e "Túnel HTTPS Inativo."
                fi
                ;;
            *)
                echo -e "Uso: ${BOLD}./start.sh tunnel [start|stop|status]${NC}"
                ;;
        esac
        ;;
    stop)
        stop_app
        ;;
    down)
        down_app
        ;;
    restart)
        restart_app
        ;;
    status)
        status_app
        ;;
    logs)
        logs_app "${2:-}"
        ;;
    help|--help|-h)
        echo -e "Uso: ${BOLD}./start.sh [comando]${NC}"
        echo ""
        echo "Comandos disponíveis:"
        echo "  (sem argumentos)   Inicia o SupoClip com menu de inicialização rápida"
        echo "  config, -c         Abre o seletor/configurador interativo de IA e modelos"
        echo "  social, -s         Abre o assistente de conexão de redes sociais e túnel HTTPS"
        echo "  tunnel [start|stop] Inicia ou encerra o túnel público HTTPS Cloudflare"
        echo "  --build, -b        Recompila as imagens antes de iniciar"
        echo "  stop               Para os contêineres sem remover dados"
        echo "  down               Desliga contêineres (volumes mantidos)"
        echo "  restart            Reinicia os serviços aplicando novas configs"
        echo "  status             Exibe o status de saúde dos contêineres"
        echo "  logs [serviço]     Acompanha logs (ex: ./start.sh logs worker)"
        echo "  help               Exibe esta mensagem de ajuda"
        ;;
    --build|-b)
        check_llm
        start_app "--build"
        ;;
    *)
        # Modo padrão interativo ao rodar ./start.sh
        check_llm
        if [ -t 0 ]; then
            echo -e "${BOLD}Escolha uma ação:${NC}"
            echo -e "  ${GREEN}1)${NC} Iniciar serviços com a configuração atual"
            echo -e "  ${YELLOW}2)${NC} Configurador de IA e Transcrição (Gemini / Ollama / Whisper)"
            echo -e "  ${MAGENTA}3)${NC} Conectar Redes Sociais (YouTube, TikTok, Instagram & Túnel HTTPS)"
            echo -e "  ${RED}4)${NC} Sair"
            echo ""
            read -r -t 8 -p "Opção [1-4] (inicia automaticamente em 8s): " default_choice || default_choice="1"
            echo ""
            default_choice="${default_choice:-1}"
            case "$default_choice" in
                2)
                    configure_wizard
                    exit 0
                    ;;
                3)
                    social_wizard
                    exit 0
                    ;;
                4)
                    echo "Operação cancelada."
                    exit 0
                    ;;
                *)
                    start_app "$@"
                    ;;
            esac
        else
            start_app "$@"
        fi
        ;;
esac
