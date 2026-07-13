FROM node:22-slim

# Устанавливаем pnpm внутри контейнера
RUN npm install -g pnpm

WORKDIR /app

# Сначала копируем манифесты зависимостей для кэширования слоев Docker
COPY frontend/package.json frontend/pnpm-lock.yaml* ./

# Ставим пакеты, игнорируя проблемные пост-скрипты msw
RUN pnpm install --ignore-scripts

# Копируем остальные файлы фронтенда
COPY frontend/ .

# Собираем продакшн-билд Next.js
RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
