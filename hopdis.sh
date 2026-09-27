#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=======================================${NC}"
echo -e "${GREEN} HOPDIS V3 - Ultimate Zero-Touch Migrator ${NC}"
echo -e "${BLUE}=======================================${NC}"
echo "Pilih mode operasi:"
echo "1) Backup  (Bungkus SELURUH Projects, AI, SSH, & Env)"
echo "2) Restore (Ekstrak & hidupkan kembali di OS baru)"
echo "3) Exit"
read -p "Masukkan angka (1-3): " choice

if [ "$choice" == "1" ]; then
    echo -e "\n${BLUE}[*] Memulai proses Smart Backup...${NC}"
    BACKUP_DIR="$HOME/hopdis_backup"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/hopdis_ultimate_state_$(date +%Y%m%d).tar.gz"
    
    cd "$HOME"
    
    echo "Sedang memindai dan memadatkan seluruh data penting (Mengeksklusi sampah seperti node_modules)..."
    
    # Tarball command super pintar
    tar --exclude='.hermes/cache' \
        --exclude='.hermes/logs' \
        --exclude='.hermes/runtime' \
        --exclude='.hermes/terminal-sessions' \
        --exclude='.hermes/sandboxes' \
        --exclude='.hermes/audio_cache' \
        --exclude='.hermes/image_cache' \
        --exclude='.npm' \
        --exclude='.cache' \
        --exclude='node_modules' \
        --exclude='.next' \
        --exclude='dist' \
        --exclude='.vscode/extensions' \
        -czf "$BACKUP_FILE" \
        .hermes .9router .gemini .config/opencode .config/systemd/user \
        .local/bin/agy .local/bin/nr-tokens .local/bin/cloudflared \
        .ssh .gitconfig .bashrc .zshrc .profile \
        Documents/ 2>/dev/null || true
        
    echo -e "${GREEN}[V] Backup ULTIMATE selesai! File tersimpan di: $BACKUP_FILE${NC}"
    echo "UKURAN FILE BACKUP ANDA:"
    du -sh "$BACKUP_FILE"
    echo -e "\n${RED}PENTING: Pindahkan SATU FOLDER ini ('$BACKUP_DIR') ke Flashdisk Anda!${NC}"

elif [ "$choice" == "2" ]; then
    echo -e "\n${BLUE}[*] Memulai proses Restore...${NC}"
    BACKUP_DIR="$HOME/hopdis_backup"
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/hopdis_ultimate_state*.tar.gz 2>/dev/null | head -n 1)
    
    if [ -z "$LATEST_BACKUP" ]; then
        echo -e "${RED}[X] Tidak ditemukan file backup HOPDIS di $BACKUP_DIR!${NC}"
        echo "Pastikan Anda sudah men-copy folder 'hopdis_backup' dari Flashdisk ke Home folder Anda (~/)."
        exit 1
    fi
    
    echo "Mengekstrak seluruh ekosistem dari $LATEST_BACKUP..."
    tar -xzf "$LATEST_BACKUP" -C "$HOME"
    
    echo "Memperbaiki izin akses (Permissions)..."
    chmod 700 "$HOME/.ssh" 2>/dev/null || true
    chmod 600 "$HOME/.ssh/id_rsa" "$HOME/.ssh/id_ed25519" 2>/dev/null || true
    chmod +x "$HOME/.local/bin/"* 2>/dev/null || true
    
    echo "Mengonfigurasi Autostart (Systemd Linger)..."
    loginctl enable-linger "$USER" 2>/dev/null || true
    systemctl --user daemon-reload 2>/dev/null || true
    systemctl --user enable --now hermes-gateway.service gemini-bridge.service 2>/dev/null || true
    
    echo -e "${GREEN}[V] Restore Sempurna!${NC}"
    echo "Projects (Documents/), AI Agents, dan SSH telah kembali ke tempat asalnya."
    echo "Catatan: Karena 'node_modules' tidak di-backup, jalankan 'npm install' di dalam project Anda sebelum memulainya."
else
    echo "Keluar."
fi
