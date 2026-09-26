#!/usr/bin/env bash
set -e

# Warna buat output biar cakep
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=======================================${NC}"
echo -e "${GREEN}  HOPDIS - Hermes OS Migration Tool   ${NC}"
echo -e "${BLUE}=======================================${NC}"
echo "Pilih mode operasi:"
echo "1) Backup  (Bungkus Hermes & Dev Tools ke file tar.gz)"
echo "2) Restore (Ekstrak backup ke OS baru & setup systemd)"
echo "3) Exit"
read -p "Masukkan angka (1-3): " choice

if [ "$choice" == "1" ]; then
    echo -e "\n${BLUE}[*] Memulai proses Backup...${NC}"
    BACKUP_DIR="$HOME/hermes_backup"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/hermes_env_complete_$(date +%Y%m%d).tar.gz"
    
    cd "$HOME"
    
    echo "Sedang memadatkan file (mengabaikan cache dan logs)..."
    tar --exclude='.hermes/cache' \
        --exclude='.hermes/logs' \
        --exclude='.hermes/runtime' \
        --exclude='.hermes/terminal-sessions' \
        --exclude='.hermes/sandboxes' \
        --exclude='.hermes/audio_cache' \
        --exclude='.hermes/image_cache' \
        --exclude='.hermes/sessions' \
        --exclude='.hermes/hermes-agent' \
        -czf "$BACKUP_FILE" \
        .hermes .9router .gemini .config/opencode .config/systemd/user .local/bin/agy .local/bin/nr-tokens .local/bin/cloudflared 2>/dev/null || true
        
    echo -e "${GREEN}[V] Backup selesai! File tersimpan di: $BACKUP_FILE${NC}"
    echo "Silakan copy file tersebut ke flashdisk atau cloud."

elif [ "$choice" == "2" ]; then
    echo -e "\n${BLUE}[*] Memulai proses Restore...${NC}"
    BACKUP_DIR="$HOME/hermes_backup"
    
    # Cari file tar.gz terbaru di folder backup
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/hermes_env_complete*.tar.gz 2>/dev/null | head -n 1)
    
    if [ -z "$LATEST_BACKUP" ]; then
        echo -e "${RED}[X] Tidak ditemukan file backup (hermes_env_complete*.tar.gz) di $BACKUP_DIR!${NC}"
        echo "Pastikan file tar.gz sudah ditaruh di folder ~/hermes_backup/"
        exit 1
    fi
    
    echo "Ditemukan file backup: $LATEST_BACKUP"
    read -p "Apakah Anda yakin ingin mengekstrak ini ke $HOME? (y/n): " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Restore dibatalkan."
        exit 0
    fi
    
    echo "Mengekstrak file..."
    tar -xzf "$LATEST_BACKUP" -C "$HOME"
    
    echo "Memperbaiki izin akses executable..."
    chmod +x "$HOME/.local/bin/agy" "$HOME/.local/bin/nr-tokens" "$HOME/.local/bin/cloudflared" 2>/dev/null || true
    
    echo "Mengonfigurasi Systemd & Linger..."
    loginctl enable-linger "$USER"
    systemctl --user daemon-reload
    systemctl --user enable --now hermes-gateway.service gemini-bridge.service 2>/dev/null || true
    
    echo -e "${GREEN}[V] Restore selesai! Lingkungan Hermes siap digunakan.${NC}"
    echo "Pastikan ~/.local/bin sudah ada di dalam PATH ~/.bashrc Anda."

else
    echo "Keluar."
fi
