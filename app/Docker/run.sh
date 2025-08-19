#!/bin/sh

# Initialize SQLite database
if [ ! -f /app/backend/db.sqlite ]; then
  echo "Initializing SQLite database..."
  node /app/backend/init/db_init.js
fi

# Start backend and frontend services
node /app/backend/server.js