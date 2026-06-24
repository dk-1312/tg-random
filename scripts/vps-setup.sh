#!/bin/bash
set -euo pipefail

# Запускать на VPS после git clone:
#   chmod +x scripts/vps-setup.sh
#   ./scripts/vps-setup.sh

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "==> Проверка Node.js..."
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установи Node 20:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "  sudo apt install -y nodejs"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Нужен Node.js 18+. Сейчас: $(node -v)"
  exit 1
fi

echo "==> Node $(node -v), npm $(npm -v)"

echo "==> Установка зависимостей..."
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

echo "==> Папка data..."
mkdir -p data

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "Создан .env — заполни его перед запуском:"
  echo "  nano .env"
  echo ""
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Установка PM2..."
  sudo npm install -g pm2
fi

echo "==> Запуск бота..."
pm2 start ecosystem.config.cjs
pm2 save

echo ""
echo "Готово. Полезные команды:"
echo "  pm2 status"
echo "  pm2 logs tg-random-bot"
echo "  pm2 restart tg-random-bot"
echo ""
echo "Автозапуск после перезагрузки сервера:"
echo "  pm2 startup"
echo "  (выполни команду, которую выведет pm2, затем снова: pm2 save)"
