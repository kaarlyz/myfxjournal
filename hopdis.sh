#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=======================================${NC}"
echo -e "${GREEN}  HOPDIS V2 - Universal Linux Migrator   ${NC}"
echo -e "${BLUE}=======================================${NC}"
echo "Pilih mode operasi:"
echo "1) Backup  (Bungkus AI, SSH, Config & Dev Tools)"
echo "2) Restore (Ekstrak ke OS Linux baru)"
echo "3) Exit"
read -p "Masukkan angka (1-3): " choice

if [ "$choice" == "1" ]; then
    echo -e "\n${BLUE}[*] Memulai proses Backup...${NC}"
    BACKUP_DIR="$HOME/hermes_backup"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/linux_state_complete_$(date +%Y%m%d).tar.gz"
    
    cd "$HOME"
    
    echo "Sedang memadatkan environment (Aman dari cache raksasa)..."
    tar --exclude='.hermes/cache' \
        --exclude='.hermes/logs' \
        --exclude='.hermes/runtime' \
        --exclude='.hermes/terminal-sessions' \
        --exclude='.hermes/sandboxes' \
        --exclude='.hermes/audio_cache' \
        --exclude='.hermes/image_cache' \
        --exclude='.npm' \
        --exclude='.cache' \
        -czf "$BACKUP_FILE" \
        .hermes .9router .gemini .config/opencode .config/systemd/user \
        .local/bin/agy .local/bin/nr-tokens .local/bin/cloudflared \
        .ssh .gitconfig .bashrc .zshrc .profile 2>/dev/null || true
        
    echo -e "${GREEN}[V] Backup selesai! File tersimpan di: $BACKUP_FILE${NC}"
    echo "PENTING: Pindahkan folder 'hermes_backup' dan 'Documents' ke Harddisk Eksternal!"

elif [ "$choice" == "2" ]; then
    echo -e "\n${BLUE}[*] Memulai proses Restore...${NC}"
    BACKUP_DIR="$HOME/hermes_backup"
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/linux_state_complete*.tar.gz 2>/dev/null | head -n 1)
    
    if [ -z "$LATEST_BACKUP" ]; then
        echo -e "${RED}[X] Tidak ditemukan file backup (linux_state_complete*.tar.gz) di $BACKUP_DIR!${NC}"
        exit 1
    fi
    
    echo "Mengekstrak $LATEST_BACKUP..."
    tar -xzf "$LATEST_BACKUP" -C "$HOME"
    
    echo "Memperbaiki izin akses folder SSH dan Binaries..."
    chmod 700 "$HOME/.ssh" 2>/dev/null || true
    chmod 600 "$HOME/.ssh/id_rsa" "$HOME/.ssh/id_ed25519" 2>/dev/null || true
    chmod +x "$HOME/.local/bin/"* 2>/dev/null || true
    
    echo "Mengonfigurasi Systemd & Linger (Zero-login autostart)..."
    loginctl enable-linger "$USER"
    systemctl --user daemon-reload
    systemctl --user enable --now hermes-gateway.service gemini-bridge.service 2>/dev/null || true
    
    echo -e "${GREEN}[V] Restore Sempurna!${NC}"
    echo "AI Agents (Hermes, Agy, 9router), kredensial GitHub, dan konfigurasi terminal sudah kembali normal."
else
    echo "Keluar."
fi
