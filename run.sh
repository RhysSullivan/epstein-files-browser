#!/usr/bin/env bash

GREEN=$(tput setaf 2)
YELLOW=$(tput setaf 3)
RED=$(tput setaf 1)
BOLD=$(tput bold)
NC=$(tput sgr0)


log_info() {
    echo -e "${YELLOW}--> $1${NC}"
}

log_success() {
    echo -e "${GREEN}${BOLD}✓ $1${NC}"
}

log_error() {
    echo -e "${RED}${BOLD}✗ Error: $1${NC}" >&2
}

show_progress() {
    local duration=$1
    local steps=20
    local sleep_interval
    sleep_interval=$(echo "$duration / $steps" | awk '{print $1 / $2}')

    for ((i=0; i<=steps; i++)); do
        local progress=$((i * 100 / steps))
        local done=$(printf "%${i}s" | tr ' ' '=')
        local left=$(printf "%$((steps - i))s" | tr ' ' ' ')
        printf "\r[${done}${left}] %d%%" "$progress"
        sleep 0.1
    done
    echo
}

execute_step() {
    local cmd=$1
    local desc=$2

    log_info "$desc"
    
    if eval "$cmd" > /dev/null 2>&1; then
        show_progress 1
        log_success "Completed: $desc"
    else
        log_error "Failed during: $desc"
        exit 1
    fi
}

main() {
    clear
    echo -e "${BOLD}Environment Setup & Update${NC}"
    echo "--------------------------------"

    execute_step "npm install -g bun" "Installing/Updating Bun runtime..."

    if [[ -f "package.json" ]]; then
        execute_step "bun update --latest" "Synchronizing dependencies..."
    else
        log_error "package.json not found in current directory."
        exit 1
    fi

    log_success "Environment is ready for development..."
    echo ""

    log_info "Launching development server..."
    bun run dev
}

main "$@"