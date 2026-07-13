FROM node:22-slim

# Устанавливаем pnpm внутри контейнера
RUN npm install -g pnpm

WORKDIR /app

# Контекст сборки — это уже папка frontend, поэтому копируем файлы из её корня
COPY package.json pnpm-lock.yaml* ./

# Ставим пакеты без проблемных пост-скриптов
RUN pnpm install --ignore-scripts

# Копируем всё остальное содержимое папки frontend
COPY . .

# Собираем продакшн-билд Next.js
RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
