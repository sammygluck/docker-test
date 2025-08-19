FROM node:24.3-alpine3.21

# Install dependencies
RUN apk update && \
	apk upgrade && \
	apk add --no-cache openssl

# Create directories
RUN mkdir -p /app/backend /app/frontend /app/ssl /app/db

# Generate SSL certificate
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
	-keyout /app/ssl/server.key \
	-out /app/ssl/server.cert \
	-subj "/C=BE/ST=Antwerp/L=Antwerp/O=Transcendence/OU=IT/CN=localhost"

# Copy backend and frontend code
COPY ./backend/ /app/backend
COPY ./frontend/ /app/frontend

# Install frontend dependencies, compile TypeScript, install and build Tailwind CSS
WORKDIR /app/frontend
RUN npm install && \
	npm install tailwindcss @tailwindcss/cli && \
	npx @tailwindcss/cli -i ./default.css -o ./styles.css && \
	npx tsc


# Install backend dependencies
WORKDIR /app/backend
RUN npm install && \
	npx tsc

COPY ./Docker/run.sh /var/run.sh
RUN chmod +x /var/run.sh

# Start services
ENTRYPOINT [ "/var/run.sh" ]